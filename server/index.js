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
  touchRoom,
  evictStaleRooms,
} = require('./game/roomManager');
const { selectQuestions, selectSituationalQuestions, selectThisOrThatQuestions, selectDrawingQuestion, selectMixedQuestions, shuffleAnswers } = require('./game/gameLogic');
const { buildMiniGameSnapshot } = require('./game/miniGameSnapshot');
const mltPromptBank = require('./questions/mostLikelyTo');
const { words: drawWordBank, prompts: drawPrompts } = require('./questions/drawing');
const { selfiePrompts } = require('./questions/selfie');
const { isConfigured: storageConfigured, createPresignedUpload, getPublicBaseUrl } = require('./storage/photoStorage');

// ─── Per-player upload tokens (prevents unauthenticated presigned URL requests) ─
// A token is issued over the socket on join_success and required for the HTTP
// endpoint. Keys are unguessable UUIDs, values expire after 24h.
const { randomUUID: generateToken } = require('crypto');
const uploadTokens = new Map(); // token → { roomCode, playerId, expiresAt }

const issueUploadToken = (roomCode, playerId) => {
  const token = generateToken();
  uploadTokens.set(token, { roomCode, playerId, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return token;
};

const validateUploadToken = (token) => {
  const entry = uploadTokens.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { uploadTokens.delete(token); return null; }
  return entry;
};

// Periodically clean up expired tokens
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of uploadTokens) {
    if (now > entry.expiresAt) uploadTokens.delete(token);
  }
}, 60 * 60 * 1000);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/ping', (req, res) => res.json({ status: 'awake' }));

