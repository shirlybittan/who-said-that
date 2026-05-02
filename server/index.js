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
const { selectQuestions, selectSituationalQuestions, selectThisOrThatQuestions, selectDrawingQuestion, selectMixedQuestions, shuffleAnswers } = require('./game/gameLogic');
const mltPromptBank = require('./questions/mostLikelyTo');
const { words: drawWordBank, prompts: drawPrompts } = require('./questions/drawing');

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

// ─── Draw helpers ────────────────────────────────────────────────────────────

const pickDrawWord = (players) => {
  if (players && players.length > 0 && drawPrompts.length > 0 && Math.random() < 0.4) {
    const prompt = drawPrompts[Math.floor(Math.random() * drawPrompts.length)];
    const target = players[Math.floor(Math.random() * players.length)];
    return prompt.replace('{name}', target.name);
  }
  return drawWordBank[Math.floor(Math.random() * drawWordBank.length)];
};

const startDrawTimer = (io, room, code, seconds) => {
  if (room.draw.timerRef) { clearInterval(room.draw.timerRef); room.draw.timerRef = null; }
  room.draw.secondsLeft = seconds;
  room.draw.timerRef = setInterval(() => {
    if (!room.draw || room.draw.phase !== 'drawing') {
      clearInterval(room.draw.timerRef); room.draw.timerRef = null; return;
    }
    room.draw.secondsLeft = Math.max(0, room.draw.secondsLeft - 1);
    io.to(code).emit('draw:timer', { secondsLeft: room.draw.secondsLeft });
    if (room.draw.secondsLeft <= 0) {
      clearInterval(room.draw.timerRef); room.draw.timerRef = null;
      startDrawVoting(io, room, code);
    }
  }, 1000);
};

const startDrawVoting = (io, room, code) => {
  if (!room.draw || room.draw.phase !== 'drawing') return;
  room.draw.phase = 'voting';
  const submissions = Object.entries(room.draw.submissions).map(([playerId, sub]) => {
    const player = room.players.find(p => p.id === playerId);
    return { playerId, name: player?.name || 'Unknown', color: player?.color || '#fff', strokes: sub.strokes };
  });
  // Shuffle so submission order doesn't reveal authorship
  for (let i = submissions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [submissions[i], submissions[j]] = [submissions[j], submissions[i]];
  }
  io.to(code).emit('draw:voting_started', { submissions, round: room.draw.round, word: room.draw.word });
};

