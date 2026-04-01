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

const PORT = process.env.PORT || 3001;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_room', (data = {}) => {
    const playerName = data.playerName || 'Host';
    const { room, player } = createRoom(socket.id, playerName);
    socket.join(room.code);
    socket.emit('room_created', { code: room.code, playerId: player.id, players: room.players });
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

  socket.on('set_game_options', ({ code, mode, totalRounds }) => {
    try {
      const room = setGameOptions(code, socket.id, mode, totalRounds);
      io.to(code).emit('options_updated', { mode: room.mode, totalRounds: room.totalRounds, customQuestions: room.customQuestions });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('add_custom_question', ({ code, text }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'lobby') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected) return;
    
    // Add custom question natively inside array
    if (text.trim().length > 0) {
      room.customQuestions.push({ id: `c-${room.customQuestions.length}`, text: text.trim() });
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

    io.to(code).emit('game_started', { round: room.currentRound, totalRounds: room.totalRounds });
    io.to(code).emit('new_question', { question: room.currentQuestion, round: room.currentRound, totalRounds: room.totalRounds });
  });

  socket.on('skip_question', ({ code }) => {
    // Allows host to grab a new question quickly
    const room = getRoom(code);
    if (!room || room.phase !== 'question') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    // Give a completely new question by grabbing 1 additional question
    const extraQ = selectQuestions(room.mode, 1, room.customQuestions);
    room.questions[room.currentQuestionIndex] = extraQ[0];
    room.currentQuestion = extraQ[0].text;
    room.answers = []; // Reset currently submitted answers

    // Broadcast new question update
    io.to(code).emit('new_question', { question: room.currentQuestion, round: room.currentRound, totalRounds: room.totalRounds });
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
    if (!currentAnswer) return;

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

  socket.on('reveal_answer', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'voting') return;
    
    // Only host should technically do this, but we'll accept it from the room
    const currentAnswer = room.answers[room.currentAnswerIndex];
    if (!currentAnswer) return;

    // Calculate incremental score for this answer
    room.scores = require('./game/gameLogic').calculateScores([currentAnswer], room.scores || {});

    io.to(code).emit('answer_revealed', {
      answer: { 
        text: currentAnswer.text,
        playerName: currentAnswer.playerName,
        playerId: currentAnswer.playerId,
        votes: currentAnswer.votes 
      },
      currentIndex: room.currentAnswerIndex,
      scores: room.scores
    });
  });

  socket.on('next_answer_request', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'voting') return;

    room.currentAnswerIndex++;
    if (room.currentAnswerIndex < room.answers.length) {
      io.to(code).emit('next_answer', { currentIndex: room.currentAnswerIndex });
    } else {
      room.phase = 'roundEnd';
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
        room.phase = 'question';

        io.to(code).emit('game_started', { round: room.currentRound, totalRounds: room.totalRounds });
        io.to(code).emit('new_question', { question: room.currentQuestion, round: room.currentRound, totalRounds: room.totalRounds });
      } else {
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
      io.to(room.code).emit('player_disconnected', { playerId: player.id, playerName: player.name });
      if (newHost) {
        io.to(room.code).emit('host_changed', { host: newHost.id });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
