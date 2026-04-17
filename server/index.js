const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const {
  createRoom,
  joinRoom,
  getRoom,
  getRoomBySocketId,
  removePlayerBySocketId,
  setGameOptions,
} = require('./game/roomManager');
const { selectQuestions, shuffleAnswers } = require('./game/gameLogic');
const mltPromptBank = require('./questions/mostLikelyTo');

const app = express();
app.use(cors());

app.get('/ping', (req, res) => res.json({ status: 'awake' }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for dev
    methods: ['GET', 'POST'],
  },
});

// ─── MLT helpers ─────────────────────────────────────────────────────────────

const closeMltVoting = (io, room, code) => {
  if (room.mlt.timerRef) {
    clearTimeout(room.mlt.timerRef);
    room.mlt.timerRef = null;
  }
  if (room.mlt.roundState !== 'voting') return;
  room.mlt.roundState = 'results';
  room.mlt.paused = false;

  // Only non-host players can be voted for
  const votablePlayers = room.players.filter(p => p.isConnected && !p.isHost);

  // Tally votes on votable players only
  const voteCounts = {};
  votablePlayers.forEach(p => { voteCounts[p.id] = 0; });
  Object.entries(room.mlt.votes).forEach(([, targetId]) => {
    if (voteCounts[targetId] !== undefined) {
      voteCounts[targetId]++;
      room.mlt.totalVotes[targetId] = (room.mlt.totalVotes[targetId] || 0) + 1;
    }
  });

  const totalVotesCount = Object.keys(room.mlt.votes).length;

  const results = votablePlayers.map(p => ({
    playerId: p.id,
    name: p.name,
    color: p.color,
    count: voteCounts[p.id] || 0,
    pct: totalVotesCount > 0 ? Math.round((voteCounts[p.id] || 0) / totalVotesCount * 100) : 0,
  })).sort((a, b) => b.count - a.count);

  // Option A: all tied top players count as majority
  const maxVotes = results[0]?.count || 0;
  const majorityPlayerIds = maxVotes > 0
    ? results.filter(r => r.count === maxVotes).map(r => r.playerId)
    : [];

  // Award wins & accumulate total-votes to majority players (already done above)
  majorityPlayerIds.forEach(id => {
    room.mlt.wins[id] = (room.mlt.wins[id] || 0) + 1;
  });

  // Score every connected player (including host who can vote)
  room.players.filter(p => p.isConnected).forEach(voter => {
    const votedFor = room.mlt.votes[voter.id];
    let points = 0;

    // +1 if voted for any majority player
    if (majorityPlayerIds.includes(votedFor)) {
      points += 1;
    }
    // Joker doubles total points (0 stays 0)
    if (points > 0 && room.mlt.jokersThisRound[voter.id]) {
      points *= 2;
    }
    if (points > 0) {
      room.mlt.scores[voter.id] = (room.mlt.scores[voter.id] || 0) + points;
    }
  });

  // Spend jokers that were active this round
  Object.keys(room.mlt.jokersThisRound).forEach(pid => {
    room.mlt.jokers[pid] = Math.max(0, (room.mlt.jokers[pid] ?? 2) - 1);
  });

  io.to(code).emit('mlt:results', {
    results,
    majorityPlayerIds,
    jokersUsed: Object.keys(room.mlt.jokersThisRound),
    scores: { ...room.mlt.scores },
    players: room.players.filter(p => p.isConnected && !p.isHost).map(p => ({ id: p.id, name: p.name, color: p.color })),
  });
};

const startMltTimer = (io, room, code, seconds) => {
  if (room.mlt.timerRef) {
    clearTimeout(room.mlt.timerRef);
    room.mlt.timerRef = null;
  }

  let remaining = seconds;
  room.mlt.secondsLeft = remaining;
  room.mlt.paused = false;

  const tick = () => {
    if (room.mlt.roundState !== 'voting' || room.mlt.paused) return;
    room.mlt.secondsLeft = remaining;
    io.to(code).emit('mlt:timer', { secondsLeft: remaining });
    if (remaining === 0) {
      closeMltVoting(io, room, code);
      return;
    }
    remaining--;
    room.mlt.timerRef = setTimeout(tick, 1000);
  };

  tick();
};