const resolveDrawVoting = (io, room, code) => {
  if (!room.draw || room.draw.phase !== 'voting') return;
  room.draw.phase = 'results';
  const playingPlayers = room.players.filter(p => p.isPlaying);
  // Tally votes
  const voteCounts = {};
  playingPlayers.forEach(p => { voteCounts[p.id] = 0; });
  Object.values(room.draw.votes).forEach(votedFor => { if (voteCounts[votedFor] !== undefined) voteCounts[votedFor]++; });
  // Add to running scores
  Object.entries(voteCounts).forEach(([pid, v]) => { room.draw.scores[pid] = (room.draw.scores[pid] || 0) + v; });
  const roundScores = { ...voteCounts };
  // Build sorted results
  const results = Object.entries(room.draw.submissions).map(([playerId, sub]) => {
    const player = room.players.find(p => p.id === playerId);
    return { playerId, name: player?.name || 'Unknown', color: player?.color || '#fff', strokes: sub.strokes, votes: voteCounts[playerId] || 0 };
  }).sort((a, b) => b.votes - a.votes);
  const leaderboard = playingPlayers
    .map(p => ({ id: p.id, name: p.name, color: p.color, score: room.draw.scores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);
  io.to(code).emit('draw:results', { results, scores: room.draw.scores, roundScores, round: room.draw.round, totalRounds: room.draw.totalRounds, leaderboard, word: room.draw.word });
};

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
  const votablePlayers = room.players.filter(p => p.isConnected && p.isPlaying);

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

  // Score every playing player
  room.players.filter(p => p.isConnected && p.isPlaying).forEach(voter => {
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
    players: room.players.filter(p => p.isConnected && p.isPlaying).map(p => ({ id: p.id, name: p.name, color: p.color })),
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

  tryAssign([...leaderboard].sort((a, b) => b.score - a.score), 'score', 1, '🔮 Top Predictor');         // highest score
  tryAssign([...leaderboard].sort((a, b) => a.score - b.score), 'score', 0, '😬 Worst Predictor');        // lowest score
  tryAssign([...leaderboard].sort((a, b) => b.wins - a.wins), 'wins', 1, '👑 Fan Favorite');              // most majority picks
  tryAssign([...leaderboard].sort((a, b) => b.totalVotes - a.totalVotes), 'totalVotes', 1, '🎯 Hot Topic'); // most votes received
  tryAssign([...leaderboard].sort((a, b) => a.totalVotes - b.totalVotes), 'totalVotes', 0, '🕵️ Under the Radar'); // fewest votes received

  leaderboard.forEach(p => { if (!p.title) p.title = '⚡ Dark Horse'; });
  return leaderboard;
};

const sendMltEnd = (io, room, code) => {
  room.mlt.roundState = 'end';
  room.phase = 'mltEnd';

  const connectedPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
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

// ─── Situational helpers ──────────────────────────────────────────────────────

// Pick the next non-host connected player to be the situational target (round-robin)
const pickSituationalTarget = (room) => {
  const eligible = room.players.filter(p => p.isConnected && p.isPlaying);
  if (eligible.length === 0) return null;
  const idx = room.sit.targetPlayerIndex % eligible.length;
  room.sit.targetPlayerIndex = (idx + 1) % eligible.length;
  return eligible[idx];
};

// Emit the right 'new_question' event for a WST/Situational question
const emitWstQuestion = (io, room, code) => {
  const q = room.questions[room.currentQuestionIndex];
  if (!q) return;

  const roundType = q.type || 'wst';
  let target = null;
  let questionText = typeof q.text === 'string' ? q.text : (q.text?.[room.lang || 'en'] || '');

  if (roundType === 'situational') {
    target = pickSituationalTarget(room);
    if (target) questionText = questionText.replace(/\{target\}/gi, target.name);
  }

  room.currentQuestion = questionText;
  room.answers = [];
  room.skipVotes = [];

  io.to(code).emit('new_question', {
    question: questionText,
    round: room.currentRound,
    totalRounds: room.totalRounds,
    roundType,
    target: target ? { id: target.id, name: target.name, color: target.color } : null,
  });
};

// Emit a This-or-That round prompt
const emitTotQuestion = (io, room, code) => {
  const q = room.questions[room.currentQuestionIndex];
  if (!q) return;

  room.tot.roundState = 'voting';
  room.tot.votesA = {};
  room.tot.votesB = {};
  room.tot.question = q;
  room.tot.a = q.a;
  room.tot.b = q.b;
  room.tot.round = room.currentRound;
  room.tot.totalRounds = room.totalRounds;

  io.to(code).emit('new_question', {
    question: q.text,
    round: room.currentRound,
    totalRounds: room.totalRounds,
    roundType: 'this-or-that',
    a: q.a,
    b: q.b,
  });
};

// Emit the next question for ANY game type (used after round-end in WST/Sit/Mixed)
const emitNextQuestion = (io, room, code) => {
  const q = room.questions[room.currentQuestionIndex];
  if (!q) return;

  // Let mid-round joiners participate from here on
  room.players.forEach(p => { p.joinedMidRound = false; });

  if (q.type === 'drawing') {
    room.phase = 'drawing';
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const drawScores = room.draw?.scores || {};
    playingPlayers.forEach(p => { if (drawScores[p.id] === undefined) drawScores[p.id] = 0; });
    room.draw = {
      phase: 'drawing',
      round: 1,
      totalRounds: 1,
      word: q.word || pickDrawWord(playingPlayers),
      timeLimit: 90,
      secondsLeft: 90,
      submissions: {},
      votes: {},
      scores: drawScores,
      timerRef: null,
      mixedMode: true,
    };
    const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.to(code).emit('draw:round_start', {
      word: room.draw.word,
      round: room.currentRound,
      totalRounds: room.totalRounds,
      timeLimit: room.draw.timeLimit,
      players,
    });
    startDrawTimer(io, room, code, room.draw.timeLimit);
  } else if (q.type === 'this-or-that') {
    room.phase = 'tot';
    emitTotQuestion(io, room, code);
  } else {
    room.phase = 'question';
    emitWstQuestion(io, room, code);
  }
};

// Close a ToT voting round and broadcast results
const closeTotRound = (io, room, code) => {
  room.tot.roundState = 'results';

  const connectedPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
  const countA = Object.keys(room.tot.votesA).length;
  const countB = Object.keys(room.tot.votesB).length;
  const total = countA + countB || 1;

  const pctA = Math.round((countA / total) * 100);
  const pctB = 100 - pctA;

  // Scoring: majority side gets +1
  const majorityChoice = countA >= countB ? 'a' : 'b';
  const tieRound = countA === countB;

  if (!tieRound) {
    const winners = majorityChoice === 'a' ? room.tot.votesA : room.tot.votesB;
    Object.keys(winners).forEach(pid => {
      room.tot.scores[pid] = (room.tot.scores[pid] || 0) + 1;
    });
  }

  // Build vote details list
  const voteDetails = connectedPlayers.map(p => ({
    playerId: p.id,
    name: p.name,
    color: p.color,
    choice: room.tot.votesA[p.id] ? 'a' : room.tot.votesB[p.id] ? 'b' : null,
  }));

  io.to(code).emit('tot:results', {
    a: room.tot.a,
    b: room.tot.b,
    countA,
    countB,
    pctA,
    pctB,
    majorityChoice: tieRound ? null : majorityChoice,
    voteDetails,
    scores: { ...room.tot.scores },
    players: connectedPlayers.map(p => ({ id: p.id, name: p.name, color: p.color })),
    round: room.currentRound,
    totalRounds: room.totalRounds,
  });
};

const assignTotTitles = (leaderboard) => {
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
  tryAssign([...leaderboard].sort((a, b) => b.score - a.score), 'score', 1, '🎯 Crowd Reader');
  tryAssign([...leaderboard].sort((a, b) => a.score - b.score), 'score', 0, '🤔 Lone Wolf');
  leaderboard.forEach(p => { if (!p.title) p.title = '⚡ Wildcard'; });
  return leaderboard;
};

// ─────────────────────────────────────────────────────────────────────────────

// ─── Situational helpers ─────────────────────────────────────────────────────

const closeSitVoting = (io, room, code) => {
  room.phase = 'sit-results';

  // Tally votes per answer (answerId = authorPlayerId)
  const voteCounts = {};
  room.answers.forEach(a => { voteCounts[a.playerId] = 0; });
  Object.values(room.sit.votes).forEach(authorId => {
    if (voteCounts[authorId] !== undefined) voteCounts[authorId]++;
  });

  const maxVotes = Math.max(...Object.values(voteCounts), 0);

  // Award 1 point to author(s) of most-voted answer
  if (maxVotes > 0) {
    room.answers.forEach(a => {
      if (voteCounts[a.playerId] === maxVotes) {
        room.scores[a.playerId] = (room.scores[a.playerId] || 0) + 1;
      }
    });
  }

  const answersWithDetails = room.answers.map(a => ({
    id: a.playerId,
    text: a.text,
    authorId: a.playerId,
    authorName: a.playerName,
    authorColor: room.players.find(p => p.id === a.playerId)?.color || '#888',
    votes: voteCounts[a.playerId] || 0,
  }));

  const scorePlayers = room.players
    .filter(p => p.isConnected && p.isPlaying)
    .map(p => ({ id: p.id, name: p.name, color: p.color }));

  io.to(code).emit('sit:results', {
    answers: answersWithDetails,
    scores: { ...room.scores },
    players: scorePlayers,
    winners: room.answers
      .filter(a => voteCounts[a.playerId] === maxVotes && maxVotes > 0)
      .map(a => a.playerId),
  });
};

// ─────────────────────────────────────────────────────────────────────────────

// Players who count toward round thresholds (connected, playing, not waiting for next round)
const activePlayers = (room) => room.players.filter(p => p.isConnected && p.isPlaying && !p.joinedMidRound);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_room', (data = {}) => {
    const playerName = data.playerName || 'Host';
    const gameType = data.gameType || 'most-likely-to';
    const gameName = (data.gameName || '').trim().slice(0, 40);
    const hostIsPlaying = !!data.hostIsPlaying;
    const { room, player } = createRoom(socket.id, playerName, gameType, gameName, hostIsPlaying);
    socket.join(room.code);
    socket.emit('room_created', { code: room.code, playerId: player.id, players: room.players, gameType: room.gameType, gameName: room.gameName, selectedSubGames: room.selectedSubGames, isPlaying: player.isPlaying });
  });

  socket.on('join_room', ({ code, playerName, playerId }) => {
    try {
      const { room, player, isRejoin } = joinRoom(code, socket.id, playerName, playerId);
      // Prevent cast/screen-mirror devices from counting as players
      if (!isRejoin) {
        const castNames = ['screen cast', 'chromecast', 'cast screen', 'google cast', 'firestick'];
        if (castNames.some(cn => (playerName || '').toLowerCase().includes(cn))) {
          player.isPlaying = false;
        }
      }
      socket.join(room.code);
      socket.emit('join_success', { room, playerId: player.id, isRejoin });
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
        selectedSubGames: room.selectedSubGames,
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

    if (room.players.filter(p => p.isConnected && p.isPlaying).length < 3) return;

    // MLT is started separately via mlt:start
    if (room.gameType === 'most-likely-to') return;

    const count = Math.max(1, room.totalRounds);
    room.currentRound = 1;
    room.currentQuestionIndex = 0;
    room.scores = {};
    room.sit.targetPlayerIndex = 0;

    if (room.gameType === 'situational') {
      room.questions = selectSituationalQuestions(count);
    } else if (room.gameType === 'this-or-that') {
      room.questions = selectThisOrThatQuestions(count);
      room.tot.scores = {};
      room.tot.round = 1;
      room.tot.totalRounds = count;
      room.phase = 'tot';
    } else if (room.gameType === 'mixed') {
      room.questions = selectMixedQuestions(count, room.mode, room.customQuestions, room.selectedSubGames);
      room.miniGameSelectedTypes = room.selectedSubGames || ['who-said-that', 'situational', 'this-or-that'];
      room.miniGamePlayedTypes = [];
    } else {
      // who-said-that
      room.questions = selectQuestions(room.mode, count, room.customQuestions);
    }

    io.to(code).emit('game_started', {
      round: room.currentRound,
      totalRounds: room.totalRounds,
      roundType: room.questions[0]?.type || 'wst',
    });

    emitNextQuestion(io, room, code);
  });

  socket.on('skip_question', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    const qType = room.questions[room.currentQuestionIndex]?.type || 'wst';

    if (qType === 'this-or-that' && room.phase === 'tot') {
      const [replacement] = selectThisOrThatQuestions(1);
      room.questions[room.currentQuestionIndex] = replacement;
      room.tot.votesA = {};
      room.tot.votesB = {};
      room.tot.roundState = 'voting';
      room.phase = 'tot';
      emitTotQuestion(io, room, code);
    } else if (qType === 'situational' && (room.phase === 'question' || room.phase === 'sit-voting' || room.phase === 'sit-results')) {
      const [replacement] = selectSituationalQuestions(1);
      room.questions[room.currentQuestionIndex] = replacement;
      room.answers = [];
      room.sit.votes = {};
      room.skipVotes = [];
      room.phase = 'question';
      emitWstQuestion(io, room, code);
    } else if (qType === 'wst' && (room.phase === 'question' || room.phase === 'voting')) {
      const [replacement] = selectQuestions(room.mode, 1, room.customQuestions);
      room.questions[room.currentQuestionIndex] = replacement;
      room.answers = [];
      room.skipVotes = [];
      room.phase = 'question';
      emitWstQuestion(io, room, code);
    }
  });

  socket.on('skip_mini_game', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    // Determine current mini-game type
    const currentType = room.questions[room.currentQuestionIndex]?.type || (room.phase === 'drawing' ? 'drawing' : null);
    if (!currentType) return;

    // Mark current type as played in this cycle
    if (!room.miniGamePlayedTypes) room.miniGamePlayedTypes = [];
    if (!room.miniGamePlayedTypes.includes(currentType)) {
      room.miniGamePlayedTypes.push(currentType);
    }

    // The full list of selected types for this mixed game
    const allTypes = room.miniGameSelectedTypes || room.selectedSubGames || [];

    // Find the next type: prefer unplayed types, then cycle through all types
    const unplayed = allTypes.filter(t => !room.miniGamePlayedTypes.includes(t) && t !== currentType);
    let nextType;
    if (unplayed.length > 0) {
      nextType = unplayed[Math.floor(Math.random() * unplayed.length)];
    } else {
      // All types played — reset cycle and pick any type different from current
      room.miniGamePlayedTypes = [currentType];
      const others = allTypes.filter(t => t !== currentType);
      if (others.length === 0) {
        // Only one game type, just skip to next question of same type
        nextType = currentType;
      } else {
        nextType = others[Math.floor(Math.random() * others.length)];
      }
    }

    // Normalize: 'who-said-that' → 'wst' for comparison
    const normalizeType = (t) => t === 'who-said-that' ? 'wst' : t;
    const targetType = normalizeType(nextType);

    // Reset any in-progress state for the current mini-game
    room.answers = [];
    room.skipVotes = [];
    room.sit = room.sit || {};
    room.sit.votes = {};
    room.tot = room.tot || {};
    room.tot.votesA = {};
    room.tot.votesB = {};
    if (room.phase === 'drawing' && room.draw?.timerRef) {
      clearInterval(room.draw.timerRef);
      room.draw.timerRef = null;
    }

    // Find next question of targetType in the pre-built list
    let nextIndex = room.currentQuestionIndex + 1;
    while (nextIndex < room.questions.length && normalizeType(room.questions[nextIndex]?.type) !== targetType) {
      nextIndex++;
    }

    if (nextIndex >= room.questions.length) {
      // No remaining question of target type — generate one and append
      let newQ;
      if (targetType === 'situational') {
        [newQ] = selectSituationalQuestions(1);
      } else if (targetType === 'this-or-that') {
        [newQ] = selectThisOrThatQuestions(1);
      } else if (targetType === 'drawing') {
        newQ = selectDrawingQuestion();
      } else {
        [newQ] = selectQuestions(room.mode, 1, room.customQuestions);
      }
      room.questions.push(newQ);
      room.totalRounds = room.questions.length;
    }

    room.currentRound = nextIndex + 1;
    room.currentQuestionIndex = nextIndex;
    emitNextQuestion(io, room, code);
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

    const connectedPlayersCount = activePlayers(room).length;
    if (room.skipVotes.length > connectedPlayersCount / 2) {
      const qType = room.questions[room.currentQuestionIndex]?.type || 'wst';
      const [replacement] = qType === 'situational'
        ? selectSituationalQuestions(1)
        : selectQuestions(room.mode, 1, room.customQuestions);
      room.questions[room.currentQuestionIndex] = replacement;
      room.answers = [];
      room.skipVotes = [];
      emitWstQuestion(io, room, code);
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
    if (!player || !player.isConnected || !player.isPlaying) return;

    if (!room.answers.find(a => a.playerId === player.id)) {
      room.answers.push({
        playerId: player.id,
        playerName: player.name,
        text,
        votes: []
      });
    }

    const connectedPlayersCount = activePlayers(room).length;
    io.to(code).emit('answer_received', { answeredCount: room.answers.length, totalPlayers: connectedPlayersCount });

    if (room.answers.length >= connectedPlayersCount) {
      room.answers = shuffleAnswers(room.answers);
      const q = room.questions[room.currentQuestionIndex];

      if (q?.type === 'situational') {
        // Situational: show all answers at once, vote for best
        room.phase = 'sit-voting';
        room.sit.votes = {};
        const mappedAnswers = room.answers.map(a => ({ id: a.playerId, text: a.text }));
        io.to(code).emit('sit:voting_started', {
          answers: mappedAnswers,
          question: room.currentQuestion,
          totalVoters: connectedPlayersCount,
        });
      } else {
        // WST: reveal one answer at a time, guess who wrote it
        room.phase = 'voting';
        room.currentAnswerIndex = 0;
        const mappedAnswers = room.answers.map(a => ({ text: a.text }));
        io.to(code).emit('voting_started', { answers: mappedAnswers, currentIndex: 0 });
      }
    }
  });

  socket.on('sit:vote', ({ code, answerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'sit-voting') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected || !player.isPlaying) return;

    if (answerId === player.id) return;           // can't vote own answer
    if (room.sit.votes[player.id]) return;        // already voted

    room.sit.votes[player.id] = answerId;

    const connectedPlayersCount = activePlayers(room).length;
    io.to(code).emit('sit:vote_received', {
      voteCount: Object.keys(room.sit.votes).length,
      totalVoters: connectedPlayersCount,
    });

    if (Object.keys(room.sit.votes).length >= connectedPlayersCount) {
      closeSitVoting(io, room, code);
    }
  });

  socket.on('sit:next', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'sit-results') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    room.phase = 'roundEnd';
    room.sit.votes = {};
    const numPlayers = room.players.filter(p => p.isPlaying).length;
    // Scores already updated in closeSitVoting — just broadcast round_ended
    io.to(code).emit('round_ended', { scores: room.scores, players: room.players, answers: room.answers, stats: {} });
  });

  socket.on('submit_vote', ({ code, votedPlayerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'voting') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected || !player.isPlaying) return;

    const currentAnswer = room.answers[room.currentAnswerIndex];
    if (!currentAnswer) return;      if (player.id === currentAnswer.playerId) return; // Prevent author from voting
    if (!currentAnswer.votes.find(v => v.voterId === player.id)) {
      currentAnswer.votes.push({
        voterId: player.id,
        votedForId: votedPlayerId
      });
    }

    const connectedPlayersCount = activePlayers(room).length;
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
      const numPlayers = room.players.filter(p => p.isPlaying).length;
      room.scores = require('./game/gameLogic').calculateScores(room.answers, room.scores || {}, numPlayers);

      io.to(code).emit('round_ended', { scores: room.scores, players: room.players, answers: room.answers, stats: {} });
    }
  });

  // Host-only: advance from round-end screen
  socket.on('ready_next_round', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'roundEnd') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (room.currentRound < room.totalRounds) {
      room.currentRound++;
      room.currentQuestionIndex++;
      emitNextQuestion(io, room, code);
    } else {
      room.phase = 'gameEnd';
      const finalStats = require('./game/gameLogic').computeStats(room.players, room.answers, room.scores);
      io.to(code).emit('game_ended', { finalScores: room.scores, players: room.players, stats: finalStats });
    }
  });

  // ─── This-or-That events ───────────────────────────────────────────────────

  socket.on('tot:vote', ({ code, choice }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'tot' || room.tot.roundState !== 'voting') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected || !player.isPlaying) return;

    const pid = player.id;
    // One vote per player
    if (room.tot.votesA[pid] || room.tot.votesB[pid]) return;

    if (choice === 'a') {
      room.tot.votesA[pid] = true;
    } else if (choice === 'b') {
      room.tot.votesB[pid] = true;
    } else {
      return;
    }

    const connectedPlayers = activePlayers(room);
    const voteCount = Object.keys(room.tot.votesA).length + Object.keys(room.tot.votesB).length;
    io.to(code).emit('tot:vote_received', { voteCount, totalVoters: connectedPlayers.length });

    if (voteCount >= connectedPlayers.length) {
      closeTotRound(io, room, code);
    }
  });

  socket.on('tot:next_round', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'tot') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (room.currentRound >= room.totalRounds) {
      // Game over
      if (room.gameType === 'this-or-that') {
        // Standalone ToT end
        const connectedPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
        let leaderboard = connectedPlayers.map(p => ({
          playerId: p.id,
          name: p.name,
          color: p.color,
          score: room.tot.scores[p.id] || 0,
        })).sort((a, b) => b.score - a.score);
        leaderboard = assignTotTitles(leaderboard);
        room.phase = 'totEnd';
        io.to(code).emit('tot:end', { leaderboard });
      } else {
        // Mixed game end
        room.phase = 'gameEnd';
        const finalStats = require('./game/gameLogic').computeStats(room.players, [], room.tot.scores);
        io.to(code).emit('game_ended', { finalScores: room.tot.scores, players: room.players, stats: finalStats });
      }
      return;
    }

    room.currentRound++;
    room.currentQuestionIndex++;
    emitNextQuestion(io, room, code);
  });

  socket.on('tot:skip', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'tot') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (room.currentRound >= room.totalRounds) {
      if (room.gameType === 'this-or-that') {
        const connectedPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
        let leaderboard = connectedPlayers.map(p => ({
          playerId: p.id,
          name: p.name,
          color: p.color,
          score: room.tot.scores[p.id] || 0,
        })).sort((a, b) => b.score - a.score);
        leaderboard = assignTotTitles(leaderboard);
        room.phase = 'totEnd';
        io.to(code).emit('tot:end', { leaderboard });
      } else {
        room.phase = 'gameEnd';
        io.to(code).emit('game_ended', { finalScores: room.tot.scores, players: room.players, stats: {} });
      }
      return;
    }

    room.currentRound++;
    room.currentQuestionIndex++;
    emitNextQuestion(io, room, code);
  });

  // ──────────────────────────────────────────────────────────────────────────

  // ─── Host screen spectator ──────────────────────────────────────────────────

  socket.on('join_spectator', ({ code } = {}) => {
    if (!code || typeof code !== 'string') { socket.emit('error', { message: 'Room code required' }); return; }
    const room = getRoom(code.toUpperCase().slice(0, 8));
    if (!room) { socket.emit('error', { message: 'Room not found' }); return; }

    socket.join(room.code);

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);

    socket.emit('spectator_joined', {
      room: {
        code: room.code,
        gameName: room.gameName,
        gameType: room.gameType,
        phase: room.phase,
        players: room.players,
        scores: room.scores,
        currentRound: room.currentRound,
        totalRounds: room.totalRounds,
        currentQuestion: room.currentQuestion,
        answersCount: room.answers?.length || 0,
        mlt: {
          prompt: room.mlt.currentPrompt,
          round: room.mlt.round,
          totalRounds: room.mlt.totalRounds,
          roundState: room.mlt.roundState,
          voteCount: Object.keys(room.mlt.votes || {}).length,
          totalVoters: playingPlayers.length,
          scores: room.mlt.scores,
          secondsLeft: room.mlt.secondsLeft,
          paused: room.mlt.paused,
        },
        tot: {
          question: room.tot.question?.text || '',
          a: room.tot.a || '',
          b: room.tot.b || '',
          round: room.tot.round,
          totalRounds: room.tot.totalRounds,
          voteCount: Object.keys(room.tot.votesA || {}).length + Object.keys(room.tot.votesB || {}).length,
          totalVoters: playingPlayers.length,
          scores: room.tot.scores,
        },
        sit: {
          question: room.currentQuestion || '',
          answers: room.answers?.map(a => ({ id: a.playerId, text: a.text })) || [],
          voteCount: Object.keys(room.sit.votes || {}).length,
          totalVoters: playingPlayers.length,
        },
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────

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

    // Let mid-round joiners participate from here on
    room.players.forEach(p => { p.joinedMidRound = false; });

    const connectedPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const nonHostPlayers = connectedPlayers; // since p.isPlaying excludes non-playing hosts
    if (nonHostPlayers.length < 2) return; // need at least 2 votable players

    const customMltPrompts = (room.customQuestions || []).map(q => q.text).filter(Boolean);
    const promptPool = customMltPrompts.length > 0
      ? [...customMltPrompts, ...mltPromptBank]
      : [...mltPromptBank];

    const totalRounds = Math.min(Math.max(parseInt(rounds) || 5, 1), promptPool.length);

    const shuffled = [...promptPool];
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
      allowSelfVote: true,
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
    if (!player || !player.isConnected || !player.isPlaying) return;

    // Self-vote is allowed — no guard needed

    // One vote per player per round
    if (room.mlt.votes[player.id] !== undefined) return;

    room.mlt.votes[player.id] = targetPlayerId;

    const nonHostPlayers = activePlayers(room);
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

    // Let mid-round joiners participate from here on
    room.players.forEach(p => { p.joinedMidRound = false; });

    const nonHostPlayers = room.players.filter(p => p.isConnected && p.isPlaying);

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
    if (!player || !player.isConnected || !player.isPlaying) return;

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

    // Let mid-round joiners participate from here on
    room.players.forEach(p => { p.joinedMidRound = false; });

    const nonHostPlayers = room.players.filter(p => p.isConnected && p.isPlaying);

    io.to(code).emit('mlt:prompt', {
      prompt: room.mlt.currentPrompt,
      round: room.mlt.round,
      totalRounds: room.mlt.totalRounds,
      players: nonHostPlayers.map(p => ({ id: p.id, name: p.name, color: p.color })),
      gameName: room.gameName,
    });

    startMltTimer(io, room, code, 30);
  });

  socket.on('mlt:restart', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mltEnd') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    // Clear any stale timer
    if (room.mlt.timerRef) { clearTimeout(room.mlt.timerRef); room.mlt.timerRef = null; }

    // Keep config from previous game
    const prevTotalRounds = room.mlt.totalRounds;
    // Reset room to lobby state
    room.phase = 'lobby';
    room.mlt = {
      roundState: 'waiting',
      currentPrompt: null,
      prompts: [],
      votes: {},
      scores: {},
      totalVotes: {},
      wins: {},
      jokers: {},
      jokersThisRound: {},
      round: 0,
      totalRounds: prevTotalRounds,
      allowSelfVote: true,
      paused: false,
      secondsLeft: 30,
      timerRef: null,
    };

    room.players.forEach(p => { p.isReady = false; });

    io.to(code).emit('mlt:restarted', {
      code: room.code,
      gameName: room.gameName,
      players: room.players,
      gameType: room.gameType,
    });
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

  // ─── Drawing (Sketch It!) handlers ────────────────────────────────────────

  socket.on('draw:start', ({ code, rounds }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    room.players.forEach(p => { p.joinedMidRound = false; });
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    if (playingPlayers.length < 2) return;

    const totalRounds = Math.min(Math.max(parseInt(rounds) || room.totalRounds || 3, 1), 10);
    const scores = {};
    playingPlayers.forEach(p => { scores[p.id] = 0; });

    room.phase = 'drawing';
    room.draw = {
      phase: 'drawing',
      round: 1,
      totalRounds,
      word: pickDrawWord(playingPlayers),
      timeLimit: 90,
      secondsLeft: 90,
      submissions: {},
      votes: {},
      scores,
      timerRef: null,
    };

    const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.to(code).emit('draw:round_start', {
      word: room.draw.word,
      round: room.draw.round,
      totalRounds: room.draw.totalRounds,
      timeLimit: room.draw.timeLimit,
      players,
    });
    startDrawTimer(io, room, code, room.draw.timeLimit);
  });

  socket.on('draw:submit', ({ code, strokes }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'drawing' || !room.draw || room.draw.phase !== 'drawing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying) return;
    if (room.draw.submissions[player.id]) return; // already submitted

    // Sanitize: cap strokes, cap points, validate hex color, limit width
    if (!Array.isArray(strokes)) return;
    const sanitized = strokes.slice(0, 500).map(s => ({
      color: /^#[0-9A-Fa-f]{3,6}$/.test(s.color) ? s.color : '#000000',
      width: Math.min(Math.max(Number(s.width) || 4, 1), 40),
      type: s.type === 'eraser' ? 'eraser' : 'pen',
      points: Array.isArray(s.points) ? s.points.slice(0, 300).map(p => ({
        x: Math.round(Number(p.x) || 0),
        y: Math.round(Number(p.y) || 0),
      })) : [],
    }));

    room.draw.submissions[player.id] = { strokes: sanitized, submittedAt: Date.now() };
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const submittedCount = Object.keys(room.draw.submissions).length;
    const submittedPlayerIds = Object.keys(room.draw.submissions);
    io.to(code).emit('draw:submission_received', { submittedCount, totalDrawers: playingPlayers.length, submittedPlayerIds });

    if (submittedCount >= playingPlayers.length) {
      if (room.draw.timerRef) { clearInterval(room.draw.timerRef); room.draw.timerRef = null; }
      startDrawVoting(io, room, code);
    }
  });

  socket.on('draw:skip_to_vote', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'drawing' || !room.draw || room.draw.phase !== 'drawing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    if (room.draw.timerRef) { clearInterval(room.draw.timerRef); room.draw.timerRef = null; }
    startDrawVoting(io, room, code);
  });

  socket.on('draw:vote', ({ code, votedForPlayerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'drawing' || !room.draw || room.draw.phase !== 'voting') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying) return;
    if (room.draw.votes[player.id]) return; // already voted
    if (votedForPlayerId === player.id) return; // no self-vote
    if (!room.draw.submissions[votedForPlayerId]) return; // must vote for a submission

    room.draw.votes[player.id] = votedForPlayerId;
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const voteCount = Object.keys(room.draw.votes).length;
    io.to(code).emit('draw:vote_received', { voteCount, totalVoters: playingPlayers.length });

    if (voteCount >= playingPlayers.length) {
      resolveDrawVoting(io, room, code);
    }
  });

  socket.on('draw:show_results', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'drawing' || !room.draw || room.draw.phase !== 'voting') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    resolveDrawVoting(io, room, code);
  });

  socket.on('draw:next_round', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'drawing' || !room.draw || room.draw.phase !== 'results') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (room.draw.round >= room.draw.totalRounds) {
      // In mixed mode, advance to the next question in the mixed game instead of ending
      if (room.draw.mixedMode) {
        room.currentQuestionIndex++;
        room.currentRound++;
        if (room.currentQuestionIndex >= room.questions.length) {
          room.phase = 'gameEnd';
          const { computeStats } = require('./game/gameLogic');
          const finalStats = computeStats(room.players, [], room.scores);
          io.to(code).emit('game_ended', { finalScores: room.scores, players: room.players, stats: finalStats });
        } else {
          emitNextQuestion(io, room, code);
        }
        return;
      }

      room.phase = 'drawEnd';
      const leaderboard = room.players.filter(p => p.isPlaying)
        .map(p => ({ id: p.id, name: p.name, color: p.color, score: room.draw.scores[p.id] || 0 }))
        .sort((a, b) => b.score - a.score);
      io.to(code).emit('draw:end', { leaderboard });
      return;
    }

    room.draw.round++;
    room.draw.phase = 'drawing';
    room.draw.word = pickDrawWord(room.players.filter(p => p.isConnected && p.isPlaying));
    room.draw.submissions = {};
    room.draw.votes = {};
    room.draw.secondsLeft = room.draw.timeLimit;

    const players = room.players.filter(p => p.isConnected && p.isPlaying).map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.to(code).emit('draw:round_start', {
      word: room.draw.word,
      round: room.draw.round,
      totalRounds: room.draw.totalRounds,
      timeLimit: room.draw.timeLimit,
      players,
    });
    startDrawTimer(io, room, code, room.draw.timeLimit);
  });

  socket.on('draw:restart', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    if (room.draw?.timerRef) { clearInterval(room.draw.timerRef); room.draw.timerRef = null; }
    room.phase = 'lobby';
    room.draw = { phase: 'waiting', round: 0, totalRounds: room.draw?.totalRounds || 3, word: null, submissions: {}, votes: {}, scores: {}, timerRef: null, secondsLeft: 90 };
    room.players.forEach(p => { p.isReady = false; });
    io.to(code).emit('draw:restarted', { code, players: room.players });
  });

  // ──────────────────────────────────────────────────────────────────────────
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