// ─── Presigned upload URL endpoint ───────────────────────────────────────────
// Returns a short-lived PUT URL so clients upload photos directly to cloud
// storage without routing binary data through the Node.js event loop.
app.post('/api/upload-photo-url', async (req, res) => {
  if (!storageConfigured()) {
    return res.status(503).json({ error: 'Storage not configured — use base64 flow' });
  }

  const { roomCode, playerId, mimeType, uploadToken } = req.body || {};
  if (!uploadToken) {
    return res.status(401).json({ error: 'uploadToken is required' });
  }

  // Validate the upload token — prevents unauthenticated bucket writes
  const tokenEntry = validateUploadToken(uploadToken);
  if (!tokenEntry) {
    return res.status(401).json({ error: 'Invalid or expired uploadToken' });
  }
  if (tokenEntry.roomCode !== roomCode || tokenEntry.playerId !== playerId) {
    return res.status(403).json({ error: 'Token does not match roomCode/playerId' });
  }

  const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const safeMime = validMimeTypes.includes(mimeType) ? mimeType : 'image/jpeg';

  // Validate that the room and player actually exist before issuing a URL
  const room = getRoom(roomCode);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const player = room.players.find(p => p.id === playerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  // Touch the room so it isn't evicted while the client is uploading
  touchRoom(roomCode);

  try {
    const { uploadUrl, publicUrl, objectKey } = await createPresignedUpload(roomCode, playerId, safeMime);
    res.json({ uploadUrl, publicUrl, objectKey });
  } catch (err) {
    console.error('[upload-photo-url]', err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for dev
    methods: ['GET', 'POST'],
  },
});

// ─── Global scoring ───────────────────────────────────────────────────────────

// Merge a {playerId: score} map into room.globalScores and broadcast update
const mergeToGlobalScores = (io, room, scores) => {
  if (!scores || typeof scores !== 'object') return;
  Object.entries(scores).forEach(([pid, pts]) => {
    if (typeof pts === 'number' && pts > 0) {
      room.globalScores[pid] = (room.globalScores[pid] || 0) + pts;
    }
  });
  const players = room.players.filter(p => p.isPlaying);
  const leaderboard = players
    .map(p => ({ id: p.id, name: p.name, color: p.color, score: room.globalScores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);
  io.to(room.code).emit('global_scores_updated', { globalScores: room.globalScores, leaderboard });
};

// ─── Room sanitizer ────────────────────────────────────────────────────────────
// Strips all Node.js timer handles (Timeout / Interval) from the room object
// before sending it to clients via Socket.io. JSON.stringify will throw a
// "Maximum call stack size exceeded" error when it encounters these because the
// internal Node.js Timeout objects have circular prototype chains.

const sanitizeRoomForClient = (room) => {
  const { answerTimerRef, timer, ...rest } = room;

  return {
    ...rest,
    tot: room.tot ? { ...room.tot, timerRef: undefined } : room.tot,
    mlt: room.mlt ? { ...room.mlt, timerRef: undefined } : room.mlt,
    draw: room.draw ? { ...room.draw, timerRef: undefined } : room.draw,
    fitb: room.fitb ? { ...room.fitb, timerRef: undefined } : room.fitb,
    dt: room.dt ? {
      ...room.dt,
      promptTimerRef: undefined,
      drawTimerRef: undefined,
      guessTimerRef: undefined,
      voteTimerRef: undefined,
      chains: Object.fromEntries(
        Object.entries(room.dt.chains || {}).map(([id, chain]) => [id, { ...chain, timerRef: undefined }])
      ),
    } : room.dt,
  };
};

// ─── Answer-phase timer (WST / Situational answering) ─────────────────────────

const stopAnswerTimer = (room) => {
  if (room.answerTimerRef) { clearInterval(room.answerTimerRef); room.answerTimerRef = null; }
};

const startAnswerTimer = (io, room, code, seconds, onExpire) => {
  stopAnswerTimer(room);
  room.answerSecondsLeft = seconds;
  room.answerPaused = false;
  io.to(code).emit('phase_timer', { secondsLeft: seconds, phase: 'answering' });
  room.answerTimerRef = setInterval(() => {
    if (room.phase !== 'question') { stopAnswerTimer(room); return; }
    if (room.answerPaused) return;
    room.answerSecondsLeft = Math.max(0, (room.answerSecondsLeft || 0) - 1);
    io.to(code).emit('phase_timer', { secondsLeft: room.answerSecondsLeft, phase: 'answering' });
    if (room.answerSecondsLeft <= 0) {
      stopAnswerTimer(room);
      onExpire();
    }
  }, 1000);
};

// ─── Draw helpers ─────────────────────────────────────────────────────────────

const pickDrawWord = () => {
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
  const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
  const submissions = Object.entries(room.draw.submissions).map(([playerId, sub]) => {
    const player = room.players.find(p => p.id === playerId);
    const word = room.draw.mode === 'secret' ? (room.draw.playerWords?.[playerId] || '?') : room.draw.word;
    return { playerId, name: player?.name || 'Unknown', color: player?.color || '#fff', strokes: sub.strokes, word };
  });
  // If nobody submitted a drawing, skip voting entirely and go straight to results
  if (submissions.length === 0) {
    resolveDrawVoting(io, room, code);
    return;
  }
  // Shuffle so submission order doesn't reveal authorship
  for (let i = submissions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [submissions[i], submissions[j]] = [submissions[j], submissions[i]];
  }
  io.to(code).emit('draw:voting_started', { submissions, round: room.draw.round, word: room.draw.word, mode: room.draw.mode || 'classic', totalVoters: playingPlayers.length });
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
    const word = room.draw.mode === 'secret' ? (room.draw.playerWords?.[playerId] || '?') : room.draw.word;
    return { playerId, name: player?.name || 'Unknown', color: player?.color || '#fff', strokes: sub.strokes, votes: voteCounts[playerId] || 0, word };
  }).sort((a, b) => b.votes - a.votes);
  const leaderboard = playingPlayers
    .map(p => ({ id: p.id, name: p.name, color: p.color, score: room.draw.scores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);
  io.to(code).emit('draw:results', { results, scores: room.draw.scores, roundScores, round: room.draw.round, totalRounds: room.draw.totalRounds, leaderboard, word: room.draw.word, mode: room.draw.mode || 'classic' });
};

// ─── ToT timer ───────────────────────────────────────────────────────────────

const stopTotTimer = (room) => {
  if (room.tot.timerRef) { clearTimeout(room.tot.timerRef); room.tot.timerRef = null; }
};

const startTotTimer = (io, room, code, seconds) => {
  stopTotTimer(room);
  let remaining = seconds;
  room.tot.secondsLeft = remaining;
  room.tot.paused = false;

  const tick = () => {
    if (room.phase !== 'tot' || room.tot.roundState !== 'voting' || room.tot.paused) {
      room.tot.timerRef = null;
      return;
    }
    room.tot.secondsLeft = remaining;
    io.to(code).emit('tot:timer', { secondsLeft: remaining });
    if (remaining === 0) {
      closeTotRound(io, room, code);
      return;
    }
    remaining--;
    room.tot.timerRef = setTimeout(tick, 1000);
  };

  tick();
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
    if (room.phase !== 'mlt' || room.mlt.roundState !== 'voting' || room.mlt.paused) {
      room.mlt.timerRef = null;
      return;
    }
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
  mergeToGlobalScores(io, room, room.mlt.scores);
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

  const roundDuration = room.roomConfig?.roundDurationSecs || 60;

  io.to(code).emit('new_question', {
    question: questionText,
    round: room.currentRound,
    totalRounds: room.totalRounds,
    roundType,
    target: target ? { id: target.id, name: target.name, color: target.color } : null,
    roundDuration,
    startedAt: Date.now(),
  });

  // Server-side answer timer — auto-starts voting when time expires (handles disconnected players)
  startAnswerTimer(io, room, code, roundDuration, () => {
    if (room.phase !== 'question') return;
    const connectedPlayersCount = activePlayers(room).length;
    // Auto-submit fallback for any player who didn't answer in time
    activePlayers(room).forEach(p => {
      if (!room.answers.find(a => a.playerId === p.id)) {
        const draft = (room.answerDrafts || {})[p.id] || '';
        room.answers.push({
          playerId: p.id,
          playerName: p.name,
          text: draft || "...",
          votes: [],
        });
      }
    });
    if (room.answers.length === 0) {
      // No one answered — skip to next question or end
      if (room.currentRound < room.totalRounds) {
        room.currentRound++;
        room.currentQuestionIndex++;
        emitNextQuestion(io, room, code);
      } else {
        room.phase = 'gameEnd';
        const finalStats = require('./game/gameLogic').computeStats(room.players, room.answers, room.scores);
        io.to(code).emit('game_ended', { finalScores: room.scores, players: room.players, stats: finalStats });
        mergeToGlobalScores(io, room, room.scores);
      }
      return;
    }
    const q = room.questions[room.currentQuestionIndex];
    room.answers = shuffleAnswers(room.answers);
    if (q?.type === 'situational') {
      room.phase = 'sit-voting';
      room.sit.votes = {};
      const mappedAnswers = room.answers.map(a => ({ id: a.playerId, text: a.text }));
      io.to(code).emit('sit:voting_started', {
        answers: mappedAnswers,
        question: room.currentQuestion,
        totalVoters: connectedPlayersCount,
      });
    } else {
      room.phase = 'voting';
      room.currentAnswerIndex = 0;
      const mappedAnswers = room.answers.map(a => ({ text: a.text }));
      const expectedVotes = connectedPlayersCount;
      io.to(code).emit('phase_timer', { secondsLeft: 0 }); // clear answering timer
      io.to(code).emit('voting_started', { answers: mappedAnswers, currentIndex: 0, totalPlayers: expectedVotes });
      room.answers.forEach((answer, idx) => {
        const authorPlayer = room.players.find(p => p.id === answer.playerId);
        if (authorPlayer?.socketId) {
          io.to(authorPlayer.socketId).emit('my_answer_index', { index: idx });
        }
      });
    }
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

  const timeLimit = room.roomConfig?.roundDurationSecs || 30;

  io.to(code).emit('new_question', {
    question: q.text,
    round: room.currentRound,
    totalRounds: room.totalRounds,
    roundType: 'this-or-that',
    a: q.a,
    b: q.b,
    timeLimit,
    secondsLeft: timeLimit,
  });

  startTotTimer(io, room, code, timeLimit);
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
      word: q.word || pickDrawWord(),
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
  stopTotTimer(room);
  room.tot.roundState = 'results';

  const connectedPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
  const countA = Object.keys(room.tot.votesA).length;
  const countB = Object.keys(room.tot.votesB).length;
  const total = countA + countB;

  const pctA = total === 0 ? 0 : Math.round((countA / total) * 100);
  const pctB = total === 0 ? 0 : 100 - pctA;

  // Scoring: majority side gets +1
  const tieRound = countA === countB;
  const majorityChoice = tieRound ? null : (countA > countB ? 'a' : 'b');

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

// Cancel all active game timers for a room (called before starting a new game)
function cancelAllTimers(room) {
  if (room.mlt?.timerRef) { clearTimeout(room.mlt.timerRef); room.mlt.timerRef = null; }
  if (room.draw?.timerRef) { clearInterval(room.draw.timerRef); room.draw.timerRef = null; }
  if (room.fitb?.timerRef) { clearTimeout(room.fitb.timerRef); room.fitb.timerRef = null; }
  if (room.fitb?.answerTimerRef) { clearTimeout(room.fitb.answerTimerRef); room.fitb.answerTimerRef = null; }
  // Cancel all per-chain drawing timers for draw-telephone
  if (room.dt?.chains) {
    for (const chain of Object.values(room.dt.chains)) {
      if (chain.timerRef) { clearInterval(chain.timerRef); chain.timerRef = null; }
    }
  }
  if (room.dt?.promptTimerRef) { clearTimeout(room.dt.promptTimerRef); room.dt.promptTimerRef = null; }
  if (room.dt?.guessTimerRef) { clearTimeout(room.dt.guessTimerRef); room.dt.guessTimerRef = null; }
  if (room.dt?.voteTimerRef) { clearTimeout(room.dt.voteTimerRef); room.dt.voteTimerRef = null; }
  stopAnswerTimer(room);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // ─── Auto-rejoin via handshake auth ────────────────────────────────────────
  // When a mobile player reconnects after a phone call / app switch, their
  // stored playerId + roomCode arrive in socket.handshake.auth. Remap them
  // immediately so they don't have to wait for the client to fire join_room.
  (() => {
    const { playerId, roomCode, playerName } = socket.handshake.auth || {};
    if (!playerId || !roomCode) return;
    try {
      const { room, player, isRejoin } = joinRoom(roomCode, socket.id, playerName || '', playerId);
      if (!isRejoin) return; // Only handle returning players here; fresh joins go through join_room
      touchRoom(roomCode);
      socket.join(room.code);
      const uploadToken = issueUploadToken(room.code, player.id);
      socket.emit('join_success', {
        room: sanitizeRoomForClient(room),
        playerId: player.id,
        isRejoin: true,
        uploadToken,
        miniGameState: buildMiniGameSnapshot(room, player.id, {
          dtPromptSeconds: DT_PROMPT_SECS,
          dtGuessSeconds: DT_GUESS_SECS,
          dtDrawSeconds: DT_DRAW_SECS,
          dtVoteSeconds: DT_VOTE_SECS,
        }),
      });
      socket.to(room.code).emit('player_reconnected', { playerId: player.id, playerName: player.name, players: room.players });
    } catch (_) {
      // Auth credentials no longer valid (room expired, etc.) — client will handle via join_room
    }
  })();

  socket.on('create_room', (data = {}) => {
    const playerName = data.playerName || 'Host';
    const gameType = data.gameType || 'most-likely-to';
    const gameName = (data.gameName || '').trim().slice(0, 40);
    const hostIsPlaying = !!data.hostIsPlaying;
    const roomConfig = data.roomConfig && typeof data.roomConfig === 'object' ? data.roomConfig : {};
    const { room, player } = createRoom(socket.id, playerName, gameType, gameName, hostIsPlaying, roomConfig);
    // Allow client to override which sub-games are active in a mixed game
    if (room.gameType === 'mixed' && Array.isArray(data.selectedSubGames) && data.selectedSubGames.length > 0) {
      const validSubs = ['who-said-that', 'situational', 'this-or-that', 'drawing'];
      room.selectedSubGames = data.selectedSubGames.filter(s => validSubs.includes(s));
    }
    if (room.gameType === 'mixed' && data.roundsPerSubGame) {
      room.mixedRoundsPerGame = Math.min(5, Math.max(1, parseInt(data.roundsPerSubGame, 10) || 1));
    }
    socket.join(room.code);
    socket.emit('room_created', { code: room.code, playerId: player.id, players: room.players, gameType: room.gameType, gameName: room.gameName, selectedSubGames: room.selectedSubGames, isPlaying: player.isPlaying, roomConfig: room.roomConfig, globalScores: room.globalScores });
  });

  socket.on('join_room', ({ code, playerName, playerId }) => {
    try {
      const { room, player, isRejoin } = joinRoom(code, socket.id, playerName, playerId);
      touchRoom(code);

      // Guard against double-join: if the handshake auto-rejoin already mapped this
      // socket to the room, skip the redundant player_joined broadcast. The client
      // still gets join_success (idempotent) so state syncs correctly.
      const alreadyInRoom = socket.rooms.has(room.code);

      // Prevent cast/screen-mirror devices from counting as players
      if (!isRejoin) {
        const castNames = ['screen cast', 'chromecast', 'cast screen', 'google cast', 'firestick'];
        if (castNames.some(cn => (playerName || '').toLowerCase().includes(cn))) {
          player.isPlaying = false;
        }
      }
      socket.join(room.code);
      const uploadToken = issueUploadToken(room.code, player.id);
      socket.emit('join_success', {
        room: sanitizeRoomForClient(room),
        playerId: player.id,
        isRejoin,
        uploadToken,
        miniGameState: buildMiniGameSnapshot(room, player.id, {
          dtPromptSeconds: DT_PROMPT_SECS,
          dtGuessSeconds: DT_GUESS_SECS,
          dtDrawSeconds: DT_DRAW_SECS,
          dtVoteSeconds: DT_VOTE_SECS,
        }),
      });
      // Only broadcast player_joined for new joins; skip if socket was already
      // in the room (handshake auto-rejoin already fired player_reconnected).
      if (!alreadyInRoom || !isRejoin) {
        socket.to(room.code).emit('player_joined', { players: room.players });
      }
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
      const mixedTypes = (room.selectedSubGames && room.selectedSubGames.length > 0)
        ? room.selectedSubGames
        : ['who-said-that', 'situational', 'this-or-that'];
      const roundsPerGame = room.mixedRoundsPerGame || 1;
      const mixedCount = mixedTypes.length * roundsPerGame;
      room.totalRounds = mixedCount;
      room.questions = selectMixedQuestions(mixedCount, room.mode, room.customQuestions, mixedTypes);
      room.miniGameSelectedTypes = mixedTypes;
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
      io.to(code).emit('question_changed', { code });
    } else if (qType === 'situational' && (room.phase === 'question' || room.phase === 'sit-voting' || room.phase === 'sit-results')) {
      stopAnswerTimer(room);
      const [replacement] = selectSituationalQuestions(1);
      room.questions[room.currentQuestionIndex] = replacement;
      room.answers = [];
      room.sit.votes = {};
      room.skipVotes = [];
      room.phase = 'question';
      emitWstQuestion(io, room, code);
      io.to(code).emit('question_changed', { code });
    } else if (qType === 'wst' && (room.phase === 'question' || room.phase === 'voting')) {
      stopAnswerTimer(room);
      const [replacement] = selectQuestions(room.mode, 1, room.customQuestions);
      room.questions[room.currentQuestionIndex] = replacement;
      room.answers = [];
      room.skipVotes = [];
      room.phase = 'question';
      emitWstQuestion(io, room, code);
      io.to(code).emit('question_changed', { code });
    }
  });

  socket.on('skip_mini_game', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    // For any non-mixed game mode — reset to lobby
    // Mixed-pack games fall through to the mini-game type switch logic below
    if (room.gameType !== 'mixed') {
      cancelAllTimers(room);
      room.phase = 'lobby';
      room.players.forEach(p => { p.isReady = false; });
      io.to(code).emit('game_changed', {
        code,
        gameType: room.gameType,
        players: room.players,
        gameName: room.gameName || '',
      });
      return;
    }

    const denormalizeType = (t) => t === 'wst' ? 'who-said-that' : t;
    const normalizeType = (t) => t === 'who-said-that' ? 'wst' : t;

    // Determine current mini-game type — fall back to phase inspection when question slot is ambiguous
    let rawCurrentType = room.questions[room.currentQuestionIndex]?.type;
    if (!rawCurrentType) {
      if (room.phase === 'drawing' || room.phase === 'drawEnd') rawCurrentType = 'drawing';
      else if (room.phase === 'tot') rawCurrentType = 'this-or-that';
      else if (room.phase === 'sit-voting' || room.phase === 'sit-results') rawCurrentType = 'situational';
      else if (room.phase === 'question' || room.phase === 'voting' || room.phase === 'roundEnd') rawCurrentType = 'wst';
    }

    if (!rawCurrentType) {
      // Unknown phase — reset to lobby as safe fallback
      cancelAllTimers(room);
      room.phase = 'lobby';
      room.players.forEach(p => { p.isReady = false; });
      io.to(code).emit('game_changed', {
        code,
        gameType: room.gameType,
        players: room.players,
        gameName: room.gameName || '',
      });
      return;
    }

    const currentType = denormalizeType(rawCurrentType);

    const allTypes = room.miniGameSelectedTypes || room.selectedSubGames || [];

    // Pick a different mini-game type at random
    const options = allTypes.filter(t => t !== currentType);
    const nextType = options.length > 0
      ? options[Math.floor(Math.random() * options.length)]
      : currentType;
    const targetType = normalizeType(nextType);

    // Reset in-progress state for the current mini-game
    cancelAllTimers(room);
    room.answers = [];
    room.skipVotes = [];
    room.sit = room.sit || {};
    room.sit.votes = {};
    room.tot = room.tot || {};
    room.tot.votesA = {};
    room.tot.votesB = {};

    // Generate a new question of the target type and replace the current slot in-place.
    // This keeps currentRound and totalRounds stable — no round inflation.
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
    room.questions[room.currentQuestionIndex] = newQ;

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

  socket.on('answer_draft', ({ code, text }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'question') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected || !player.isPlaying) return;
    if (!room.answerDrafts) room.answerDrafts = {};
    room.answerDrafts[player.id] = typeof text === 'string' ? text.trim().slice(0, 300) : '';
  });

  socket.on('submit_answer', ({ code, text }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'question') return;
    touchRoom(code);

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected || !player.isPlaying) return;

    const existingAnswer = room.answers.find(a => a.playerId === player.id);
    if (existingAnswer) {
      existingAnswer.text = text;
      existingAnswer.votes = [];
    } else {
      room.answers.push({
        playerId: player.id,
        playerName: player.name,
        text,
        votes: []
      });
    }

    const connectedPlayersCount = activePlayers(room).length;
    io.to(code).emit('answer_received', { answeredCount: room.answers.length, totalPlayers: connectedPlayersCount, answeredPlayerIds: room.answers.map(a => a.playerId) });

    if (room.answers.length >= connectedPlayersCount) {
      stopAnswerTimer(room);
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
        const expectedVotes = connectedPlayersCount;
        io.to(code).emit('phase_timer', { secondsLeft: 0 }); // clear answering timer
        io.to(code).emit('voting_started', { answers: mappedAnswers, currentIndex: 0, totalPlayers: expectedVotes });
        room.answers.forEach((answer, idx) => {
          const authorPlayer = room.players.find(p => p.id === answer.playerId);
          if (authorPlayer?.socketId) {
            io.to(authorPlayer.socketId).emit('my_answer_index', { index: idx });
          }
        });
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
    const voteCount = Object.keys(room.sit.votes).length;
    io.to(code).emit('sit:vote_received', {
      voteCount,
      totalVoters: connectedPlayersCount,
      votedPlayerIds: Object.keys(room.sit.votes),
    });

    // Close when all active players have voted, OR when all answer-authors have
    // received a vote tally (covers edge cases where activePlayers count shifts).
    const allVoted = activePlayers(room).every(p => room.sit.votes[p.id]);
    if (voteCount >= connectedPlayersCount || allVoted) {
      closeSitVoting(io, room, code);
    }
  });

  socket.on('sit:next', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'sit-results') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    room.sit.votes = {};
    // Skip round-end phase — go directly to next question or end the game
    if (room.currentRound < room.totalRounds) {
      room.currentRound++;
      room.currentQuestionIndex++;
      emitNextQuestion(io, room, code);
    } else {
      room.phase = 'gameEnd';
      const finalStats = require('./game/gameLogic').computeStats(room.players, room.answers, room.scores);
      io.to(code).emit('game_ended', { finalScores: room.scores, players: room.players, stats: finalStats });
      mergeToGlobalScores(io, room, room.scores);
    }
  });

  socket.on('submit_vote', ({ code, votedPlayerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'voting') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected || !player.isPlaying) return;

    const currentAnswer = room.answers[room.currentAnswerIndex];
    if (!currentAnswer) return;      const connectedPlayersCount = activePlayers(room).length;
    const expectedVotes = connectedPlayersCount; 

    // allow author to fake vote, record it so they look identical to others
    if (!currentAnswer.votes.find(v => v.voterId === player.id)) {
      currentAnswer.votes.push({
        voterId: player.id,
        votedForId: votedPlayerId,
        isAuthorFakeVote: player.id === currentAnswer.playerId
      });
    }

    io.to(code).emit('vote_received', { votedCount: currentAnswer.votes.length, totalPlayers: expectedVotes, votedPlayerIds: currentAnswer.votes.map(v => v.voterId) });
    console.log(`[Server] WST vote: ${currentAnswer.votes.length}/${expectedVotes} room=${code}`);

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
      mergeToGlobalScores(io, room, room.scores);
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
    io.to(code).emit('tot:vote_received', { voteCount, totalVoters: connectedPlayers.length, votedPlayerIds: [...Object.keys(room.tot.votesA), ...Object.keys(room.tot.votesB)] });

    // Close when all active players have voted (covers activePlayers count drift).
    const allVoted = connectedPlayers.every(p => room.tot.votesA[p.id] || room.tot.votesB[p.id]);
    if (voteCount >= connectedPlayers.length || allVoted) {
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
        mergeToGlobalScores(io, room, room.tot.scores);
      } else {
        // Mixed game end
        room.phase = 'gameEnd';
        const finalStats = require('./game/gameLogic').computeStats(room.players, [], room.tot.scores);
        io.to(code).emit('game_ended', { finalScores: room.tot.scores, players: room.players, stats: finalStats });
        mergeToGlobalScores(io, room, room.tot.scores);
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
        mergeToGlobalScores(io, room, room.tot.scores);
      } else {
        room.phase = 'gameEnd';
        io.to(code).emit('game_ended', { finalScores: room.tot.scores, players: room.players, stats: {} });
        mergeToGlobalScores(io, room, room.tot.scores);
      }
      return;
    }

    stopTotTimer(room);
    room.currentRound++;
    room.currentQuestionIndex++;
    emitNextQuestion(io, room, code);
  });

  // Change the current question without advancing the round counter
  socket.on('tot:change_question', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'tot') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    stopTotTimer(room);
    // Swap in a replacement question from the pool without incrementing round
    const usedIndexes = new Set();
    for (let i = 0; i <= room.currentQuestionIndex; i++) usedIndexes.add(i);

    // Find next unused question of type 'this-or-that' in the list
    let nextIdx = -1;
    for (let i = room.currentQuestionIndex + 1; i < room.questions.length; i++) {
      if (room.questions[i].type === 'this-or-that' || room.questions[i].a) {
        nextIdx = i;
        break;
      }
    }
    if (nextIdx === -1) {
      // No replacement available; just re-emit same question
      emitTotQuestion(io, room, code);
      return;
    }
    // Swap the question at currentQuestionIndex with the new one
    const replacement = room.questions[nextIdx];
    room.questions[nextIdx] = room.questions[room.currentQuestionIndex];
    room.questions[room.currentQuestionIndex] = replacement;
    emitTotQuestion(io, room, code);
  });

  socket.on('tot:pause', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'tot' || room.tot.roundState !== 'voting') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    stopTotTimer(room);
    room.tot.paused = true;
    io.to(code).emit('tot:paused', { secondsLeft: room.tot.secondsLeft });
  });

  socket.on('tot:resume', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'tot' || room.tot.roundState !== 'voting') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    room.tot.paused = false;
    io.to(code).emit('tot:resumed', { secondsLeft: room.tot.secondsLeft });
    startTotTimer(io, room, code, room.tot.secondsLeft);
  });

  socket.on('answer:pause', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'question') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    room.answerPaused = true;
    io.to(code).emit('phase_timer', { secondsLeft: room.answerSecondsLeft, phase: 'answering', paused: true });
  });

  socket.on('answer:resume', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'question') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    room.answerPaused = false;
    io.to(code).emit('phase_timer', { secondsLeft: room.answerSecondsLeft, phase: 'answering', paused: false });
  });

  // ──────────────────────────────────────────────────────────────────────────

  // ─── Host screen spectator ──────────────────────────────────────────────────

  socket.on('join_spectator', ({ code } = {}) => {
    if (!code || typeof code !== 'string') { socket.emit('error', { message: 'Room code required' }); return; }
    const room = getRoom(code.toUpperCase().slice(0, 8));
    if (!room) { socket.emit('error', { message: 'Room not found' }); return; }

    socket.join(room.code);

    // Transfer host socket to this TV/host-screen connection so all host-guarded
    // events work regardless of whether the room was created from this socket.
    const hostPlayer = room.players.find(p => p.isHost);
    if (hostPlayer) {
      hostPlayer.socketId = socket.id;
      hostPlayer.isConnected = true;
    }

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
          secondsLeft: room.tot.secondsLeft ?? 0,
          paused: !!room.tot.paused,
        },
        sit: {
          question: room.currentQuestion || '',
          answers: room.answers?.map(a => ({ id: a.playerId, text: a.text })) || [],
          voteCount: Object.keys(room.sit.votes || {}).length,
          totalVoters: playingPlayers.length,
        },
        // WST voting state (for reconnect recovery)
        voting: room.phase === 'voting' ? {
          answers: (room.answers || []).map(a => ({ text: a.text })),
          currentIndex: room.currentAnswerIndex || 0,
          voteCount: (room.answers?.[room.currentAnswerIndex]?.votes || []).length,
          totalPlayers: playingPlayers.length,
          votedPlayerIds: (room.answers?.[room.currentAnswerIndex]?.votes || []).map(v => v.voterId),
        } : null,
        // WST answering phase (answer submission count)
        answeredCount: room.phase === 'question' ? (room.answers || []).length : 0,
        // FITB state (for reconnect recovery — both answering and voting phases)
        fitb: room.phase === 'fitb' ? {
          phase: room.fitb.phase,
          question: room.fitb.question || '',
          answers: room.fitb.phase === 'voting' ? (room.fitb.answers || []).map((a, i) => ({ id: i, text: a.text })) : [],
          voteCount: Object.keys(room.fitb._votes || {}).length,
          totalVoters: playingPlayers.length,
          votedPlayerIds: Object.keys(room.fitb._votes || {}),
          answeredCount: (room.fitb.answers || []).length,
          totalAnswerers: playingPlayers.length,
          answeredPlayerIds: (room.fitb.answers || []).map(a => a.playerId),
        } : null,
        // Draw state — includes both drawing (submission) and voting phase details
        draw: room.phase === 'drawing' ? {
          phase: room.draw?.phase || 'drawing',
          submittedCount: Object.keys(room.draw?.submissions || {}).length,
          totalDrawers: playingPlayers.length,
          submittedPlayerIds: Object.keys(room.draw?.submissions || {}),
          voteCount: Object.keys(room.draw?.votes || {}).length,
          totalVoters: playingPlayers.length,
          votedPlayerIds: Object.keys(room.draw?.votes || {}),
        } : null,
        // Selfie state (for reconnect recovery)
        selfie: room.phase === 'selfie' ? {
          phase: room.selfie.phase,
          photoCount: Object.keys(room.selfie.photos || {}).length,
          totalPhotographers: playingPlayers.length,
          submittedPlayerIds: Object.keys(room.selfie.photos || {}),
          drawingCount: Object.keys(room.selfie.strokes || {}).length,
          totalDrawers: playingPlayers.length,
          drawnPlayerIds: Object.keys(room.selfie.strokes || {}),
          voteCount: Object.keys(room.selfie.votes || {}).length,
          totalVoters: playingPlayers.length,
          votedPlayerIds: Object.keys(room.selfie.votes || {}),
        } : null,
        // Caption state (for reconnect recovery)
        caption: room.phase === 'caption' ? {
          phase: room.caption.phase,
          captionCount: Object.keys(room.caption.captions || {}).length,
          totalWriters: playingPlayers.length,
          captionSubmittedPlayerIds: Object.keys(room.caption.captions || {}),
          voteCount: Object.keys(room.caption.votes || {}).length,
          totalVoters: playingPlayers.length,
          votedPlayerIds: Object.keys(room.caption.votes || {}),
        } : null,
        // PhotoVote (pmatch / photoassoc) state (for reconnect recovery)
        photoVote: room.phase === 'photovote' ? {
          phase: room.photoVote?.phase || 'photo',
          submittedPlayerIds: Object.keys(room.photoVote?.photos || {}),
          voteCount: Object.keys(room.photoVote?.votes || {}).length,
          totalVoters: playingPlayers.length,
          votedPlayerIds: Object.keys(room.photoVote?.votes || {}),
        } : null,
        // DrawTel state (for reconnect recovery)
        dt: (room.phase === 'dt' || room.phase?.startsWith('dt-')) ? {
          phase: room.dt.phase,
          promptsSubmittedCount: (room.dt.prompts || []).length,
          totalPrompts: playingPlayers.length,
          submittedPlayerIds: (room.dt.prompts || []).map(p => p.authorId).filter(Boolean),
          guessedCount: Object.keys(room.dt.guesses || {}).length,
          totalGuessers: playingPlayers.length,
          guessedPlayerIds: Object.keys(room.dt.guesses || {}),
        } : null,
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

    cancelAllTimers(room);
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
    touchRoom(code);

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isConnected || !player.isPlaying) return;

    // Self-vote is allowed — no guard needed

    // One vote per player per round
    if (room.mlt.votes[player.id] !== undefined) return;

    room.mlt.votes[player.id] = targetPlayerId;

    const nonHostPlayers = activePlayers(room);
    const voteCount = Object.keys(room.mlt.votes).length;
    const totalVoters = nonHostPlayers.length;

    io.to(code).emit('mlt:vote_received', { voteCount, totalVoters, votedPlayerIds: Object.keys(room.mlt.votes) });

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

  // Replace current prompt without advancing round number
  socket.on('mlt:change_question', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (room.mlt.timerRef) { clearTimeout(room.mlt.timerRef); room.mlt.timerRef = null; }

    // Pick a new prompt not already used — draw from full bank to avoid same question
    const usedPrompts = new Set(room.mlt.prompts.slice(0, room.mlt.round - 1));
    const currentPrompt = room.mlt.currentPrompt;
    const customMltPrompts = (room.customQuestions || []).map(q => q.text).filter(Boolean);
    const fullBank = customMltPrompts.length > 0 ? [...customMltPrompts, ...mltPromptBank] : [...mltPromptBank];
    const freshPool = fullBank.filter(p => p !== currentPrompt && !usedPrompts.has(p));
    const pool = freshPool.length > 0 ? freshPool : fullBank.filter(p => p !== currentPrompt);
    // fallback: any prompt from full bank
    const candidate = (pool.length > 0 ? pool : fullBank)[Math.floor(Math.random() * (pool.length > 0 ? pool : fullBank).length)];

    room.mlt.currentPrompt = candidate;
    room.mlt.prompts[room.mlt.round - 1] = candidate;
    room.mlt.votes = {};
    room.mlt.jokersThisRound = {};
    room.mlt.roundState = 'voting';
    room.mlt.paused = false;

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

  socket.on('draw:start', ({ code, rounds, mode }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    cancelAllTimers(room);
    room.players.forEach(p => { p.joinedMidRound = false; });
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    if (playingPlayers.length < 2) return;

    const totalRounds = Math.min(Math.max(parseInt(rounds) || room.totalRounds || 3, 1), 10);
    const drawMode = mode === 'secret' ? 'secret' : 'classic';
    const scores = {};
    playingPlayers.forEach(p => { scores[p.id] = 0; });

    room.phase = 'drawing';
    room.draw = {
      phase: 'drawing',
      round: 1,
      totalRounds,
      word: drawMode === 'classic' ? pickDrawWord() : null,
      timeLimit: 90,
      secondsLeft: 90,
      submissions: {},
      votes: {},
      scores,
      timerRef: null,
      mode: drawMode,
      skipCount: 0,
      playerWords: {},
    };

    const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));

    if (drawMode === 'secret') {
      // Assign each player a unique word
      const shuffled = [...drawWordBank].sort(() => Math.random() - 0.5);
      playingPlayers.forEach((p, i) => {
        room.draw.playerWords[p.id] = shuffled[i % shuffled.length];
      });
      // Broadcast round start without word (host/spectators)
      io.to(code).emit('draw:round_start', { word: null, round: 1, totalRounds: room.draw.totalRounds, timeLimit: room.draw.timeLimit, players, mode: 'secret' });
      // Send personalized word to each player
      playingPlayers.forEach(p => {
        if (p.socketId) io.to(p.socketId).emit('draw:secret_word', { word: room.draw.playerWords[p.id] });
      });
    } else {
      io.to(code).emit('draw:round_start', {
        word: room.draw.word,
        round: room.draw.round,
        totalRounds: room.draw.totalRounds,
        timeLimit: room.draw.timeLimit,
        players,
        mode: 'classic',
      });
    }
    startDrawTimer(io, room, code, room.draw.timeLimit);
  });

  socket.on('draw:skip_word', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'drawing' || !room.draw || room.draw.phase !== 'drawing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || (!player.isPlaying && !player.isHost)) return;

    // Players have a skip count limit; the host TV can always change the word
    const isHostAction = player.isHost && !player.isPlaying;
    if (!isHostAction) {
      const MAX_SKIPS = 2;
      if (!room.draw.skipCount) room.draw.skipCount = 0;
      if (room.draw.skipCount >= MAX_SKIPS) return;
      room.draw.skipCount++;
    }

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);

    if (room.draw.mode === 'secret') {
      if (isHostAction) {
        // Host: give ALL players a new secret word
        const shuffled = [...drawWordBank].sort(() => Math.random() - 0.5);
        playingPlayers.forEach((p, i) => {
          room.draw.playerWords[p.id] = shuffled[i % shuffled.length];
          delete room.draw.submissions[p.id];
          if (p.socketId) io.to(p.socketId).emit('draw:secret_word', { word: room.draw.playerWords[p.id], skipped: true });
        });
        const submittedCount = Object.keys(room.draw.submissions).length;
        io.to(code).emit('draw:submission_received', { submittedCount, totalDrawers: playingPlayers.length, submittedPlayerIds: [] });
      } else {
        // Player: only that player gets a new word, their submission is cleared
        const newWord = pickDrawWord();
        room.draw.playerWords[player.id] = newWord;
        delete room.draw.submissions[player.id];
        socket.emit('draw:secret_word', { word: newWord, skipped: true });
        const submittedCount = Object.keys(room.draw.submissions).length;
        io.to(code).emit('draw:submission_received', { submittedCount, totalDrawers: playingPlayers.length, submittedPlayerIds: Object.keys(room.draw.submissions) });
      }
    } else {
      // Classic mode: everyone gets a new word, reset all submissions and timer
      const newWord = pickDrawWord();
      room.draw.word = newWord;
      room.draw.submissions = {};
      if (room.draw.timerRef) { clearInterval(room.draw.timerRef); room.draw.timerRef = null; }
      io.to(code).emit('draw:word_changed', {
        word: newWord,
        skippedBy: isHostAction ? null : player.id,
        skippedByName: isHostAction ? 'Host' : player.name,
        skipsUsed: room.draw.skipCount,
        maxSkips: 2,
      });
      io.to(code).emit('draw:submission_received', { submittedCount: 0, totalDrawers: playingPlayers.length, submittedPlayerIds: [] });
      startDrawTimer(io, room, code, room.draw.timeLimit);
    }
  });

  socket.on('draw:submit', ({ code, strokes }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'drawing' || !room.draw || room.draw.phase !== 'drawing') return;
    touchRoom(code);
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying) return;
    const isResubmit = !!room.draw.submissions[player.id];

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
    console.log(`[Server] Draw submission: ${submittedCount}/${playingPlayers.length} room=${code}`);

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
    if (votedForPlayerId === player.id) {
      socket.emit('draw:vote_rejected', { reason: 'no_self_vote' });
      return;
    }
    if (!room.draw.submissions[votedForPlayerId]) {
      socket.emit('draw:vote_rejected', { reason: 'invalid_submission' });
      return;
    }

    room.draw.votes[player.id] = votedForPlayerId;
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const voteCount = Object.keys(room.draw.votes).length;
    io.to(code).emit('draw:vote_received', { voteCount, totalVoters: playingPlayers.length, votedPlayerIds: Object.keys(room.draw.votes) });
    console.log(`[Server] Draw vote: ${voteCount}/${playingPlayers.length} room=${code}`);

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
          mergeToGlobalScores(io, room, room.scores);
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
      mergeToGlobalScores(io, room, room.draw.scores);
      return;
    }

    room.draw.round++;
    room.draw.phase = 'drawing';
    room.draw.submissions = {};
    room.draw.votes = {};
    room.draw.secondsLeft = room.draw.timeLimit;
    room.draw.skipCount = 0;

    const nextPlayingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const players = nextPlayingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));

    if (room.draw.mode === 'secret') {
      room.draw.word = null;
      if (!room.draw.playerWords) room.draw.playerWords = {};
      const shuffledNext = [...drawWordBank].sort(() => Math.random() - 0.5);
      nextPlayingPlayers.forEach((p, i) => { room.draw.playerWords[p.id] = shuffledNext[i % shuffledNext.length]; });
      io.to(code).emit('draw:round_start', { word: null, round: room.draw.round, totalRounds: room.draw.totalRounds, timeLimit: room.draw.timeLimit, players, mode: 'secret' });
      nextPlayingPlayers.forEach(p => {
        if (p.socketId) io.to(p.socketId).emit('draw:secret_word', { word: room.draw.playerWords[p.id] });
      });
    } else {
      room.draw.word = pickDrawWord();
      io.to(code).emit('draw:round_start', { word: room.draw.word, round: room.draw.round, totalRounds: room.draw.totalRounds, timeLimit: room.draw.timeLimit, players, mode: 'classic' });
    }
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

  // ─── Fill-in-the-Blank handlers ───────────────────────────────────────────

  const fitbQuestions = require('./questions/fillInTheBlank');

  const pickFitbQuestion = (room, players) => {
    const unused = fitbQuestions.filter(q => !(room.fitb.usedQuestions || []).includes(q));
    const pool = unused.length > 0 ? unused : fitbQuestions;
    const q = pool[Math.floor(Math.random() * pool.length)];
    if (!room.fitb.usedQuestions) room.fitb.usedQuestions = [];
    room.fitb.usedQuestions.push(q);
    // Replace {name} with round-robin player selection so all players get equal turns
    const playingPlayers = players.filter(p => p.isConnected && p.isPlaying);
    if (q.includes('{name}') && playingPlayers.length > 0) {
      const idx = (room.fitb.targetPlayerIndex || 0) % playingPlayers.length;
      room.fitb.targetPlayerIndex = (room.fitb.targetPlayerIndex || 0) + 1;
      const target = playingPlayers[idx];
      return q.replace(/\{name\}/g, target.name);
    }
    return q;
  };

  // ── FitB answer-phase timer ────────────────────────────────────────────────
  const stopFitbAnswerTimer = (room) => {
    if (room.fitb?.answerTimerRef) {
      clearTimeout(room.fitb.answerTimerRef);
      room.fitb.answerTimerRef = null;
    }
  };

  const startFitbAnswerTimer = (io, room, code, seconds) => {
    stopFitbAnswerTimer(room);
    room.fitb.answerSecondsLeft = seconds;
    const tick = () => {
      if (!room.fitb || room.fitb.phase !== 'answering') return;
      io.to(code).emit('fitb:answer_timer', { secondsLeft: room.fitb.answerSecondsLeft });
      if (room.fitb.answerSecondsLeft <= 0) {
        // Auto-submit: use player's typed draft if available, otherwise default
        const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
        playingPlayers.forEach(p => {
          if (!room.fitb.answers.find(a => a.playerId === p.id)) {
            const draftText = (room.fitb.drafts || {})[p.id] || '';
            room.fitb.answers.push({
              playerId: p.id, playerName: p.name, playerColor: p.color,
              text: draftText || "...",
              votes: 0,
            });
          }
        });
        startFitbVoting(io, room, code);
        return;
      }
      room.fitb.answerSecondsLeft--;
      room.fitb.answerTimerRef = setTimeout(tick, 1000);
    };
    room.fitb.answerTimerRef = setTimeout(tick, 0);
  };

  socket.on('fitb:start', ({ code, rounds }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    cancelAllTimers(room);
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    if (playingPlayers.length < 2) return;

    room.players.forEach(p => { p.joinedMidRound = false; });
    const totalRounds = Math.min(Math.max(parseInt(rounds) || room.totalRounds || 3, 1), 10);
    const timeLimit = room.roomConfig?.roundDurationSecs || 30;
    const scores = {};
    playingPlayers.forEach(p => { scores[p.id] = 0; });

    room.phase = 'fitb';
    // Pre-initialize fitb so pickFitbQuestion can use targetPlayerIndex for round-robin
    room.fitb = {
      phase: 'answering',
      round: 1,
      totalRounds,
      question: '',
      answers: [],
      drafts: {},
      usedQuestions: [],
      targetPlayerIndex: 0,
      scores,
      answerTimerRef: null,
      answerSecondsLeft: timeLimit,
    };
    room.fitb.question = pickFitbQuestion(room, room.players);

    const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.to(code).emit('fitb:round_start', {
      question: room.fitb.question,
      round: 1,
      totalRounds,
      players,
      timeLimit,
    });
    startFitbAnswerTimer(io, room, code, timeLimit);
  });

  socket.on('fitb:draft', ({ code, text }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'fitb' || room.fitb.phase !== 'answering') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    room.fitb.drafts = room.fitb.drafts || {};
    room.fitb.drafts[player.id] = String(text || '').slice(0, 120);
    touchRoom(code); // keep room alive while players are actively typing
  });

  socket.on('fitb:answer', ({ code, text }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'fitb' || room.fitb.phase !== 'answering') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;

    const sanitizedText = String(text || '').slice(0, 120).trim();
    if (!sanitizedText) return;

    const existingFitb = room.fitb.answers.find(a => a.playerId === player.id);
    if (existingFitb) {
      existingFitb.text = sanitizedText;
    } else {
      room.fitb.answers.push({
        playerId: player.id,
        playerName: player.name,
        playerColor: player.color,
        text: sanitizedText,
        votes: 0,
      });
    }

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const answeredCount = room.fitb.answers.length;
    io.to(code).emit('fitb:answer_received', { answeredCount, totalPlayers: playingPlayers.length, answeredPlayerIds: room.fitb.answers.map(a => a.playerId) });

    if (answeredCount >= playingPlayers.length) {
      startFitbVoting(io, room, code);
    }
  });

  const startFitbVoting = (io, room, code) => {
    if (room.fitb.phase !== 'answering') return;
    stopFitbAnswerTimer(room);
    room.fitb.phase = 'voting';
    // Shuffle answers so order doesn't reveal authorship
    const shuffled = [...room.fitb.answers].sort(() => Math.random() - 0.5);
    room.fitb.answers = shuffled;
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    // Send anonymous answers (no author info) + tell each player which index is theirs
    const anonAnswers = shuffled.map((a, i) => ({ id: i, text: a.text }));
    playingPlayers.forEach(p => {
      const myAnswerIndex = shuffled.findIndex(a => a.playerId === p.id);
      io.to(p.socketId).emit('fitb:voting_started', {
        answers: anonAnswers,
        question: room.fitb.question,
        totalVoters: playingPlayers.length,
        myAnswerIndex,
      });
    });
    // Also notify spectators/host (no myAnswerIndex)
    room.players.filter(p => !p.isPlaying || !p.isConnected).forEach(p => {
      io.to(p.socketId).emit('fitb:voting_started', {
        answers: anonAnswers,
        question: room.fitb.question,
        totalVoters: playingPlayers.length,
        myAnswerIndex: -1,
      });
    });
  };

  socket.on('fitb:skip_to_vote', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'fitb' || room.fitb.phase !== 'answering') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    startFitbVoting(io, room, code);
  });

  socket.on('fitb:change_question', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'fitb' || room.fitb.phase !== 'answering') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    stopFitbAnswerTimer(room);
    const timeLimit = room.roomConfig?.roundDurationSecs || 30;
    room.fitb.answers = [];
    room.fitb._votes = {};
    room.fitb.question = pickFitbQuestion(room, room.players);
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.to(code).emit('fitb:round_start', {
      question: room.fitb.question,
      round: room.fitb.round,
      totalRounds: room.fitb.totalRounds,
      players,
      timeLimit,
    });
    startFitbAnswerTimer(io, room, code, timeLimit);
  });

  socket.on('fitb:vote', ({ code, answerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'fitb' || room.fitb.phase !== 'voting') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    // Prevent double-vote
    if (!room.fitb._votes) room.fitb._votes = {};
    if (room.fitb._votes[player.id] !== undefined) return;
    const idx = parseInt(answerId);
    if (isNaN(idx) || idx < 0 || idx >= room.fitb.answers.length) return;
    // Prevent voting for own answer
    if (room.fitb.answers[idx].playerId === player.id) return;

    room.fitb._votes[player.id] = idx;
    room.fitb.answers[idx].votes++;

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const voteCount = Object.keys(room.fitb._votes).length;
    io.to(code).emit('fitb:vote_received', { voteCount, totalVoters: playingPlayers.length, votedPlayerIds: Object.keys(room.fitb._votes) });

    if (voteCount >= playingPlayers.length) {
      resolveFitbVoting(io, room, code);
    }
  });

  const resolveFitbVoting = (io, room, code) => {
    if (room.fitb.phase !== 'voting') return;
    room.fitb.phase = 'results';
    // Award points: +1 per vote received
    room.fitb.answers.forEach(a => {
      room.fitb.scores[a.playerId] = (room.fitb.scores[a.playerId] || 0) + a.votes;
    });
    const sorted = [...room.fitb.answers].sort((a, b) => b.votes - a.votes);
    const leaderboard = room.players.filter(p => p.isPlaying)
      .map(p => ({ id: p.id, name: p.name, color: p.color, score: room.fitb.scores[p.id] || 0 }))
      .sort((a, b) => b.score - a.score);
    io.to(code).emit('fitb:results', {
      answers: sorted,
      scores: room.fitb.scores,
      leaderboard,
      round: room.fitb.round,
      totalRounds: room.fitb.totalRounds,
      question: room.fitb.question,
    });
  };

  socket.on('fitb:show_results', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'fitb' || room.fitb.phase !== 'voting') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    resolveFitbVoting(io, room, code);
  });

  socket.on('fitb:next_round', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'fitb' || room.fitb.phase !== 'results') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (room.fitb.round >= room.fitb.totalRounds) {
      // Game over
      const leaderboard = room.players.filter(p => p.isPlaying)
        .map(p => ({ id: p.id, name: p.name, color: p.color, score: room.fitb.scores[p.id] || 0 }))
        .sort((a, b) => b.score - a.score);
      room.phase = 'fitbEnd';
      io.to(code).emit('fitb:end', { leaderboard });
      mergeToGlobalScores(io, room, room.fitb.scores);
      return;
    }

    room.fitb.round++;
    room.fitb.phase = 'answering';
    room.fitb.answers = [];
    room.fitb.drafts = {};
    room.fitb._votes = {};
    room.fitb.question = pickFitbQuestion(room, room.players);
    const timeLimit = room.roomConfig?.roundDurationSecs || 30;

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.to(code).emit('fitb:round_start', {
      question: room.fitb.question,
      round: room.fitb.round,
      totalRounds: room.fitb.totalRounds,
      players,
      timeLimit,
    });
    startFitbAnswerTimer(io, room, code, timeLimit);
  });

  socket.on('fitb:restart', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    room.phase = 'lobby';
    room.fitb = { phase: 'waiting', round: 0, totalRounds: 3, question: null, answers: [], usedQuestions: [], scores: {} };
    room.players.forEach(p => { p.isReady = false; });
    io.to(code).emit('fitb:restarted', { code, players: room.players });
  });

  // ─── Selfie Roast handlers ─────────────────────────────────────────────────

  socket.on('selfie:start', ({ code, rounds }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    cancelAllTimers(room);
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    if (playingPlayers.length < 2) return;

    room.players.forEach(p => { p.joinedMidRound = false; });
    const totalRounds = Math.min(Math.max(parseInt(rounds) || 3, 1), 10);
    const scores = {};
    playingPlayers.forEach(p => { scores[p.id] = 0; });

    room.phase = 'selfie';
    room.selfie = {
      phase: 'photo',
      round: 1,
      totalRounds,
      usedPrompts: [],
      photos: {},
      assignments: {},
      strokes: {},
      votes: {},
      scores,
    };

    // Pre-populate photos from persistent selfie bank
    const savedPhotos = room.playerPhotos || {};
    playingPlayers.forEach(p => {
      if (savedPhotos[p.id]) room.selfie.photos[p.id] = savedPhotos[p.id];
    });

    // If all photos already available, skip photo phase entirely
    if (Object.keys(room.selfie.photos).length >= playingPlayers.length) {
      assignSelfieDrawers(io, room, code);
      return;
    }

    const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.to(code).emit('selfie:photo_phase', { round: 1, totalRounds, players, totalPhotographers: playingPlayers.length });

    // Notify players whose photos were pre-loaded so they see "saved selfie" UI
    playingPlayers.forEach(p => {
      if (room.selfie.photos[p.id] && p.socketId) {
        io.to(p.socketId).emit('player:photo_reused', { gameType: 'selfie' });
      }
    });
  });

  socket.on('selfie:submit_photo', ({ code, photoData }) => {
    const room = getRoom(code);
    if (!room) return;

    // ── Validate: accept either a cloud storage HTTPS URL or a Base64 data URI ──
    if (!photoData || typeof photoData !== 'string') return;
    // Only accept cloud URLs from the configured public storage domain to prevent
    // arbitrary external URL injection (tracking pixels, unexpected resources).
    const cloudBase = storageConfigured() ? getPublicBaseUrl() : null;
    const isCloudUrl = cloudBase
      ? (photoData.startsWith(cloudBase + '/') && /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(photoData))
      : false;
    const isBase64 = photoData.startsWith('data:image/jpeg;base64,') ||
                     photoData.startsWith('data:image/png;base64,')  ||
                     photoData.startsWith('data:image/webp;base64,');
    if (!isCloudUrl && !isBase64) return;
    // Enforce size cap only on Base64 (cloud URLs are just short strings)
    if (isBase64 && photoData.length > 2 * 1024 * 1024) return;

    // Handle DT selfie collection phase
    if (room.phase === 'dt' && room.dt.phase === 'selfie') {
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || !player.isPlaying || !player.isConnected) return;
      if (room.dt.selfiePhotos?.[player.id]) return; // already submitted

      if (!room.playerPhotos) room.playerPhotos = {};
      room.playerPhotos[player.id] = photoData;
      touchRoom(code);
      if (!room.dt.selfiePhotos) room.dt.selfiePhotos = {};
      room.dt.selfiePhotos[player.id] = true;

      const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
      const photoCount = Object.keys(room.dt.selfiePhotos).length;
      const submittedPlayerIds = Object.keys(room.dt.selfiePhotos);
      io.to(code).emit('dt:photo_received', { photoCount, totalPhotographers: playingPlayers.length, submittedPlayerIds });

      if (photoCount >= playingPlayers.length) {
        room.dt.phase = 'prompting';
        const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
        io.to(code).emit('dt:prompt_phase', { players, totalPrompts: playingPlayers.length, secondsLeft: DT_PROMPT_SECS });
        startDtPromptTimer(io, room, code);
      }
      return;
    }

    if (room.phase !== 'selfie') return;
    // Allow normal photo phase OR drawing phase (for retakes where photo was cleared)
    if (room.selfie.phase !== 'photo' && room.selfie.phase !== 'drawing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    if (room.selfie.photos[player.id]) return; // already submitted (or not a retake)

    // Validation already performed above (cloud URL or Base64 check)
    room.selfie.photos[player.id] = photoData;
    // Persist photo for reuse across selfie-based mini games
    if (!room.playerPhotos) room.playerPhotos = {};
    room.playerPhotos[player.id] = photoData;
    touchRoom(code);

    if (room.selfie.phase === 'drawing') {
      // Retake path: re-assign updated photo to the drawer, then return retaker to drawing screen
      const assignedDrawerId = Object.keys(room.selfie.assignments).find(
        drawerId => room.selfie.assignments[drawerId] === player.id
      );
      if (assignedDrawerId) {
        const drawer = room.players.find(p => p.id === assignedDrawerId);
        const personalizedPrompt = (room.selfie.promptTemplate || '').replace(/\[Name\]/g, player.name || '?');
        if (drawer?.socketId) {
          io.to(drawer.socketId).emit('selfie:draw_assigned', {
            photoData: room.selfie.photos[player.id],
            ownerName: player.name,
            ownerColor: player.color,
            ownerPlayerId: player.id,
            prompt: personalizedPrompt,
            promptTemplate: room.selfie.promptTemplate,
          });
        }
      }
      // Return the retaker to their own drawing assignment
      const retakerOwnerPlayerId = room.selfie.assignments[player.id];
      const retakerOwner = room.players.find(p => p.id === retakerOwnerPlayerId);
      if (retakerOwnerPlayerId && retakerOwner) {
        const personalizedPrompt = (room.selfie.promptTemplate || '').replace(/\[Name\]/g, retakerOwner.name || '?');
        io.to(player.socketId).emit('selfie:draw_assigned', {
          photoData: room.selfie.photos[retakerOwnerPlayerId],
          ownerName: retakerOwner.name,
          ownerColor: retakerOwner.color,
          ownerPlayerId: retakerOwner.id,
          prompt: personalizedPrompt,
          promptTemplate: room.selfie.promptTemplate,
        });
      }
      return;
    }

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const photoCount = Object.keys(room.selfie.photos).length;
    io.to(code).emit('selfie:photo_received', { photoCount, totalPhotographers: playingPlayers.length, submittedPlayerIds: Object.keys(room.selfie.photos) });

    if (photoCount >= playingPlayers.length) {
      assignSelfieDrawers(io, room, code);
    }
  });

  const assignSelfieDrawers = (io, room, code) => {
    if (room.selfie.phase !== 'photo') return;
    room.selfie.phase = 'drawing';

    // Pick a prompt that hasn't been used this game yet
    const usedPrompts = room.selfie.usedPrompts || [];
    const unusedPrompts = selfiePrompts.filter(p => !usedPrompts.includes(p.prompt));
    const promptPool = unusedPrompts.length > 0 ? unusedPrompts : selfiePrompts;
    const promptObj = promptPool[Math.floor(Math.random() * promptPool.length)];
    room.selfie.promptTemplate = promptObj.prompt;
    if (!room.selfie.usedPrompts) room.selfie.usedPrompts = [];
    room.selfie.usedPrompts.push(promptObj.prompt);

    const photoOwnerIds = Object.keys(room.selfie.photos);
    // Shuffle photo owners so each drawer gets someone else's photo
    const shuffled = [...photoOwnerIds].sort(() => Math.random() - 0.5);
    // Create a derangement (no one draws their own photo)
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying && room.selfie.photos[p.id]);
    const drawerIds = playingPlayers.map(p => p.id);

    // Simple derangement: shift by 1
    const assignedOwners = [...shuffled];
    for (let attempt = 0; attempt < 50; attempt++) {
      let valid = true;
      for (let i = 0; i < drawerIds.length; i++) {
        if (drawerIds[i] === assignedOwners[i % assignedOwners.length]) { valid = false; break; }
      }
      if (valid) break;
      assignedOwners.sort(() => Math.random() - 0.5);
    }

    drawerIds.forEach((drawerId, i) => {
      room.selfie.assignments[drawerId] = assignedOwners[i % assignedOwners.length];
    });

    // Send each drawer their assigned photo
    playingPlayers.forEach(p => {
      const ownerPlayerId = room.selfie.assignments[p.id];
      const owner = room.players.find(pl => pl.id === ownerPlayerId);
      if (p.socketId && ownerPlayerId) {
        const personalizedPrompt = (room.selfie.promptTemplate || 'Draw on [Name]\'s selfie').replace(/\[Name\]/g, owner?.name || '?');
        io.to(p.socketId).emit('selfie:draw_assigned', {
          photoData: room.selfie.photos[ownerPlayerId],
          ownerName: owner?.name || '?',
          ownerColor: owner?.color || '#fff',
          ownerPlayerId,
          prompt: personalizedPrompt,
          promptTemplate: room.selfie.promptTemplate,
        });
      }
    });

    // Broadcast drawing phase start
    const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.to(code).emit('selfie:drawing_phase', { players, totalDrawers: drawerIds.length, promptTemplate: room.selfie.promptTemplate });
  };

  socket.on('selfie:skip_to_drawing', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie' || room.selfie.phase !== 'photo') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    // Only assign if there's at least one photo
    if (Object.keys(room.selfie.photos).length < 1) return;
    assignSelfieDrawers(io, room, code);
  });

  socket.on('selfie:submit_drawing', ({ code, strokes }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie' || room.selfie.phase !== 'drawing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    if (room.selfie.strokes[player.id]) return; // already submitted

    // Sanitize strokes
    if (!Array.isArray(strokes)) return;
    const sanitized = strokes.slice(0, 500).map(s => ({
      color: /^#[0-9A-Fa-f]{3,6}$/.test(s.color) ? s.color : '#000000',
      width: Math.min(Math.max(Number(s.width) || 4, 1), 40),
      type: s.type === 'eraser' ? 'eraser' : 'pen',
      points: Array.isArray(s.points) ? s.points.slice(0, 300).map(pt => ({
        x: Math.round(Number(pt.x) || 0),
        y: Math.round(Number(pt.y) || 0),
      })) : [],
    }));

    room.selfie.strokes[player.id] = sanitized;

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying && room.selfie.assignments[p.id]);
    const drawingCount = Object.keys(room.selfie.strokes).length;
    io.to(code).emit('selfie:drawing_received', { drawingCount, totalDrawers: playingPlayers.length, drawnPlayerIds: Object.keys(room.selfie.strokes) });

    if (drawingCount >= playingPlayers.length) {
      startSelfieVoting(io, room, code);
    }
  });

  const startSelfieVoting = (io, room, code) => {
    if (room.selfie.phase !== 'drawing') return;
    room.selfie.phase = 'voting';
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);

    // Auto-fill empty strokes for drawers who never submitted (so all photos appear in voting)
    Object.keys(room.selfie.assignments).forEach(drawerId => {
      if (!room.selfie.strokes[drawerId]) {
        room.selfie.strokes[drawerId] = [];
      }
    });

    // Build submissions: each drawer's photo + strokes + who the photo belongs to
    const submissions = Object.keys(room.selfie.strokes).map(drawerId => {
      const drawer = room.players.find(p => p.id === drawerId);
      const ownerPlayerId = room.selfie.assignments[drawerId];
      const owner = room.players.find(p => p.id === ownerPlayerId);
      const personalizedPrompt = (room.selfie.promptTemplate || '').replace(/\[Name\]/g, owner?.name || '?');
      return {
        drawerId,
        drawerName: drawer?.name || '?',
        drawerColor: drawer?.color || '#fff',
        ownerPlayerId,
        ownerName: owner?.name || '?',
        photoData: room.selfie.photos[ownerPlayerId] || null,
        strokes: room.selfie.strokes[drawerId],
        prompt: personalizedPrompt,
      };
    });
    // Shuffle so drawer order is not obvious
    submissions.sort(() => Math.random() - 0.5);

    io.to(code).emit('selfie:voting_started', {
      submissions,
      totalVoters: playingPlayers.length,
    });
  };

  socket.on('selfie:skip_to_vote', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie' || room.selfie.phase !== 'drawing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    // Signal all clients to auto-submit their current drawings
    io.to(code).emit('selfie:drawing_ending');
    // Give clients 1.5 s to submit, then advance regardless
    setTimeout(() => {
      if (room.selfie.phase !== 'drawing') return; // already advanced
      startSelfieVoting(io, room, code);
    }, 1500);
  });

  socket.on('selfie:vote', ({ code, drawerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie' || room.selfie.phase !== 'voting') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    if (room.selfie.votes[player.id] !== undefined) return; // already voted
    if (drawerId === player.id) return; // no self-vote
    if (!room.selfie.strokes[drawerId]) return; // invalid target

    room.selfie.votes[player.id] = drawerId;
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const voteCount = Object.keys(room.selfie.votes).length;
    io.to(code).emit('selfie:vote_received', { voteCount, totalVoters: playingPlayers.length, votedPlayerIds: Object.keys(room.selfie.votes) });

    const allVoted = playingPlayers.every(p => room.selfie.votes[p.id] !== undefined);
    if (voteCount >= playingPlayers.length || allVoted) {
      resolveSelfieVoting(io, room, code);
    }
  });

  const resolveSelfieVoting = (io, room, code) => {
    if (room.selfie.phase !== 'voting') return;
    room.selfie.phase = 'results';

    // Tally vote counts per drawer
    const voteCounts = {};
    Object.values(room.selfie.votes).forEach(drawerId => {
      voteCounts[drawerId] = (voteCounts[drawerId] || 0) + 1;
    });
    // Award scores
    Object.entries(voteCounts).forEach(([drawerId, v]) => {
      room.selfie.scores[drawerId] = (room.selfie.scores[drawerId] || 0) + v;
    });

    const submissions = Object.keys(room.selfie.strokes).map(drawerId => {
      const drawer = room.players.find(p => p.id === drawerId);
      const ownerPlayerId = room.selfie.assignments[drawerId];
      const owner = room.players.find(p => p.id === ownerPlayerId);
      const personalizedPrompt = (room.selfie.promptTemplate || '').replace(/\[Name\]/g, owner?.name || '?');
      return {
        drawerId,
        drawerName: drawer?.name || '?',
        drawerColor: drawer?.color || '#fff',
        ownerPlayerId,
        ownerName: owner?.name || '?',
        photoData: room.selfie.photos[ownerPlayerId] || null,
        strokes: room.selfie.strokes[drawerId],
        votes: voteCounts[drawerId] || 0,
        prompt: personalizedPrompt,
      };
    }).sort((a, b) => b.votes - a.votes);

    const leaderboard = room.players.filter(p => p.isPlaying)
      .map(p => ({ id: p.id, name: p.name, color: p.color, score: room.selfie.scores[p.id] || 0 }))
      .sort((a, b) => b.score - a.score);

    const round = room.selfie.round || 1;
    const totalRounds = room.selfie.totalRounds || 1;
    if (round < totalRounds) {
      // More rounds remain — stay in selfie phase and let host advance
      room.selfie.phase = 'results';
      io.to(code).emit('selfie:results', { submissions, scores: room.selfie.scores, leaderboard, promptTemplate: room.selfie.promptTemplate, round, totalRounds, isFinal: false });
    } else {
      room.phase = 'selfieEnd';
      io.to(code).emit('selfie:results', { submissions, scores: room.selfie.scores, leaderboard, promptTemplate: room.selfie.promptTemplate, round, totalRounds, isFinal: true });
      mergeToGlobalScores(io, room, room.selfie.scores);
    }
  };

  socket.on('selfie:show_results', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie' || room.selfie.phase !== 'voting') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    resolveSelfieVoting(io, room, code);
  });

  socket.on('selfie:next_round', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie' || room.selfie.phase !== 'results') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    if (room.selfie.round >= room.selfie.totalRounds) return;

    room.selfie.round++;
    // Reuse existing photos from playerPhotos bank
    room.selfie.phase = 'photo';
    room.selfie.photos = {};
    const savedPhotos = room.playerPhotos || {};
    room.players.forEach(p => {
      if (p.isConnected && p.isPlaying && savedPhotos[p.id]) {
        room.selfie.photos[p.id] = savedPhotos[p.id];
      }
    });
    room.selfie.assignments = {};
    room.selfie.strokes = {};
    room.selfie.votes = {};

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    if (Object.keys(room.selfie.photos).length >= playingPlayers.length) {
      assignSelfieDrawers(io, room, code);
    } else {
      const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
      io.to(code).emit('selfie:photo_phase', { round: room.selfie.round, totalRounds: room.selfie.totalRounds, players, totalPhotographers: playingPlayers.length });
    }
  });

  socket.on('selfie:skip_question', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (room.selfie.phase === 'drawing') {
      // Keep photos + assignments — only swap the prompt and clear strokes
      const usedPrompts = room.selfie.usedPrompts || [];
      const unusedPrompts = selfiePrompts.filter(p => !usedPrompts.includes(p.prompt));
      const promptPool = unusedPrompts.length > 0 ? unusedPrompts : selfiePrompts;
      const promptObj = promptPool[Math.floor(Math.random() * promptPool.length)];
      room.selfie.promptTemplate = promptObj.prompt;
      if (!room.selfie.usedPrompts) room.selfie.usedPrompts = [];
      room.selfie.usedPrompts.push(promptObj.prompt);
      console.log(`[selfie_skip_question] Skipped question for room ${code}. New prompt assigned.`);
      // Clear strokes so drawers start fresh with the new prompt
      room.selfie.strokes = {};
      // Send each drawer the new prompt (keeping their existing photo assignment)
      const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying && room.selfie.assignments[p.id]);
      playingPlayers.forEach(p => {
        const ownerPlayerId = room.selfie.assignments[p.id];
        const owner = room.players.find(pl => pl.id === ownerPlayerId);
        if (p.socketId) {
          const personalizedPrompt = room.selfie.promptTemplate.replace(/\[Name\]/g, owner?.name || '?');
          io.to(p.socketId).emit('selfie:prompt_updated', {
            prompt: personalizedPrompt,
            promptTemplate: room.selfie.promptTemplate,
          });
        }
      });
      // also notify the host
      io.to(socket.id).emit('selfie:prompt_updated', {
        promptTemplate: room.selfie.promptTemplate,
      });
    } else {
      // In photo (or other) phase — reset everything and restart photo submission
      room.selfie.phase = 'photo';
      room.selfie.photos = {};
      const savedPhotos = room.playerPhotos || {};
      room.players.forEach(p => {
        if (p.isConnected && p.isPlaying && savedPhotos[p.id]) {
          room.selfie.photos[p.id] = savedPhotos[p.id];
        }
      });
      room.selfie.assignments = {};
      room.selfie.strokes = {};
      room.selfie.votes = {};
      const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
      if (Object.keys(room.selfie.photos).length >= playingPlayers.length) {
        assignSelfieDrawers(io, room, code);
      } else {
        const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
        io.to(code).emit('selfie:photo_phase', { round: room.selfie.round, totalRounds: room.selfie.totalRounds, players, totalPhotographers: playingPlayers.length });
      }
    }
  });

  socket.on('selfie:retake_photo', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie' || room.selfie.phase !== 'drawing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    if (room.selfie.strokes[player.id]) return; // already submitted drawing — too late
    // Clear photo so submit_photo guard will accept the new one
    delete room.selfie.photos[player.id];
    io.to(player.socketId).emit('selfie:retake_ready', {});
  });

  socket.on('selfie:restart', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    room.phase = 'lobby';
    room.selfie = { phase: 'waiting', photos: {}, assignments: {}, strokes: {}, votes: {}, scores: {} };
    room.players.forEach(p => { p.isReady = false; });
    io.to(code).emit('selfie:restarted', { code, players: room.players });
  });

  // ─── Caption mode ──────────────────────────────────────────────────────────
  // Phase flow: photo → writing → voting → results → (next round or end)
  // Each round: everyone submits a photo, then everyone ELSE writes a caption for it.
  // The photo owner cannot write a caption but CAN vote. Votes = points.

  socket.on('caption:start', ({ code, rounds = 3 }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    cancelAllTimers(room);
    const { captionPrompts } = require('./questions/captionPrompts');
    const shuffled = [...captionPrompts].sort(() => Math.random() - 0.5);

    room.phase = 'caption';
    room.caption = {
      phase: 'photo',
      photos: {},
      currentRound: 1,
      totalRounds: Math.min(rounds, shuffled.length),
      captions: {},      // captionId -> { id, playerId, text }
      votes: {},         // voterId -> captionId
      scores: {},
      usedPrompts: [],
      prompts: shuffled,
      currentPromptIndex: 0,
    };

    // Pre-populate photos from persistent selfie bank
    const captionSaved = room.playerPhotos || {};
    const captionPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    captionPlayers.forEach(p => {
      if (captionSaved[p.id]) room.caption.photos[p.id] = captionSaved[p.id];
    });

    // If all photos already available, skip photo phase
    if (Object.keys(room.caption.photos).length >= captionPlayers.length) {
      startCaptionWritingPhase(io, room, code);
      return;
    }

    const players = captionPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.to(code).emit('caption:photo_phase', {
      round: 1,
      totalRounds: room.caption.totalRounds,
      players,
    });

    // Notify pre-loaded players
    captionPlayers.forEach(p => {
      if (room.caption.photos[p.id] && p.socketId) {
        io.to(p.socketId).emit('player:photo_reused', { gameType: 'caption' });
      }
    });
  });

  socket.on('caption:submit_photo', ({ code, photoData }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'caption' || room.caption.phase !== 'photo') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    if (room.caption.photos[player.id]) return; // already submitted

    // Validate: accept cloud storage URL (from configured domain only) or Base64 data URI
    if (!photoData || typeof photoData !== 'string') return;
    const cloudBase = storageConfigured() ? getPublicBaseUrl() : null;
    const isCloudUrl = cloudBase
      ? (photoData.startsWith(cloudBase + '/') && /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(photoData))
      : false;
    const isBase64 = photoData.startsWith('data:image/jpeg;base64,') ||
                     photoData.startsWith('data:image/png;base64,')  ||
                     photoData.startsWith('data:image/webp;base64,');
    if (!isCloudUrl && !isBase64) return;
    if (isBase64 && photoData.length > 2 * 1024 * 1024) return;

    room.caption.photos[player.id] = photoData;
    // Persist photo for reuse across selfie-based mini games
    if (!room.playerPhotos) room.playerPhotos = {};
    room.playerPhotos[player.id] = photoData;

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const submittedCount = Object.keys(room.caption.photos).length;
    io.to(code).emit('caption:photo_submitted', { playerId: player.id, submittedCount, totalCount: playingPlayers.length });

    // Auto-advance when all photos are in
    if (submittedCount >= playingPlayers.length) {
      startCaptionWritingPhase(io, room, code);
    }
  });

  function startCaptionWritingPhase(io, room, code) {
    room.caption.phase = 'writing';
    room.caption.captions = {};
    room.caption.votes = {};

    // Pick the featured photo owner for this round (cycle through players)
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const ownerIndex = (room.caption.currentRound - 1) % playingPlayers.length;
    room.caption.featuredOwnerId = playingPlayers[ownerIndex].id;

    const promptObj = room.caption.prompts[room.caption.currentPromptIndex] || { text: 'Write a funny caption!' };
    room.caption.currentPrompt = promptObj.text;
    room.caption.usedPrompts.push(promptObj.text);
    room.caption.currentPromptIndex++;

    const owner = room.players.find(p => p.id === room.caption.featuredOwnerId);
    io.to(code).emit('caption:writing_phase', {
      round: room.caption.currentRound,
      totalRounds: room.caption.totalRounds,
      prompt: room.caption.currentPrompt,
      featuredOwnerId: room.caption.featuredOwnerId,
      featuredOwnerName: owner?.name || '?',
      featuredPhotoData: room.caption.photos[room.caption.featuredOwnerId],
      writers: playingPlayers.map(p => ({ id: p.id, name: p.name })),
    });
  }

  socket.on('caption:submit_caption', ({ code, text }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'caption' || (room.caption.phase !== 'writing' && room.caption.phase !== 'voting')) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;

    if (!text || typeof text !== 'string') return;
    const sanitized = text.trim().slice(0, 200);
    if (!sanitized) return;

    const isUpdate = !!room.caption.captions[player.id];
    if (isUpdate) {
      // Allow the player to edit their caption before voting starts
      room.caption.captions[player.id].text = sanitized;
    } else {
      const captionId = `cap_${player.id}_${Date.now()}`;
      room.caption.captions[player.id] = { id: captionId, playerId: player.id, text: sanitized };
    }

    const writers = room.players.filter(p => p.isConnected && p.isPlaying);
    const submittedCount = Object.keys(room.caption.captions).length;
    io.to(code).emit('caption:caption_submitted', { playerId: player.id, submittedCount, totalCount: writers.length });

    const allSubmitted = writers.every(p => room.caption.captions[p.id]);
    if (room.caption.phase === 'writing' && ((!isUpdate && submittedCount >= writers.length) || allSubmitted)) {
      startCaptionVotingPhase(io, room, code);
    }
  });

  function startCaptionVotingPhase(io, room, code) {
    if (room.caption.phase !== 'writing') return; // guard against double-fire
    room.caption.phase = 'voting';
    const captionList = Object.values(room.caption.captions).map(c => ({ id: c.id, text: c.text }));
    // Shuffle so order doesn't reveal authorship
    captionList.sort(() => Math.random() - 0.5);
    const owner = room.players.find(p => p.id === room.caption.featuredOwnerId);
    io.to(code).emit('caption:voting_phase', {
      captions: captionList,
      featuredOwnerId: room.caption.featuredOwnerId,
      featuredOwnerName: owner?.name || '?',
      featuredPhotoData: room.caption.photos[room.caption.featuredOwnerId],
    });
    // Tell each player their own caption ID so the client can disable it
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    playingPlayers.forEach(p => {
      const myCap = room.caption.captions[p.id];
      if (myCap && p.socketId) {
        io.to(p.socketId).emit('caption:your_caption_id', { captionId: myCap.id });
      }
    });
  }

  socket.on('caption:vote', ({ code, captionId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'caption' || room.caption.phase !== 'voting') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    if (room.caption.votes[player.id]) return; // already voted

    // Validate captionId exists
    const captionExists = Object.values(room.caption.captions).some(c => c.id === captionId);
    if (!captionExists) return;
    // Can't vote for your own caption
    const ownCaption = room.caption.captions[player.id];
    if (ownCaption && ownCaption.id === captionId) return;

    room.caption.votes[player.id] = captionId;

    const voters = room.players.filter(p => p.isConnected && p.isPlaying);
    const voteCount = Object.keys(room.caption.votes).length;
    io.to(code).emit('caption:vote_received', { voteCount, totalVoters: voters.length, votedPlayerIds: Object.keys(room.caption.votes) });

    const allVoted = voters.every(p => room.caption.votes[p.id]);
    if (voteCount >= voters.length || allVoted) {
      endCaptionRound(io, room, code);
    }
  });

  socket.on('caption:skip_to_voting', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'caption' || room.caption.phase !== 'writing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    startCaptionVotingPhase(io, room, code);
  });

  socket.on('caption:change_question', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'caption' || room.caption.phase !== 'writing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    // Reset captions and votes for current round, then start writing phase again with next prompt
    room.caption.captions = {};
    room.caption.votes = {};
    startCaptionWritingPhase(io, room, code);
  });

  socket.on('caption:skip_to_results', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'caption') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    if (room.caption.phase === 'voting') {
      endCaptionRound(io, room, code);
    }
  });

  function endCaptionRound(io, room, code) {
    if (room.caption.phase !== 'voting') return; // guard against double-fire
    room.caption.phase = 'results';
    // Tally votes: votes received = points
    const roundScores = {};
    for (const [voterId, captionId] of Object.entries(room.caption.votes)) {
      const caption = Object.values(room.caption.captions).find(c => c.id === captionId);
      if (caption) {
        roundScores[caption.playerId] = (roundScores[caption.playerId] || 0) + 1;
        room.caption.scores[caption.playerId] = (room.caption.scores[caption.playerId] || 0) + 1;
      }
    }

    const captionResults = Object.values(room.caption.captions).map(c => ({
      id: c.id,
      playerId: c.playerId,
      text: c.text,
      voteCount: Object.values(room.caption.votes).filter(v => v === c.id).length,
      playerName: room.players.find(p => p.id === c.playerId)?.name || '?',
    })).sort((a, b) => b.voteCount - a.voteCount);

    const owner = room.players.find(p => p.id === room.caption.featuredOwnerId);
    io.to(code).emit('caption:round_results', {
      round: room.caption.currentRound,
      totalRounds: room.caption.totalRounds,
      featuredOwnerName: owner?.name || '?',
      featuredPhotoData: room.caption.photos[room.caption.featuredOwnerId],
      prompt: room.caption.currentPrompt,
      captionResults,
      roundScores,
      scores: room.caption.scores,
    });
  }

  socket.on('caption:next_round', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'caption' || room.caption.phase !== 'results') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (room.caption.currentRound >= room.caption.totalRounds) {
      // Game over — merge scores
      mergeToGlobalScores(io, room, room.caption.scores);
      room.caption.phase = 'ended';
      io.to(code).emit('caption:game_over', {
        scores: room.caption.scores,
        leaderboard: Object.entries(room.caption.scores)
          .map(([id, pts]) => ({ id, pts, name: room.players.find(p => p.id === id)?.name || '?' }))
          .sort((a, b) => b.pts - a.pts),
      });
    } else {
      room.caption.currentRound++;
      // Reuse existing photos — skip the photo collection phase
      room.caption.captions = {};
      room.caption.votes = {};
      startCaptionWritingPhase(io, room, code);
    }
  });

  socket.on('caption:restart', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    room.phase = 'lobby';
    room.caption = { phase: 'waiting', photos: {}, currentRound: 1, totalRounds: 3, captions: {}, votes: {}, scores: {}, usedPrompts: [], prompts: [], currentPromptIndex: 0 };
    room.players.forEach(p => { p.isReady = false; });
    io.to(code).emit('caption:restarted', { code, players: room.players });
  });

  // ─── PhotoVote mode (pmatch + photoassoc) ──────────────────────────────────
  // Phase flow: photo → voting → results → (next round or end)
  // pmatch: everyone submits a photo; then a prompt is shown, everyone votes for who best fits it.
  // photoassoc: same mechanics but prompts are "Most likely to..." style traits.

  socket.on('photovote:start', ({ code, subType = 'pmatch', rounds = 5 }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    if (!['pmatch', 'photoassoc'].includes(subType)) return;

    cancelAllTimers(room);
    const pvPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    let prompts;
    if (subType === 'pmatch') {
      const { pmatchPrompts } = require('./questions/pmatchPrompts');
      prompts = [...pmatchPrompts].sort(() => Math.random() - 0.5);
    } else {
      const { photoAssocTraits } = require('./questions/photoAssocTraits');
      prompts = [...photoAssocTraits].sort(() => Math.random() - 0.5);
    }

    room.phase = 'photovote';
    room.photoVote = {
      subType,
      phase: 'photo',
      photos: {},
      currentRound: 1,
      totalRounds: Math.min(rounds, prompts.length),
      prompts,
      currentPromptIndex: 0,
      votes: {},   // voterId -> targetPlayerId
      scores: {},
    };

    // Pre-populate photos from persistent selfie bank (except for pmatch which needs custom photos per prompt)
    if (subType !== 'pmatch') {
      const pvSaved = room.playerPhotos || {};
      pvPlayers.forEach(p => {
        if (pvSaved[p.id]) room.photoVote.photos[p.id] = pvSaved[p.id];
      });
    }

    // If all photos already available, skip photo phase
    if (Object.keys(room.photoVote.photos).length >= pvPlayers.length) {
      startPhotoVoteRound(io, room, code);
      return;
    }

    // For Selfie Challenge (pmatch), pre-resolve the prompt so players know what to pose for
    let photoPhasePrompt = undefined;
    if (subType === 'pmatch' && pvPlayers.length > 0) {
      const firstRaw = room.photoVote.prompts[0];
      photoPhasePrompt = resolvePhotoVotePrompt(firstRaw, pvPlayers);
      room.photoVote.pendingPrompt = photoPhasePrompt;
    }

    const players = pvPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.to(code).emit('photovote:photo_phase', {
      subType,
      round: 1,
      totalRounds: room.photoVote.totalRounds,
      players,
      prompt: photoPhasePrompt,
    });

    // Notify pre-loaded players
    pvPlayers.forEach(p => {
      if (room.photoVote.photos[p.id] && p.socketId) {
        io.to(p.socketId).emit('player:photo_reused', { gameType: 'photovote' });
      }
    });
  });

  socket.on('photovote:submit_photo', ({ code, photoData }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'photovote' || room.photoVote.phase !== 'photo') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    if (room.photoVote.photos[player.id]) return;

    // Validate: accept cloud storage URL (from configured domain only) or Base64 data URI
    if (!photoData || typeof photoData !== 'string') return;
    const cloudBasePv = storageConfigured() ? getPublicBaseUrl() : null;
    const isCloudUrlPv = cloudBasePv
      ? (photoData.startsWith(cloudBasePv + '/') && /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(photoData))
      : false;
    const isBase64Pv = photoData.startsWith('data:image/jpeg;base64,') ||
                       photoData.startsWith('data:image/png;base64,')  ||
                       photoData.startsWith('data:image/webp;base64,');
    if (!isCloudUrlPv && !isBase64Pv) return;
    if (isBase64Pv && photoData.length > 2 * 1024 * 1024) return;

    room.photoVote.photos[player.id] = photoData;
    // Persist photo for reuse across selfie-based mini games
    if (!room.playerPhotos) room.playerPhotos = {};
    room.playerPhotos[player.id] = photoData;

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const submittedCount = Object.keys(room.photoVote.photos).length;
    io.to(code).emit('photovote:photo_submitted', { playerId: player.id, submittedCount, totalCount: playingPlayers.length });

    if (submittedCount >= playingPlayers.length) {
      startPhotoVoteRound(io, room, code);
    }
  });

  function resolvePhotoVotePrompt(promptObj, playingPlayers) {
    if (typeof promptObj === 'string') return promptObj;
    if (!promptObj) return 'Strike your best pose!';
    const { template, requiresPlayerTarget } = promptObj;
    if (requiresPlayerTarget && playingPlayers.length > 0) {
      const target = playingPlayers[Math.floor(Math.random() * playingPlayers.length)];
      return template.replace(/\[Name\]/g, target.name);
    }
    return template;
  }

  function startPhotoVoteRound(io, room, code) {
    room.photoVote.phase = 'voting';
    room.photoVote.votes = {};
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    let prompt;
    if (room.photoVote.pendingPrompt) {
      prompt = room.photoVote.pendingPrompt;
      room.photoVote.pendingPrompt = null;
      room.photoVote.currentPromptIndex++;
    } else {
      const rawPrompt = room.photoVote.prompts[room.photoVote.currentPromptIndex] || 'Strike your best pose!';
      prompt = resolvePhotoVotePrompt(rawPrompt, playingPlayers);
      room.photoVote.currentPromptIndex++;
    }
    room.photoVote.currentPrompt = prompt;
    const photoList = playingPlayers.map(p => ({
      playerId: p.id,
      playerName: p.name,
      photoData: room.photoVote.photos[p.id],
    }));

    io.to(code).emit('photovote:voting_phase', {
      subType: room.photoVote.subType,
      round: room.photoVote.currentRound,
      totalRounds: room.photoVote.totalRounds,
      prompt,
      photos: photoList,
    });
  }

  socket.on('photovote:vote', ({ code, targetPlayerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'photovote' || room.photoVote.phase !== 'voting') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    if (room.photoVote.votes[player.id]) return;

    const target = room.players.find(p => p.id === targetPlayerId && p.isPlaying);
    if (!target) return;
    // Can't vote for yourself
    if (targetPlayerId === player.id) return;

    room.photoVote.votes[player.id] = targetPlayerId;

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const voteCount = Object.keys(room.photoVote.votes).length;
    const votedPlayerIds = Object.keys(room.photoVote.votes);
    io.to(code).emit('photovote:vote_received', { voteCount, totalVoters: playingPlayers.length, votedPlayerIds });

    const allVoted = playingPlayers.every(p => room.photoVote.votes[p.id]);
    if (voteCount >= playingPlayers.length || allVoted) {
      endPhotoVoteRound(io, room, code);
    }
  });

  socket.on('photovote:change_question', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'photovote' || room.photoVote.phase !== 'voting') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (room.photoVote.subType === 'pmatch') {
      room.photoVote.phase = 'photo';
      room.photoVote.photos = {};
      room.photoVote.votes = {};
      room.photoVote.currentPromptIndex++;
      
      const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
      const nextIndex = room.photoVote.currentPromptIndex % room.photoVote.prompts.length;
      const rawNextPrompt = room.photoVote.prompts[nextIndex];
      const photoPhasePrompt = resolvePhotoVotePrompt(rawNextPrompt, playingPlayers);
      room.photoVote.pendingPrompt = photoPhasePrompt;
      
      io.to(code).emit('photovote:photo_phase', {
        subType: room.photoVote.subType,
        round: room.photoVote.currentRound,
        totalRounds: room.photoVote.totalRounds,
        players: playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color })),
        prompt: photoPhasePrompt,
      });
      return;
    }

    // Reset votes and pick the next prompt
    room.photoVote.votes = {};
    const playingPlayersForPrompt = room.players.filter(p => p.isConnected && p.isPlaying);
    const nextIndex = room.photoVote.currentPromptIndex % room.photoVote.prompts.length;
    const rawNextPrompt = room.photoVote.prompts[nextIndex];
    const prompt = resolvePhotoVotePrompt(rawNextPrompt, playingPlayersForPrompt);
    room.photoVote.currentPrompt = prompt;
    room.photoVote.currentPromptIndex++;

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const photoList = playingPlayers.map(p => ({
      playerId: p.id,
      playerName: p.name,
      photoData: room.photoVote.photos[p.id],
    }));

    io.to(code).emit('photovote:voting_phase', {
      subType: room.photoVote.subType,
      round: room.photoVote.currentRound,
      totalRounds: room.photoVote.totalRounds,
      prompt,
      photos: photoList,
    });
  });

  socket.on('photovote:skip_to_results', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'photovote') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    if (room.photoVote.phase === 'voting') {
      endPhotoVoteRound(io, room, code);
    }
  });

  function endPhotoVoteRound(io, room, code) {
    if (room.photoVote.phase !== 'voting') return; // guard against double-fire
    room.photoVote.phase = 'results';
    // Tally: most votes wins, all voters for winner get 1pt, winner gets 1pt per vote received
    const voteCounts = {};
    for (const targetId of Object.values(room.photoVote.votes)) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }
    const maxVotes = Math.max(0, ...Object.values(voteCounts));
    const winners = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);

    const roundScores = {};
    // Winner(s) get points equal to votes received
    for (const winnerId of winners) {
      roundScores[winnerId] = (roundScores[winnerId] || 0) + (voteCounts[winnerId] || 0);
      room.photoVote.scores[winnerId] = (room.photoVote.scores[winnerId] || 0) + (voteCounts[winnerId] || 0);
    }
    // Voters who picked a winner get 1 point
    for (const [voterId, targetId] of Object.entries(room.photoVote.votes)) {
      if (winners.includes(targetId)) {
        roundScores[voterId] = (roundScores[voterId] || 0) + 1;
        room.photoVote.scores[voterId] = (room.photoVote.scores[voterId] || 0) + 1;
      }
    }

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const voteResults = playingPlayers.map(p => ({
      playerId: p.id,
      playerName: p.name,
      photoData: room.photoVote.photos[p.id],
      voteCount: voteCounts[p.id] || 0,
      isWinner: winners.includes(p.id),
    })).sort((a, b) => b.voteCount - a.voteCount);

    io.to(code).emit('photovote:round_results', {
      round: room.photoVote.currentRound,
      totalRounds: room.photoVote.totalRounds,
      prompt: room.photoVote.currentPrompt,
      voteResults,
      roundScores,
      scores: room.photoVote.scores,
    });
  }

  socket.on('photovote:next_round', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'photovote' || room.photoVote.phase !== 'results') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    if (room.photoVote.currentRound >= room.photoVote.totalRounds) {
      mergeToGlobalScores(io, room, room.photoVote.scores);
      room.photoVote.phase = 'ended';
      io.to(code).emit('photovote:game_over', {
        scores: room.photoVote.scores,
        leaderboard: Object.entries(room.photoVote.scores)
          .map(([id, pts]) => ({ id, pts, name: room.players.find(p => p.id === id)?.name || '?' }))
          .sort((a, b) => b.pts - a.pts),
      });
    } else {
      room.photoVote.currentRound++;
      
      if (room.photoVote.subType === 'pmatch') {
        room.photoVote.phase = 'photo';
        room.photoVote.photos = {};
        room.photoVote.votes = {};
        
        const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
        const rawNextPrompt = room.photoVote.prompts[room.photoVote.currentPromptIndex];
        const photoPhasePrompt = resolvePhotoVotePrompt(rawNextPrompt, playingPlayers);
        room.photoVote.pendingPrompt = photoPhasePrompt;
        
        io.to(code).emit('photovote:photo_phase', {
          subType: room.photoVote.subType,
          round: room.photoVote.currentRound,
          totalRounds: room.photoVote.totalRounds,
          players: playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color })),
          prompt: photoPhasePrompt,
        });
      } else {
        room.photoVote.phase = 'voting';
        room.photoVote.votes = {};
        startPhotoVoteRound(io, room, code);
      }
    }
  });

  socket.on('photovote:restart', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    room.phase = 'lobby';
    room.photoVote = { subType: 'pmatch', phase: 'waiting', photos: {}, currentRound: 1, totalRounds: 5, prompts: [], currentPromptIndex: 0, votes: {}, scores: {} };
    room.players.forEach(p => { p.isReady = false; });
    io.to(code).emit('photovote:restarted', { code, players: room.players });
  });

  // ─── Draw Telephone ────────────────────────────────────────────────────────
  // Phase flow: prompting → drawing (parallel chains) → guessing → reveal → end
  // Each player writes a [name]-template prompt.  Server assigns each prompt to a
  // target player (bijection, derangement preferred).  A drawing chain of all OTHER
  // players passes the canvas step-by-step.  The target then guesses the original
  // prompt from the final drawing.  All players vote correct/close/wrong.

  const DT_DRAW_SECS = 45;   // seconds per drawing turn
  const DT_PROMPT_SECS = 60;  // seconds to write a prompt before auto-generation
  const DT_GUESS_SECS = 60;   // seconds to guess before auto-submit
  const DT_VOTE_SECS = 30;    // seconds to vote before auto-advance

  // Helper: sanitize strokes (same rules as the regular drawing game)
  const sanitizeDtStrokes = (strokes) => {
    if (!Array.isArray(strokes)) return [];
    return strokes.slice(0, 500).map(s => ({
      color: /^#[0-9A-Fa-f]{3,6}$/.test(s.color) ? s.color : '#000000',
      width: Math.min(Math.max(Number(s.width) || 4, 1), 40),
      type: s.type === 'eraser' ? 'eraser' : 'pen',
      points: Array.isArray(s.points)
        ? s.points.slice(0, 300).map(pt => ({ x: Math.round(Number(pt.x) || 0), y: Math.round(Number(pt.y) || 0) }))
        : [],
    }));
  };

  // Helper: build the combined strokes array from all completed drawing steps
  const buildCombinedStrokes = (chain) =>
    chain.drawingSteps.flatMap(step => step.strokes);

  // Helper: start the prompt-phase countdown; auto-generates prompts for idle players on expiry
  const startDtPromptTimer = (io, room, code) => {
    if (room.dt.promptTimerRef) { clearTimeout(room.dt.promptTimerRef); room.dt.promptTimerRef = null; }
    room.dt.promptStartedAt = Date.now();
    room.dt.promptTimerRef = setTimeout(() => {
      if (room.dt.phase !== 'prompting') return;
      const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
      const autoTemplates = [
        '[name] fighting a robot',
        '[name] making a surprise discovery',
        '[name] at the wrong party',
        '[name] trying to fly',
        '[name] meeting their hero',
      ];
      playingPlayers.forEach(p => {
        if (!room.dt.prompts.some(pr => pr.authorId === p.id)) {
          const text = autoTemplates[Math.floor(Math.random() * autoTemplates.length)];
          room.dt.prompts.push({ id: `dt_${p.id}_auto`, authorId: p.id, templateText: text, autoGenerated: true });
        }
      });
      if (room.dt.prompts.length > 0) {
        io.to(code).emit('dt:prompt_received', {
          submittedCount: room.dt.prompts.length,
          totalPrompts: playingPlayers.length,
          submittedPlayerIds: room.dt.prompts.map(p => p.authorId),
        });
        startDtDrawingPhase(io, room, code, playingPlayers);
      }
    }, DT_PROMPT_SECS * 1000);
  };

  // Helper: start the guess-phase countdown; auto-submits empty guess on expiry
  const startDtGuessTimer = (io, room, code) => {
    if (room.dt.guessTimerRef) { clearTimeout(room.dt.guessTimerRef); room.dt.guessTimerRef = null; }
    room.dt.guessStartedAt = Date.now();
    room.dt.guessTimerRef = setTimeout(() => {
      if (room.dt.phase !== 'guessing') return;
      for (const promptId of Object.keys(room.dt.chains)) {
        if (!room.dt.guesses[promptId]) room.dt.guesses[promptId] = '';
      }
      startDtRevealPhase(io, room, code);
    }, DT_GUESS_SECS * 1000);
  };

  // Helper: advance to next chain reveal (or end game when all done)
  const advanceDtReveal = (io, room, code) => {
    if (room.dt.phase !== 'reveal') return;
    if (room.dt.voteTimerRef) { clearTimeout(room.dt.voteTimerRef); room.dt.voteTimerRef = null; }
    room.dt.revealCurrentIndex++;
    room.dt.revealStep = 0;
    if (room.dt.revealCurrentIndex >= room.dt.revealQueue.length) {
      endDtGame(io, room, code);
      return;
    }
    const payload = buildDtRevealPayload(room);
    if (payload) io.to(code).emit('dt:reveal_update', payload);
  };

  // Helper: start the drawing timer for a specific chain
  const startDtChainTimer = (io, room, code, promptId) => {
    const chain = room.dt.chains[promptId];
    if (!chain) return;
    chain.secondsLeft = DT_DRAW_SECS;
    chain.timerRef = setInterval(() => {
      chain.secondsLeft--;
      // (activeTurns maps playerId→promptId, so invert the lookup)
      const activeDrawerEntry = Object.entries(room.dt.activeTurns).find(([, pid]) => pid === promptId);
      if (activeDrawerEntry) {
        const [activeDrawerId] = activeDrawerEntry;
        const drawerPlayer = room.players.find(p => p.id === activeDrawerId);
        if (drawerPlayer?.socketId) {
          io.to(drawerPlayer.socketId).emit('dt:turn_timer', { promptId, secondsLeft: chain.secondsLeft });
        }
      }
      if (chain.secondsLeft <= 0) {
        clearInterval(chain.timerRef);
        chain.timerRef = null;
        // Notify the active drawer to submit their current strokes immediately
        const drawerEntryAtTimeout = Object.entries(room.dt.activeTurns).find(([, pid]) => pid === promptId);
        if (drawerEntryAtTimeout) {
          const drawerAtTimeout = room.players.find(p => p.id === drawerEntryAtTimeout[0]);
          if (drawerAtTimeout?.socketId) {
            io.to(drawerAtTimeout.socketId).emit('dt:time_up', { promptId });
          }
        }
        // 800ms grace window for client to submit actual strokes; then fallback to empty
        setTimeout(() => autoSubmitDtTurn(io, room, code, promptId), 800);
      }
    }, 1000);
  };

  // Helper: called when a turn times out — submits empty/current strokes for that turn
  const autoSubmitDtTurn = (io, room, code, promptId) => {
    const chain = room.dt.chains[promptId];
    if (!chain || chain.phase !== 'drawing') return;
    const drawerEntry = Object.entries(room.dt.activeTurns).find(([, pid]) => pid === promptId);
    if (!drawerEntry) return;
    const [drawerId] = drawerEntry;
    // Add an empty drawing step if the player never submitted
    chain.drawingSteps.push({ playerId: drawerId, strokes: [], submittedAt: Date.now(), autoSubmitted: true });
    // Free the player's active turn slot
    delete room.dt.activeTurns[drawerId];
    // Give them any pending turn
    if (room.dt.pendingTurns[drawerId]?.length > 0) {
      const nextId = room.dt.pendingTurns[drawerId].shift();
      const nextChain = room.dt.chains[nextId];
      if (nextChain && nextChain.phase === 'drawing') startDtChainTurn(io, room, code, nextId);
    }
    // Advance this chain
    chain.currentParticipantIndex++;
    if (chain.currentParticipantIndex >= chain.participants.length) {
      chain.phase = 'done';
      room.dt.chainsCompletedDrawing++;
      io.to(code).emit('dt:chain_progress', {
        chainsCompleted: room.dt.chainsCompletedDrawing,
        totalChains: room.dt.totalChains,
        activeDrawerIds: Object.keys(room.dt.activeTurns),
      });
      if (room.dt.chainsCompletedDrawing >= room.dt.totalChains) {
        startDtGuessingPhase(io, room, code);
      }
    } else {
      startDtChainTurn(io, room, code, promptId);
    }
  };

  // Helper: assign a drawing turn to the next participant in a chain
  const startDtChainTurn = (io, room, code, promptId) => {
    const chain = room.dt.chains[promptId];
    if (!chain || chain.phase !== 'drawing') return;
    const drawerId = chain.participants[chain.currentParticipantIndex];
    if (!drawerId) return;

    // If this player already has an active turn, queue this one
    if (room.dt.activeTurns[drawerId]) {
      if (!room.dt.pendingTurns[drawerId]) room.dt.pendingTurns[drawerId] = [];
      room.dt.pendingTurns[drawerId].push(promptId);
      return;
    }

    room.dt.activeTurns[drawerId] = promptId;
    const drawerPlayer = room.players.find(p => p.id === drawerId);
    const existingStrokes = buildCombinedStrokes(chain);

    if (drawerPlayer?.socketId) {
      io.to(drawerPlayer.socketId).emit('dt:your_turn', {
        promptId,
        finalText: chain.finalText,
        existingStrokes,
        originalSelfieData: chain.originalSelfieData,
        position: chain.currentParticipantIndex + 1,
        totalPositions: chain.participants.length,
        secondsLeft: DT_DRAW_SECS,
      });
    }

    startDtChainTimer(io, room, code, promptId);

    // Broadcast progress to room so everyone can see which chains are active
    io.to(code).emit('dt:drawing_progress', {
      promptId,
      stepsDone: chain.drawingSteps.length,
      totalSteps: chain.participants.length,
      drawerId,
      drawerName: drawerPlayer?.name || '?',
      activeDrawerIds: Object.keys(room.dt.activeTurns),
    });
  };

  // Helper: start guessing phase — target players see final drawing
  const startDtGuessingPhase = (io, room, code) => {
    room.dt.phase = 'guessing';
    const totalGuessers = Object.keys(room.dt.chains).length;
    io.to(code).emit('dt:guessing_phase', { totalGuessers, secondsLeft: DT_GUESS_SECS });

    for (const [promptId, chain] of Object.entries(room.dt.chains)) {
      const targetPlayer = room.players.find(p => p.id === chain.targetPlayerId);
      const finalStrokes = buildCombinedStrokes(chain);
      if (targetPlayer?.socketId) {
        io.to(targetPlayer.socketId).emit('dt:your_guess', {
          promptId,
          finalStrokes,
          originalSelfieData: chain.originalSelfieData,
          drawerCount: chain.drawingSteps.length,
          secondsLeft: DT_GUESS_SECS,
        });
      }
    }

    startDtGuessTimer(io, room, code);
  };

  // Helper: build reveal payload for current step
  const buildDtRevealPayload = (room) => {
    const { revealCurrentIndex, revealQueue, revealStep } = room.dt;
    const promptId = revealQueue[revealCurrentIndex];
    if (!promptId) return null;
    const chain = room.dt.chains[promptId];
    const targetPlayer = room.players.find(p => p.id === chain.targetPlayerId);
    const authorPlayer = room.players.find(p => p.id === chain.authorId);
    const drawingSteps = chain.drawingSteps.map((step, i) => {
      const drawer = room.players.find(p => p.id === step.playerId);
      // Cumulative strokes up to and including this step
      const cumulativeStrokes = chain.drawingSteps.slice(0, i + 1).flatMap(s => s.strokes);
      return {
        playerId: step.playerId,
        playerName: drawer?.name || '?',
        playerColor: drawer?.color || '#fff',
        strokes: cumulativeStrokes,
        stepIndex: i,
      };
    });
    // Step layout: 0=context(template+target+selfie+finalText) 1..N=drawings N+1=guess+vote(combined)
    const votes = room.dt.votes[promptId] || {};
    const correctCount = Object.values(votes).filter(v => v === 'correct').length;
    const closeCount = Object.values(votes).filter(v => v === 'close').length;
    const wrongCount = Object.values(votes).filter(v => v === 'wrong').length;
    const totalVoters = room.players.filter(p => p.isConnected && p.isPlaying && p.id !== chain.targetPlayerId).length;
    const hasVotingCompleted = Object.keys(votes).length >= totalVoters;
    const success = hasVotingCompleted
      ? (correctCount + closeCount) > wrongCount
      : null;

    // Step layout: 0=context+prompt(merged), 1=all drawings grid, 2=guess+vote
    // Compute vote seconds remaining when on the vote step (step 2)
    const isVoteStep = revealStep === 2;
    const voteSecondsLeft = isVoteStep && room.dt.voteStartedAt
      ? Math.max(0, DT_VOTE_SECS - Math.floor((Date.now() - room.dt.voteStartedAt) / 1000))
      : DT_VOTE_SECS;

    return {
      promptIndex: revealCurrentIndex,
      totalPrompts: revealQueue.length,
      step: revealStep,
      promptId,
      templateText: chain.templateText,
      targetPlayerId: chain.targetPlayerId,
      targetName: targetPlayer?.name || '?',
      targetColor: targetPlayer?.color || '#fff',
      originalSelfieData: chain.originalSelfieData,
      authorPlayerId: chain.authorId,
      authorName: authorPlayer?.name || '?',
      finalText: chain.finalText,
      drawingSteps,
      guessText: room.dt.guesses[promptId] || '',
      votes,
      voteCount: Object.keys(votes).length,
      totalVoters,
      voteSecondsLeft,
      success,
      correctCount,
      closeCount,
      wrongCount,
    };
  };

  socket.on('dt:start', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    if (playingPlayers.length < 3) {
      socket.emit('dt:error', { message: 'Need at least 3 players to start Draw Telephone.' });
      return;
    }

    cancelAllTimers(room);
    room.phase = 'dt';
    room.dt = {
      phase: 'prompting',
      prompts: [],
      chains: {},
      activeTurns: {},
      pendingTurns: {},
      guesses: {},
      votes: {},
      revealQueue: [],
      revealCurrentIndex: 0,
      revealStep: 0,
      chainsCompletedDrawing: 0,
      totalChains: 0,
      scores: {},
      promptTimerRef: null,
      promptStartedAt: null,
      guessTimerRef: null,
      guessStartedAt: null,
      voteTimerRef: null,
      voteStartedAt: null,
    };

    const allPhotos = room.playerPhotos || {};
    const missingPhotos = playingPlayers.filter(p => !allPhotos[p.id]);
    const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));

    if (missingPhotos.length > 0) {
      // Need selfies first — track which players already have photos
      room.dt.phase = 'selfie';
      room.dt.selfiePhotos = {};
      playingPlayers.forEach(p => {
        if (allPhotos[p.id]) room.dt.selfiePhotos[p.id] = true;
      });
      const photoCount = Object.keys(room.dt.selfiePhotos).length;
      io.to(code).emit('dt:selfie_phase', { players, photoCount, totalPhotographers: playingPlayers.length });
      // Notify players whose photos are already saved so they see "reusing" UI
      playingPlayers.forEach(p => {
        if (allPhotos[p.id] && p.socketId) {
          io.to(p.socketId).emit('player:photo_reused', { gameType: 'dt' });
        }
      });
      // If all photos already saved, skip selfie phase immediately
      if (photoCount >= playingPlayers.length) {
        room.dt.phase = 'prompting';
        io.to(code).emit('dt:prompt_phase', { players, totalPrompts: playingPlayers.length, secondsLeft: DT_PROMPT_SECS });
        startDtPromptTimer(io, room, code);
      }
    } else {
      io.to(code).emit('dt:prompt_phase', { players, totalPrompts: playingPlayers.length, secondsLeft: DT_PROMPT_SECS });
      startDtPromptTimer(io, room, code);
    }
  });

  socket.on('dt:submit_prompt', ({ code, templateText }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt' || room.dt.phase !== 'prompting') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    // One prompt per player
    if (room.dt.prompts.some(p => p.authorId === player.id)) return;

    if (!templateText || typeof templateText !== 'string') return;
    const sanitized = templateText.trim().slice(0, 200);
    // Must contain [name] placeholder — notify the client so they can correct it
    if (!sanitized.toLowerCase().includes('[name]')) {
      socket.emit('dt:prompt_rejected', { reason: 'missing_name_placeholder' });
      return;
    }

    const promptId = `dt_${player.id}_${Date.now()}`;
    room.dt.prompts.push({ id: promptId, authorId: player.id, templateText: sanitized });

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    io.to(code).emit('dt:prompt_received', {
      submittedCount: room.dt.prompts.length,
      totalPrompts: playingPlayers.length,
      submittedPlayerIds: room.dt.prompts.map(p => p.authorId),
    });

    // When all players have submitted, assign targets and start drawing chains
    if (room.dt.prompts.length >= playingPlayers.length) {
      if (room.dt.promptTimerRef) { clearTimeout(room.dt.promptTimerRef); room.dt.promptTimerRef = null; }
      startDtDrawingPhase(io, room, code, playingPlayers);
    }
  });

  const startDtDrawingPhase = (io, room, code, playingPlayers) => {
    room.dt.phase = 'drawing';
    room.dt.totalChains = room.dt.prompts.length;

    // Assign targets: bijection (each prompt gets one target, each player is target exactly once)
    // Build derangement-like assignment: shuffle player IDs and pair with prompts
    const playerIds = playingPlayers.map(p => p.id);
    // Build the assignment using Fisher-Yates shuffle + targeted fix to guarantee no self-assignment
    const authorIds = room.dt.prompts.map(p => p.authorId);
    const shuffled = [...playerIds];
    // Fisher-Yates shuffle
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Fix any self-assignments: for each conflict, swap with the first safe partner
    for (let i = 0; i < shuffled.length; i++) {
      if (shuffled[i] === authorIds[i]) {
        for (let j = 0; j < shuffled.length; j++) {
          if (j !== i && shuffled[j] !== authorIds[i] && shuffled[i] !== authorIds[j]) {
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            break;
          }
        }
      }
    }

    // Create chains (without participant lists — built separately below)
    for (let i = 0; i < room.dt.prompts.length; i++) {
      const prompt = room.dt.prompts[i];
      const targetPlayerId = shuffled[i];
      const targetPlayer = playingPlayers.find(p => p.id === targetPlayerId);
      const finalText = prompt.templateText.replace(/\[name\]/gi, targetPlayer?.name || '?');
      room.dt.chains[prompt.id] = {
        id: prompt.id,
        authorId: prompt.authorId,
        templateText: prompt.templateText,
        targetPlayerId,
        targetName: targetPlayer?.name || '?',
        finalText,
        originalSelfieData: (room.playerPhotos || {})[targetPlayerId] || null,
        participants: [],  // filled below
        currentParticipantIndex: 0,
        drawingSteps: [],
        phase: 'drawing',
        timerRef: null,
        secondsLeft: DT_DRAW_SECS,
      };
    }

    // Build participant lists using bipartite matching so all players draw simultaneously
    // in round 1 (no one waits idle while others are drawing).
    // Augmenting-path matching guarantees a perfect assignment exists (Hall's theorem).
    const chainIds = Object.keys(room.dt.chains);
    const N = chainIds.length;
    const alreadyInChain = {};
    chainIds.forEach(id => { alreadyInChain[id] = []; });

    const findRoundMatching = () => {
      const playerToChain = {};
      const chainToPlayer = {};
      const augment = (chainId, visited) => {
        const ch = room.dt.chains[chainId];
        for (const pid of playerIds) {
          if (pid === ch.targetPlayerId) continue;
          if (alreadyInChain[chainId].includes(pid)) continue;
          if (visited.has(pid)) continue;
          visited.add(pid);
          if (!playerToChain[pid] || augment(playerToChain[pid], visited)) {
            playerToChain[pid] = chainId;
            chainToPlayer[chainId] = pid;
            return true;
          }
        }
        return false;
      };
      for (const cId of chainIds) augment(cId, new Set());
      return chainToPlayer;
    };

    for (let round = 0; round < N - 1; round++) {
      const assignment = findRoundMatching();
      for (const [cId, pid] of Object.entries(assignment)) {
        room.dt.chains[cId].participants.push(pid);
        alreadyInChain[cId].push(pid);
      }
    }

    const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.to(code).emit('dt:drawing_phase', {
      totalChains: room.dt.totalChains,
      players,
    });

    // Start the first turn of every chain simultaneously — everyone draws in round 1
    for (const promptId of Object.keys(room.dt.chains)) {
      startDtChainTurn(io, room, code, promptId);
    }
  };

  socket.on('dt:submit_strokes', ({ code, promptId, strokes }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt' || room.dt.phase !== 'drawing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;

    // Verify this is the player's active turn for this chain
    if (room.dt.activeTurns[player.id] !== promptId) return;
    const chain = room.dt.chains[promptId];
    if (!chain || chain.phase !== 'drawing') return;
    if (chain.participants[chain.currentParticipantIndex] !== player.id) return;

    // Cancel the timer for this chain
    if (chain.timerRef) { clearInterval(chain.timerRef); chain.timerRef = null; }

    const sanitized = sanitizeDtStrokes(strokes);
    chain.drawingSteps.push({ playerId: player.id, strokes: sanitized, submittedAt: Date.now() });

    // Free the player's active turn slot
    delete room.dt.activeTurns[player.id];

    // Give the player their next pending turn if any
    if (room.dt.pendingTurns[player.id]?.length > 0) {
      const nextPendingId = room.dt.pendingTurns[player.id].shift();
      const nextChain = room.dt.chains[nextPendingId];
      if (nextChain && nextChain.phase === 'drawing') startDtChainTurn(io, room, code, nextPendingId);
    }

    // Advance this chain to the next participant
    chain.currentParticipantIndex++;
    if (chain.currentParticipantIndex >= chain.participants.length) {
      chain.phase = 'done';
      room.dt.chainsCompletedDrawing++;
      io.to(code).emit('dt:chain_progress', {
        chainsCompleted: room.dt.chainsCompletedDrawing,
        totalChains: room.dt.totalChains,
        activeDrawerIds: Object.keys(room.dt.activeTurns),
      });
      if (room.dt.chainsCompletedDrawing >= room.dt.totalChains) {
        startDtGuessingPhase(io, room, code);
      }
    } else {
      startDtChainTurn(io, room, code, promptId);
    }
  });

  socket.on('dt:submit_guess', ({ code, promptId, guessText }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt' || room.dt.phase !== 'guessing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    if (room.dt.guesses[promptId]) return; // already guessed

    // Only the target of this chain can guess
    const chain = room.dt.chains[promptId];
    if (!chain || chain.targetPlayerId !== player.id) return;

    if (!guessText || typeof guessText !== 'string') return;
    const sanitized = guessText.trim().slice(0, 200);
    if (!sanitized) return;

    room.dt.guesses[promptId] = sanitized;

    const totalGuessers = Object.keys(room.dt.chains).length;
    const guessedCount = Object.keys(room.dt.guesses).length;
    const guessedPlayerIds = Object.entries(room.dt.chains)
      .filter(([pid]) => room.dt.guesses[pid] !== undefined)
      .map(([, c]) => c.targetPlayerId);
    io.to(code).emit('dt:guess_received', { guessedCount, totalGuessers, guessedPlayerIds });

    if (guessedCount >= totalGuessers) {
      startDtRevealPhase(io, room, code);
    }
  });

  const startDtRevealPhase = (io, room, code) => {
    room.dt.phase = 'reveal';
    room.dt.revealQueue = Object.keys(room.dt.chains);
    // Shuffle reveal order
    room.dt.revealQueue.sort(() => Math.random() - 0.5);
    room.dt.revealCurrentIndex = 0;
    room.dt.revealStep = 0;

    io.to(code).emit('dt:reveal_phase', {
      totalPrompts: room.dt.revealQueue.length,
    });

    // Broadcast initial state
    const payload = buildDtRevealPayload(room);
    if (payload) io.to(code).emit('dt:reveal_update', payload);
  };

  socket.on('dt:reveal_next', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt' || room.dt.phase !== 'reveal') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;

    const promptId = room.dt.revealQueue[room.dt.revealCurrentIndex];
    const chain = room.dt.chains[promptId];
    if (!chain) return;

    // Step layout: 0=context+prompt(merged), 1=all drawings grid, 2=guess+vote (auto-advances)
    const maxStep = 2; // 3 steps (0,1,2) regardless of N drawing steps

    if (room.dt.revealStep >= maxStep) {
      // Already on last step — advance to next chain
      advanceDtReveal(io, room, code);
      return;
    }

    room.dt.revealStep++;

    // On entering the last step (guess+vote), start the auto-advance vote timer
    if (room.dt.revealStep === maxStep) {
      if (room.dt.voteTimerRef) clearTimeout(room.dt.voteTimerRef);
      room.dt.voteTimerRef = setTimeout(() => advanceDtReveal(io, room, code), DT_VOTE_SECS * 1000);
      room.dt.voteStartedAt = Date.now();
    }

    const payload = buildDtRevealPayload(room);
    if (payload) io.to(code).emit('dt:reveal_update', payload);
  });

  socket.on('dt:vote', ({ code, promptId, vote }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt' || room.dt.phase !== 'reveal') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;

    if (!['correct', 'close', 'wrong'].includes(vote)) return;
    if (!room.dt.chains[promptId]) return;
    if (!room.dt.votes[promptId]) room.dt.votes[promptId] = {};
    if (room.dt.votes[promptId][player.id]) return; // already voted

    room.dt.votes[promptId][player.id] = vote;

    const chain = room.dt.chains[promptId];
    const eligibleVoters = room.players.filter(p => p.isConnected && p.isPlaying && p.id !== chain?.targetPlayerId);
    const voteCount = Object.keys(room.dt.votes[promptId]).length;
    io.to(code).emit('dt:vote_received', {
      promptId,
      voteCount,
      totalVoters: eligibleVoters.length,
      votedPlayerIds: Object.keys(room.dt.votes[promptId]),
    });

    // Re-broadcast the reveal update so everyone sees updated vote counts
    const payload = buildDtRevealPayload(room);
    if (payload) io.to(code).emit('dt:reveal_update', payload);

    // Auto-advance 2s after all votes are in (gives everyone a moment to see results)
    if (voteCount >= eligibleVoters.length && eligibleVoters.length > 0) {
      if (room.dt.voteTimerRef) clearTimeout(room.dt.voteTimerRef);
      room.dt.voteTimerRef = setTimeout(() => advanceDtReveal(io, room, code), 2000);
    }
  });

  const endDtGame = (io, room, code) => {
    room.dt.phase = 'end';
    room.phase = 'dtEnd';

    // Calculate scores from all vote outcomes
    for (const [promptId, promptVotes] of Object.entries(room.dt.votes)) {
      const chain = room.dt.chains[promptId];
      if (!chain) continue;
      const correctCount = Object.values(promptVotes).filter(v => v === 'correct').length;
      const closeCount = Object.values(promptVotes).filter(v => v === 'close').length;
      const wrongCount = Object.values(promptVotes).filter(v => v === 'wrong').length;
      const success = (correctCount + closeCount) > wrongCount;

      if (success) {
        const isCorrect = correctCount >= closeCount;
        // Target player gets points
        room.dt.scores[chain.targetPlayerId] = (room.dt.scores[chain.targetPlayerId] || 0) + (isCorrect ? 2 : 1);
        // Each drawer gets +1 for contributing to a successful chain
        for (const step of chain.drawingSteps) {
          if (!step.autoSubmitted) {
            room.dt.scores[step.playerId] = (room.dt.scores[step.playerId] || 0) + 1;
          }
        }
        // Prompt author gets +1 for a good prompt
        room.dt.scores[chain.authorId] = (room.dt.scores[chain.authorId] || 0) + 1;
      }
    }

    const leaderboard = room.players
      .filter(p => p.isPlaying)
      .map(p => ({ id: p.id, name: p.name, color: p.color, score: room.dt.scores[p.id] || 0 }))
      .sort((a, b) => b.score - a.score);

    mergeToGlobalScores(io, room, room.dt.scores);

    io.to(code).emit('dt:end', {
      scores: room.dt.scores,
      leaderboard,
    });
  };

  socket.on('dt:skip_to_reveal', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    if (room.dt.phase === 'guessing') startDtRevealPhase(io, room, code);
  });

  socket.on('dt:end_game', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    endDtGame(io, room, code);
  });

  socket.on('dt:restart', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    cancelAllTimers(room);
    room.phase = 'lobby';
    room.dt = { phase: 'waiting', prompts: [], chains: {}, activeTurns: {}, pendingTurns: {}, guesses: {}, votes: {}, revealQueue: [], revealCurrentIndex: 0, revealStep: 0, chainsCompletedDrawing: 0, totalChains: 0, scores: {}, promptTimerRef: null, promptStartedAt: null, guessTimerRef: null, guessStartedAt: null, voteTimerRef: null, voteStartedAt: null };
    room.players.forEach(p => { p.isReady = false; });
    io.to(code).emit('dt:restarted', { code, players: room.players });
  });

  // ─── Change game (keep same room/players, switch game type) ───────────────

  socket.on('change_game', ({ code, newGameType }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    const validGameTypes = ['who-said-that', 'most-likely-to', 'situational', 'this-or-that', 'mixed', 'drawing', 'fill-in-the-blank', 'selfie-roast', 'caption', 'pmatch', 'photoassoc', 'selfie-beforeafter', 'draw-telephone'];
    if (!validGameTypes.includes(newGameType)) return;

    // Cancel any active timers before resetting state
    cancelAllTimers(room);

    room.gameType = newGameType;
    room.phase = 'lobby';
    room.players.forEach(p => { p.isReady = false; });
    // Flush WST-specific per-round state
    room.answers = [];
    room.scores = {};
    room.currentRound = 0;
    room.questions = [];
    room.currentQuestionIndex = 0;
    // When switching to mixed, reset selectedSubGames to defaults so all types are active
    if (newGameType === 'mixed') {
      room.selectedSubGames = ['who-said-that', 'situational', 'this-or-that', 'drawing'];
    }
    // Reset all game-specific state
    room.mlt = { phase: 'waiting', prompts: [], currentPromptIndex: 0, votes: {}, scores: {}, leaderboard: [] };
    room.draw = { phase: 'waiting', rounds: [], currentRound: 0, submissions: {}, votes: {}, scores: {}, leaderboard: [] };
    room.fitb = { phase: 'waiting', rounds: [], currentRound: 0, submissions: {}, votes: {}, scores: {}, leaderboard: [] };
    room.selfie = { phase: 'waiting', photos: {}, assignments: {}, strokes: {}, votes: {}, scores: {} };
    room.caption = { phase: 'waiting', photos: {}, currentRound: 1, totalRounds: 3, captions: {}, votes: {}, scores: {}, usedPrompts: [], prompts: [], currentPromptIndex: 0 };
    room.photoVote = { subType: 'pmatch', phase: 'waiting', photos: {}, currentRound: 1, totalRounds: 5, prompts: [], currentPromptIndex: 0, votes: {}, scores: {} };
    room.dt = { phase: 'waiting', prompts: [], chains: {}, activeTurns: {}, pendingTurns: {}, guesses: {}, votes: {}, revealQueue: [], revealCurrentIndex: 0, revealStep: 0, chainsCompletedDrawing: 0, totalChains: 0, scores: {}, promptStartedAt: null, guessStartedAt: null, voteStartedAt: null };

    io.to(code).emit('game_changed', {
      code,
      gameType: newGameType,
      players: room.players,
      gameName: room.gameName || '',
    });
  });

  // ─── Global scores management ──────────────────────────────────────────────

  socket.on('reset_global_scores', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    room.globalScores = {};
    io.to(code).emit('global_scores_updated', { globalScores: {}, leaderboard: [] });
  });

  socket.on('remove_from_global_scores', ({ code, playerId }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    delete room.globalScores[playerId];
    const leaderboard = room.players
      .filter(p => room.globalScores[p.id] !== undefined)
      .sort((a, b) => (room.globalScores[b.id] || 0) - (room.globalScores[a.id] || 0))
      .map(p => ({ id: p.id, name: p.name, color: p.color, score: room.globalScores[p.id] || 0 }));
    io.to(code).emit('global_scores_updated', { globalScores: room.globalScores, leaderboard });
  });

  // ──────────────────────────────────────────────────────────────────────────
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ─── Room eviction: drop rooms idle for >60 minutes every 10 minutes ─────────
const ROOM_IDLE_TTL_MS = 60 * 60 * 1000;   // 60 min
const EVICTION_INTERVAL_MS = 10 * 60 * 1000; // 10 min
setInterval(() => {
  const evicted = evictStaleRooms(ROOM_IDLE_TTL_MS);
  if (evicted.length > 0) {
    console.log(`[eviction] Dropped ${evicted.length} idle room(s):`, evicted);
  }
}, EVICTION_INTERVAL_MS).unref(); // .unref() so this timer doesn't keep the process alive during tests