const assignMltTitles = (leaderboard) => {
  const titled = new Set();

  const tryAssign = (sorted, key, minVal, title) => {
    for (const entry of sorted) {
      if (!titled.has(entry.playerId) && entry[key] >= minVal) {
        entry.title = title;
        titled.add(entry.playerId);
        break;
      }
    }
  };

  tryAssign([...leaderboard].sort((a, b) => b.totalVotes - a.totalVotes), 'totalVotes', 1, '🌪️ Most Chaotic');
  tryAssign([...leaderboard].sort((a, b) => b.wins - a.wins), 'wins', 1, '🏆 Everyone Agrees');
  tryAssign([...leaderboard].sort((a, b) => b.score - a.score), 'score', 1, '🔮 Top Predictor');
  tryAssign([...leaderboard].sort((a, b) => a.totalVotes - b.totalVotes), 'totalVotes', 0, '🎭 The Wildcard');

  leaderboard.forEach(p => { if (!p.title) p.title = '✨ The Contender'; });
  return leaderboard;
};

const sendMltEnd = (io, room, code) => {
  room.mlt.roundState = 'end';
  room.phase = 'mltEnd';

  const connectedPlayers = room.players.filter(p => p.isConnected);
  let leaderboard = connectedPlayers.map(p => ({
    playerId: p.id,
    name: p.name,
    color: p.color,
    score: room.mlt.scores[p.id] || 0,
    totalVotes: room.mlt.totalVotes[p.id] || 0,
    wins: room.mlt.wins[p.id] || 0,
    title: null,
  })).sort((a, b) => b.score - a.score);

  leaderboard = assignMltTitles(leaderboard);
  io.to(code).emit('mlt:end', { leaderboard });
};

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_room', (data = {}) => {
    const playerName = data.playerName || 'Host';
    const gameType = data.gameType === 'who-said-that' ? 'who-said-that' : 'most-likely-to';
    const gameName = (data.gameName || '').trim().slice(0, 40);
    const { room, player } = createRoom(socket.id, playerName, gameType, gameName);
    socket.join(room.code);
    socket.emit('room_created', { code: room.code, playerId: player.id, players: room.players, gameType: room.gameType, gameName: room.gameName });
  });

  socket.on('join_room', ({ code, playerName, playerId }) => {
    try {
      const { room, player, isRejoin } = joinRoom(code, socket.id, playerName, playerId);
      socket.join(room.code);
      socket.emit('join_success', { room, playerId: player.id });
      socket.to(room.code).emit('player_joined', { players: room.players });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('set_game_options', ({ code, mode, totalRounds, gameType, mltRounds, allowSelfVote }) => {
    try {
      const room = setGameOptions(code, socket.id, mode, totalRounds, gameType, mltRounds, allowSelfVote);
      io.to(code).emit('options_updated', {
        mode: room.mode,
        totalRounds: room.totalRounds,
        customQuestions: room.customQuestions,
        gameType: room.gameType,
        mltTotalRounds: room.mlt.totalRounds,
        mltAllowSelfVote: room.mlt.allowSelfVote,
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('add_custom_question', ({ code, text, saveToBank }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'lobby') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected) return;
    
    // Add custom question natively inside array
    if (text.trim().length > 0) {
      room.customQuestions.push({ id: `c-${room.customQuestions.length}`, text: text.trim(), saveToBank: !!saveToBank });
      io.to(code).emit('custom_questions_updated', { customQuestions: room.customQuestions });
    }
  });

  socket.on('start_game', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    
    // Host check
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (room.players.filter(p => p.isConnected).length < 3) return;

    room.questions = selectQuestions(room.mode, room.totalRounds, room.customQuestions);
    room.phase = 'question';
    room.currentRound = 1;
    room.currentQuestionIndex = 0;
    room.currentQuestion = room.questions[0].text;
    room.answers = [];
    room.skipVotes = [];

    io.to(code).emit('game_started', { round: room.currentRound, totalRounds: room.totalRounds });
    io.to(code).emit('new_question', { question: room.currentQuestion, round: room.currentRound, totalRounds: room.totalRounds });
  });

  socket.on('skip_question', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'question') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    // Give a completely new question by grabbing 1 additional question
    const extraQ = selectQuestions(room.mode, 1, room.customQuestions);
    room.questions[room.currentQuestionIndex] = extraQ[0];
    room.currentQuestion = extraQ[0].text;
    room.answers = []; // Reset currently submitted answers
    room.skipVotes = [];

    // Broadcast new question update
    io.to(code).emit('new_question', { question: room.currentQuestion, round: room.currentRound, totalRounds: room.totalRounds });
  });

  socket.on('vote_skip_question', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'question') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected) return;

    if (!room.skipVotes) room.skipVotes = [];
    if (!room.skipVotes.includes(player.id)) {
      room.skipVotes.push(player.id);
    }

    const connectedPlayersCount = room.players.filter(p => p.isConnected).length;
    if (room.skipVotes.length > connectedPlayersCount / 2) {
      const extraQ = selectQuestions(room.mode, 1, room.customQuestions);
      room.questions[room.currentQuestionIndex] = extraQ[0];
      room.currentQuestion = extraQ[0].text;
      room.answers = []; 
      room.skipVotes = [];
      io.to(code).emit('new_question', { question: room.currentQuestion, round: room.currentRound, totalRounds: room.totalRounds });
    }
  });

  socket.on('kick_player', ({ code, targetPlayerId }) => {
    const room = getRoom(code);
    if (!room) return;
    const host = room.players.find(p => p.socketId === socket.id);
    if (!host || !host.isHost) return;

    const targetPlayerIndex = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetPlayerIndex !== -1) {
      const targetPlayer = room.players[targetPlayerIndex];
      const targetSocketId = targetPlayer.socketId;
      
      // Remove from room
      room.players.splice(targetPlayerIndex, 1);
      
      // Notify remaining players
      io.to(code).emit('player_joined', { players: room.players });
      
      // Disconnect the target player explicitly
      if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
        io.sockets.sockets.get(targetSocketId).emit('kicked');
        io.sockets.sockets.get(targetSocketId).disconnect(true);
      }
    }
  });

  socket.on('submit_answer', ({ code, text }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'question') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected) return;

    if (!room.answers.find(a => a.playerId === player.id)) {
      room.answers.push({
        playerId: player.id,
        playerName: player.name,
        text,
        votes: []
      });
    }

    const connectedPlayersCount = room.players.filter(p => p.isConnected).length;
    io.to(code).emit('answer_received', { answeredCount: room.answers.length, totalPlayers: connectedPlayersCount });

    if (room.answers.length >= connectedPlayersCount) {
      room.answers = shuffleAnswers(room.answers);
      room.phase = 'voting';
      room.currentAnswerIndex = 0;
      
      const mappedAnswers = room.answers.map(a => ({ text: a.text }));
      io.to(code).emit('voting_started', { answers: mappedAnswers, currentIndex: 0 });
    }
  });

  socket.on('submit_vote', ({ code, votedPlayerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'voting') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected) return;

    const currentAnswer = room.answers[room.currentAnswerIndex];
    if (!currentAnswer) return;      if (player.id === currentAnswer.playerId) return; // Prevent author from voting
    if (!currentAnswer.votes.find(v => v.voterId === player.id)) {
      currentAnswer.votes.push({
        voterId: player.id,
        votedForId: votedPlayerId
      });
    }

    const connectedPlayersCount = room.players.filter(p => p.isConnected).length;
    const expectedVotes = connectedPlayersCount - 1; // Author doesn't vote

    io.to(code).emit('vote_received', { votedCount: currentAnswer.votes.length, totalPlayers: expectedVotes });

    if (currentAnswer.votes.length >= expectedVotes) {
      io.to(code).emit('all_votes_in', { currentIndex: room.currentAnswerIndex });
    }
  });



  socket.on('next_answer_request', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'voting') return;

    room.currentAnswerIndex++;
    if (room.currentAnswerIndex < room.answers.length) {
      io.to(code).emit('next_answer', { currentIndex: room.currentAnswerIndex });
    } else {
      room.phase = 'roundEnd';
      // Calculate scores for the whole round now
      const numPlayers = room.players.length;
      room.scores = require('./game/gameLogic').calculateScores(room.answers, room.scores || {}, numPlayers);

      io.to(code).emit('round_ended', { scores: room.scores, players: room.players, answers: room.answers, stats: {} });
    }
  });

  socket.on('ready_next_round', ({ code, playerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'roundEnd') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected) return;

    player.isReady = true;
    
    // Announce to others so they can see "X/Y ready"
    const connectedPlayers = room.players.filter(p => p.isConnected);
    io.to(code).emit('players_ready', { readyCount: connectedPlayers.filter(p => p.isReady).length, totalPlayers: connectedPlayers.length });

    if (connectedPlayers.every(p => p.isReady)) {
      connectedPlayers.forEach(p => p.isReady = false);

      if (room.currentRound < room.totalRounds) {
        room.currentRound++;
        room.currentQuestionIndex++;
        room.currentQuestion = room.questions[room.currentQuestionIndex].text;
        room.answers = [];
          room.skipVotes = [];
        room.phase = 'gameEnd';
        const finalStats = require('./game/gameLogic').computeStats(room.players, room.answers, room.scores);
        io.to(code).emit('game_ended', { finalScores: room.scores, players: room.players, stats: finalStats });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const room = getRoomBySocketId(socket.id);
    if (room) {
      const { player, newHost } = removePlayerBySocketId(socket.id, false);
      // If an MLT timer is running and room is now empty, clean it up
      if (room.phase === 'mlt' && room.mlt.timerRef && room.players.filter(p => p.isConnected).length === 0) {
        clearTimeout(room.mlt.timerRef);
        room.mlt.timerRef = null;
      }
      io.to(room.code).emit('player_disconnected', { playerId: player.id, playerName: player.name });
      if (newHost) {
        io.to(room.code).emit('host_changed', { host: newHost.id });
      }
    }
  });

  // ─── Most Likely To events ─────────────────────────────────────────────────

  socket.on('mlt:start', ({ code, rounds, allowSelfVote }) => {
    const room = getRoom(code);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    const connectedPlayers = room.players.filter(p => p.isConnected);
    const nonHostPlayers = connectedPlayers.filter(p => !p.isHost);
    if (nonHostPlayers.length < 2) return; // need at least 2 votable players

    const totalRounds = Math.min(Math.max(parseInt(rounds) || 5, 1), mltPromptBank.length);

    const shuffled = [...mltPromptBank];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Init jokers: 2 per player per game
    const jokers = {};
    connectedPlayers.forEach(p => { jokers[p.id] = 2; });

    room.phase = 'mlt';
    room.mlt = {
      roundState: 'voting',
      prompts: shuffled.slice(0, totalRounds),
      currentPrompt: shuffled[0],
      votes: {},
      scores: {},
      totalVotes: {},
      wins: {},
      jokers,
      jokersThisRound: {},
      round: 1,
      totalRounds,
      allowSelfVote: !!allowSelfVote,
      paused: false,
      secondsLeft: 30,
      timerRef: null,
    };

    io.to(code).emit('mlt:prompt', {
      prompt: room.mlt.currentPrompt,
      round: room.mlt.round,
      totalRounds: room.mlt.totalRounds,
      players: nonHostPlayers.map(p => ({ id: p.id, name: p.name, color: p.color })),
      gameName: room.gameName,
      jokersLeft: 2,
    });

    startMltTimer(io, room, code, 30);
  });

  socket.on('mlt:vote', ({ code, targetPlayerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt' || room.mlt.roundState !== 'voting') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected || player.isHost) return;

    // Self-vote is allowed — no guard needed

    // One vote per player per round
    if (room.mlt.votes[player.id] !== undefined) return;

    room.mlt.votes[player.id] = targetPlayerId;

    const nonHostPlayers = room.players.filter(p => p.isConnected && !p.isHost);
    const voteCount = Object.keys(room.mlt.votes).length;
    const totalVoters = nonHostPlayers.length;

    io.to(code).emit('mlt:vote_received', { voteCount, totalVoters });

    if (voteCount >= totalVoters) {
      closeMltVoting(io, room, code);
    }
  });

  socket.on('mlt:next_round', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (room.mlt.round >= room.mlt.totalRounds) {
      sendMltEnd(io, room, code);
      return;
    }

    room.mlt.round++;
    room.mlt.currentPrompt = room.mlt.prompts[room.mlt.round - 1];
    room.mlt.votes = {};
    room.mlt.jokersThisRound = {};
    room.mlt.roundState = 'voting';
    room.mlt.paused = false;

    const nonHostPlayers = room.players.filter(p => p.isConnected && !p.isHost);

    io.to(code).emit('mlt:prompt', {
      prompt: room.mlt.currentPrompt,
      round: room.mlt.round,
      totalRounds: room.mlt.totalRounds,
      players: nonHostPlayers.map(p => ({ id: p.id, name: p.name, color: p.color })),
      gameName: room.gameName,
    });

    startMltTimer(io, room, code, 30);
  });

  socket.on('mlt:toggle_joker', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt' || room.mlt.roundState !== 'voting') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected) return;

    const pid = player.id;
    const remaining = room.mlt.jokers[pid] ?? 2;

    if (room.mlt.jokersThisRound[pid]) {
      // Toggle OFF — refund display (joker not yet spent until round closes)
      delete room.mlt.jokersThisRound[pid];
      socket.emit('mlt:joker_state', { jokerActive: false, jokersLeft: remaining });
    } else {
      // Toggle ON — must have jokers left
      if (remaining <= 0) return;
      room.mlt.jokersThisRound[pid] = true;
      socket.emit('mlt:joker_state', { jokerActive: true, jokersLeft: remaining - 1 });
    }
  });

  socket.on('mlt:skip', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    // Cancel timer
    if (room.mlt.timerRef) { clearTimeout(room.mlt.timerRef); room.mlt.timerRef = null; }

    // If this was the last round, go to end
    if (room.mlt.round >= room.mlt.totalRounds) {
      sendMltEnd(io, room, code);
      return;
    }

    // Move to next round without scoring
    room.mlt.round++;
    room.mlt.currentPrompt = room.mlt.prompts[room.mlt.round - 1];
    room.mlt.votes = {};
    room.mlt.jokersThisRound = {};
    room.mlt.roundState = 'voting';
    room.mlt.paused = false;

    const nonHostPlayers = room.players.filter(p => p.isConnected && !p.isHost);

    io.to(code).emit('mlt:prompt', {
      prompt: room.mlt.currentPrompt,
      round: room.mlt.round,
      totalRounds: room.mlt.totalRounds,
      players: nonHostPlayers.map(p => ({ id: p.id, name: p.name, color: p.color })),
      gameName: room.gameName,
    });

    startMltTimer(io, room, code, 30);
  });

  socket.on('mlt:pause', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt' || room.mlt.roundState !== 'voting') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (room.mlt.paused) return; // already paused

    if (room.mlt.timerRef) { clearTimeout(room.mlt.timerRef); room.mlt.timerRef = null; }
    room.mlt.paused = true;
    io.to(code).emit('mlt:paused', { secondsLeft: room.mlt.secondsLeft });
  });

  socket.on('mlt:resume', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt' || room.mlt.roundState !== 'voting') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (!room.mlt.paused) return; // not paused

    room.mlt.paused = false;
    io.to(code).emit('mlt:resumed', { secondsLeft: room.mlt.secondsLeft });
    startMltTimer(io, room, code, room.mlt.secondsLeft);
  });

  // ──────────────────────────────────────────────────────────────────────────
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
