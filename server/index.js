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
  restoreRooms,
  persistSoon,
  listRoomsSummary,
  getAllRooms,
} = require('./game/roomManager');
const { loadRooms } = require('./game/persistence');
const { selectQuestions, selectSituationalQuestions, selectThisOrThatQuestions, selectDrawingQuestion, selectMixedQuestions, shuffleAnswers } = require('./game/gameLogic');
const { buildMiniGameSnapshot } = require('./game/miniGameSnapshot');
const { computeCanonicalRoute } = require('./game/canonicalRoute');
const { tallyVotes } = require('./game/ScoreCalculator');
const eventLog = require('./game/eventLog');
const { sanitizeStrokes, clampText, createRateLimiter, MAX_ANSWER } = require('./game/limits');
const { renderDashboard } = require('./admin/dashboard');
const log = require('./logger');

// Per-socket flood guard. Generous so normal play never trips it.
const rateLimiter = createRateLimiter({ windowMs: 1000, max: 80 });
let lastRateLog = 0; // throttle the rate-limit warning so a flood can't spam logs
const TimerManager = require('./game/TimerManager');
const SubmissionTracker = require('./game/SubmissionTracker');
const VoteCollector = require('./game/VoteCollector');
const { setupDtGame, DT_DRAW_SECS, DT_PROMPT_SECS, DT_GUESS_SECS, DT_VOTE_SECS } = require('./game/dtGame');
const { createMltGame } = require('./game/mltGame');
const { createTotGame } = require('./game/totGame');
const mltPromptBank = require('./questions/mostLikelyTo');
const { words: drawWordBank, prompts: drawPrompts } = require('./questions/drawing');
const { selfiePrompts } = require('./questions/selfie');
const { isConfigured: storageConfigured, createPresignedUpload, getPublicBaseUrl } = require('./storage/photoStorage');

// Fisher-Yates shuffle (unbiased, unlike .sort(() => Math.random() - 0.5))
const fisherYatesShuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Select `count` items from `pool`, preferring items not in `history`.
// History is trimmed so at most 70% of the pool is excluded, ensuring there's
// always a fresh pool to draw from. After consuming items, the caller should
// append them to history.
const selectWithHistory = (pool, history, count, keyFn = (x) => typeof x === 'string' ? x : (x.template || JSON.stringify(x))) => {
  const maxExclude = Math.floor(pool.length * 0.7);
  const recentHistory = history.slice(-maxExclude);
  const unused = pool.filter(item => !recentHistory.includes(keyFn(item)));
  const priorityPool = unused.length >= count ? unused : pool;
  return fisherYatesShuffle(priorityPool).slice(0, count);
};

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

// CORS origin: lock to an allowlist in production via ALLOWED_ORIGINS
// (comma-separated). Unset → '*' (open) for local dev; warn if left open in prod.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const corsOrigin = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : '*';
if (corsOrigin === '*' && process.env.NODE_ENV === 'production') {
  log.warn('CORS: ALLOWED_ORIGINS not set — allowing ALL origins; set it to lock down production.');
}

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get('/ping', (req, res) => res.json({ status: 'awake' }));

// ─── Observability / admin dashboard ─────────────────────────────────────────
// Token-gated (set ADMIN_TOKEN env to enable; disabled by default so room data
// is never exposed accidentally). Lets you list live rooms and read a room's
// per-player event timeline to diagnose "what happened" after a bug report.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const adminAuth = (req, res, next) => {
  if (!ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Admin disabled. Set the ADMIN_TOKEN env var to enable observability endpoints.' });
  }
  // Prefer the Authorization header — query tokens leak via access logs, browser
  // history, referrers and proxies. The ?token= query param is kept as a fallback
  // for the embedded dashboard, whose in-page fetches use it.
  const authHeader = req.get('authorization') || '';
  const headerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : authHeader;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const token = String(headerToken || queryToken).trim();
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Forbidden: bad or missing admin token' });
  }
  return next();
};

// Strip heavy blobs (photos, strokes) from a room snapshot so the state endpoint
// stays light; keep counts so you can still see the shape of the round.
const stripHeavyBlobs = (room) => {
  const clone = JSON.parse(JSON.stringify(TimerManager.sanitizeForClient(room)));
  const countKeys = (o) => (o && typeof o === 'object' ? Object.keys(o).length : 0);
  if (clone.playerPhotos) clone.playerPhotos = `<${countKeys(clone.playerPhotos)} photos>`;
  if (clone.selfie) { clone.selfie.photos = `<${countKeys(clone.selfie.photos)} photos>`; clone.selfie.strokes = `<${countKeys(clone.selfie.strokes)} drawings>`; }
  if (clone.draw?.submissions) clone.draw.submissions = `<${countKeys(clone.draw.submissions)} drawings>`;
  if (clone.dt?.chains) clone.dt.chains = `<${countKeys(clone.dt.chains)} chains>`;
  return clone;
};

app.get('/admin/rooms', adminAuth, (req, res) => {
  res.json({ rooms: listRoomsSummary() });
});

app.get('/admin/rooms/:code/log', adminAuth, (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  res.json({ code, start: eventLog.getStart(code), events: eventLog.getLog(code) });
});

app.get('/admin/rooms/:code/state', adminAuth, (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  return res.json({ code, state: stripHeavyBlobs(room) });
});

// Minimal self-contained dashboard (HTML lives in ./admin/dashboard.js).
app.get('/admin', adminAuth, (req, res) => {
  res.type('html').send(renderDashboard(encodeURIComponent(req.query.token)));
});

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
    log.error('upload-photo-url failed', err.message);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOrigin, // '*' for dev; ALLOWED_ORIGINS allowlist in prod
    methods: ['GET', 'POST'],
  },
  // Tighter heartbeat so a silently-dropped player (phone sleep, tunnel, closed
  // laptop) is detected in ~seconds instead of Socket.IO's ~45s default. This is
  // what makes the "Reconnecting…" overlay and disconnect handling feel instant.
  pingInterval: 5000,
  pingTimeout: 5000,
  // Transport-level cap on a single message. Headroom for a maxed-out drawing
  // (500 strokes × 300 points ≈ 1.8MB) and a compressed photo, but bounds abuse.
  maxHttpBufferSize: 3 * 1024 * 1024,
});

// ─── Restore persisted rooms on boot ────────────────────────────────────────
// Reload any rooms that were active when the process last stopped, so players'
// auto-reconnecting sockets land straight back in their game instead of finding
// the room gone. Best-effort — a failed restore just starts empty.
try {
  const restored = restoreRooms(loadRooms());
  if (restored > 0) log.info('persistence: restored rooms from disk', { rooms: restored });
} catch (err) {
  log.error('persistence: restore failed', err.message);
}

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

const sanitizeRoomForClient = (room) => TimerManager.sanitizeForClient(room);

// ─── MLT game controller ──────────────────────────────────────────────────────
// mltGame is a reusable controller created once at startup.  Socket handlers
// below call mltGame.start / startVoting / showResults / nextRound / skipRound.
let mltGame; // declared before definition so onRoundStart callback can reference it

// ─── ToT game controller ──────────────────────────────────────────────────────
// totGame holds startTimer / closeRound / sendEnd extracted from index.js helpers.
let totGame;
// ─── Answer-phase timer (WST / Situational answering) ─────────────────────────

const startAnswerTimer = (io, room, code, seconds, onExpire) => {
  room._timers = room._timers || {};
  if (room._timers.answer) room._timers.answer.cancel();
  room.answerSecondsLeft = seconds;
  room.answerPaused = false;
  room._timers.answer = TimerManager.create({
    io,
    code,
    seconds,
    tickEvent: 'phase_timer',
    extraData: { phase: 'answering' },
    isActive: () => room.phase === 'question',
    onTick: (s) => { room.answerSecondsLeft = s; },
    onPause: () => { room.answerPaused = true; },
    onResume: () => { room.answerPaused = false; },
    onExpire,
  });
};

const startWstVotingTimer = (io, room, code) => {
  room._timers = room._timers || {};
  if (room._timers.wstVoting) room._timers.wstVoting.cancel();
  
  const seconds = 30;
  room.wstVotingSecondsLeft = seconds;
  room.wstVotingPaused = false;
  
  room._timers.wstVoting = TimerManager.create({
    io,
    code,
    seconds,
    tickEvent: 'phase_timer',
    extraData: { phase: 'wst-voting' },
    isActive: () => room.phase === 'voting',
    onTick: (s) => { room.wstVotingSecondsLeft = s; },
    onPause: () => { room.wstVotingPaused = true; },
    onResume: () => { room.wstVotingPaused = false; },
    onExpire: () => {
      io.to(code).emit('all_votes_in', { currentIndex: room.currentAnswerIndex });
    }
  });
};

// ─── Draw helpers ─────────────────────────────────────────────────────────────

const pickDrawWord = () => {
  return drawWordBank[Math.floor(Math.random() * drawWordBank.length)];
};

const startDrawTimer = (io, room, code, seconds) => {
  room._timers = room._timers || {};
  if (room._timers.draw) room._timers.draw.cancel();
  room.draw.secondsLeft = seconds;
  room.draw.submissions = {};
  room.draw._submissionTracker = SubmissionTracker.create({
    getExpectedCount: () => room.players.filter(p => p.isConnected && p.isPlaying).length,
    onRecord: (playerId, data) => { room.draw.submissions[playerId] = data; },
    onComplete: () => { room._timers?.draw?.cancel(); startDrawVoting(io, room, code); },
  });
  room._timers.draw = TimerManager.create({
    io,
    code,
    seconds,
    tickEvent: 'draw:timer',
    isActive: () => room.draw?.phase === 'drawing',
    onTick: (s) => { room.draw.secondsLeft = s; },
    onExpire: () => startDrawVoting(io, room, code),
  });
};

const startDrawVoting = (io, room, code) => {
  if (!room.draw || room.draw.phase !== 'drawing') return;
  room.draw.phase = 'voting';
  room.draw.votes = {};
  room.draw._voteCollector = VoteCollector.create({
    getExpectedCount: () => room.players.filter(p => p.isConnected && p.isPlaying).length,
    allowSelfVote: false,
    onVote: (voterId, targetId) => { room.draw.votes[voterId] = targetId; },
    onComplete: () => resolveDrawVoting(io, room, code),
  });
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
  // Tally votes (shared primitive: seed players, ignore votes for unknown targets)
  const { voteCounts } = tallyVotes(room.draw.votes, { players: playingPlayers, countUnseeded: false });
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

// ─── ToT timer / round helpers ────────────────────────────────────────────────
// startTotTimer, closeTotRound, assignTotTitles have been moved to
// server/game/totGame.js (totGame controller).
// Call totGame.startTimer / totGame.closeRound / totGame.sendEnd below.
// ─────────────────────────────────────────────────────────────────────────────

// ─── MLT helpers ─────────────────────────────────────────────────────────────
// closeMltVoting, startMltTimer, assignMltTitles, sendMltEnd have been moved to
// server/game/mltGame.js and are now encapsulated inside the mltGame controller.
// Socket handlers below call mltGame.start / showResults / nextRound / skipRound.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Situational helpers ──────────────────────────────────────────────────────

// Pick the next non-host connected player to be the situational target (round-robin)
const pickSituationalTarget = (room) => {
  const eligible = room.players.filter(p => p.isConnected && p.isPlaying);
  if (eligible.length === 0) return null;
  const idx = room.sit.targetPlayerIndex % eligible.length;
  room.sit.targetPlayerIndex = (idx + 1) % eligible.length;
  return eligible[idx];
};

// Advance WST/Situational answer phase to voting (called when all answer or timer expires)
const advanceWstAnswerPhase = (io, room, code) => {
  if (room.phase !== 'question') return; // guard against double-fire
  const connectedPlayersCount = activePlayers(room).length;
  room._timers?.answer?.cancel();
  room.answers = shuffleAnswers(room.answers);
  const q = room.questions[room.currentQuestionIndex];

  if (q?.type === 'situational') {
    // Situational: show all answers at once, vote for best
    room.phase = 'sit-voting';
    room.sit.votes = {};
    room.sit._voteCollector = VoteCollector.create({
      getExpectedCount: () => activePlayers(room).length,
      allowSelfVote: false,
      onVote: (voterId, targetId) => { room.sit.votes[voterId] = targetId; },
      onComplete: () => closeSitVoting(io, room, code),
    });
    const mappedAnswers = room.answers.map(a => ({ id: a.playerId, text: a.text }));
    io.to(code).emit('phase_timer', { secondsLeft: 0 }); // clear answering timer
    io.to(code).emit('sit:voting_started', {
      answers: mappedAnswers,
      question: room.currentQuestion,
      totalVoters: connectedPlayersCount,
    });

    room._timers = room._timers || {};
    if (room._timers.sitVoting) room._timers.sitVoting.cancel();
    room._timers.sitVoting = TimerManager.create({
      io,
      code,
      seconds: 45,
      tickEvent: 'phase_timer',
      extraData: { phase: 'sit-voting' },
      isActive: () => room.phase === 'sit-voting',
      onExpire: () => closeSitVoting(io, room, code),
    });
  } else {
    // WST: reveal one answer at a time, guess who wrote it
    room.phase = 'voting';
    room.currentAnswerIndex = 0;
    const mappedAnswers = room.answers.map(a => ({ text: a.text }));
    const expectedVotes = connectedPlayersCount;
    io.to(code).emit('phase_timer', { secondsLeft: 0 }); // clear answering timer
    io.to(code).emit('voting_started', { answers: mappedAnswers, currentIndex: 0, totalPlayers: expectedVotes });
    startWstVotingTimer(io, room, code);
    room.answers.forEach((answer, idx) => {
      const authorPlayer = room.players.find(p => p.id === answer.playerId);
      if (authorPlayer?.socketId) {
        io.to(getPlayerSocket(authorPlayer)).emit('my_answer_index', { index: idx });
      }
    });
  }
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
  room._answerTracker = SubmissionTracker.create({
    getExpectedCount: () => activePlayers(room).length,
    onComplete: () => advanceWstAnswerPhase(io, room, code),
  });

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
    // Auto-submit fallback for any player who didn't answer in time.
    // Push to room.answers BEFORE record() so that if onComplete fires
    // synchronously inside record(), advanceWstAnswerPhase sees all answers.
    activePlayers(room).forEach(p => {
      if (!room._answerTracker?.has(p.id)) {
        const draft = (room.answerDrafts || {})[p.id] || '';
        const answerData = { playerId: p.id, playerName: p.name, text: draft || '...', votes: [] };
        room.answers.push(answerData);
        room._answerTracker?.record(p.id, answerData);
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
    // advanceWstAnswerPhase may have already been triggered by onComplete inside
    // the forEach above; the phase guard inside it prevents double execution.
    advanceWstAnswerPhase(io, room, code);
  });
};

// Emit a This-or-That round prompt and start the countdown timer
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

  totGame.startTimer(io, room, code, timeLimit);
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

// Close a ToT voting round and broadcast results — delegated to totGame
const closeTotRound = (io, room, code) => totGame.closeRound(io, room, code);

// Assign ToT personality titles — delegated to totGame module
const assignTotTitles = (leaderboard) => {
  const { assignTotTitles: fn } = require('./game/totGame');
  return fn(leaderboard);
};

// ─────────────────────────────────────────────────────────────────────────────

// ─── Situational helpers ─────────────────────────────────────────────────────

const closeSitVoting = (io, room, code) => {
  room.phase = 'sit-results';

  // Tally votes per answer (answerId = authorPlayerId) via the shared primitive.
  const { voteCounts, maxVotes } = tallyVotes(room.sit.votes, {
    players: room.answers.map(a => ({ id: a.playerId })),
    countUnseeded: false,
  });

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

  const payload = {
    answers: answersWithDetails,
    scores: { ...room.scores },
    players: scorePlayers,
    winners: room.answers
      .filter(a => voteCounts[a.playerId] === maxVotes && maxVotes > 0)
      .map(a => a.playerId),
  };
  // Stash authoritative results for reconnect restore (client uses these instead
  // of recomputing the tally from raw votes — avoids drift).
  room.sit.lastResults = payload;
  io.to(code).emit('sit:results', payload);
};

// ─────────────────────────────────────────────────────────────────────────────

// Players who count toward round thresholds (connected, playing, not waiting for next round)
const activePlayers = (room) => room.players.filter(p => p.isConnected && p.isPlaying && !p.joinedMidRound);

// Instantiate after activePlayers is defined (mltGame.js defines its own copy but we need
// mergeToGlobalScores which was defined earlier).
mltGame = createMltGame({ mergeToGlobalScores });
totGame = createTotGame({ mergeToGlobalScores });

// ─── Resume timers for restored rooms (after a server restart) ──────────────
// Persistence brings back round state but not live timers. Re-create ONLY the
// countdown for the current timed phase from the persisted remaining seconds so
// the round keeps ticking and auto-advances on expiry — no game state is reset
// (each onExpire is the same phase-guarded advance the live timer used). Phases
// not covered (WST answering, fill-in-the-blank, draw-telephone) still advance
// via the all-submit threshold or host controls, exactly as before.
const resumeRoomTimers = (io, room) => {
  if (!room || !room.phase) return;
  const code = room.code;
  room._timers = room._timers || {};
  try {
    if (room.phase === 'drawing' && room.draw?.phase === 'drawing') {
      room._timers.draw = TimerManager.create({
        io, code, seconds: room.draw.secondsLeft ?? room.draw.timeLimit ?? 90,
        tickEvent: 'draw:timer',
        isActive: () => room.draw?.phase === 'drawing',
        onTick: (s) => { room.draw.secondsLeft = s; },
        onExpire: () => startDrawVoting(io, room, code),
      });
    } else if (room.phase === 'tot' && room.tot?.roundState === 'voting') {
      // totGame.startTimer only (re)sets the countdown + timer — no vote reset.
      totGame.startTimer(io, room, code, room.tot.secondsLeft ?? (room.roomConfig?.roundDurationSecs || 30));
    } else if (room.phase === 'sit-voting') {
      // Remaining not persisted for sit voting → resume with a fresh window.
      room._timers.sitVoting = TimerManager.create({
        io, code, seconds: 45,
        tickEvent: 'phase_timer', extraData: { phase: 'sit-voting' },
        isActive: () => room.phase === 'sit-voting',
        onExpire: () => closeSitVoting(io, room, code),
      });
    } else if (room.phase === 'voting') {
      // WST per-answer voting window (remaining not persisted → fresh 30s).
      startWstVotingTimer(io, room, code);
    }
  } catch (err) {
    log.warn('timer resume failed', { code, phase: room.phase, err: err.message });
  }
};

// Now that all helpers + controllers exist, restart restored rooms' timers.
getAllRooms().forEach(room => resumeRoomTimers(io, room));

// Cancel all active game timers for a room (called before starting a new game)
function cancelAllTimers(room) {
  TimerManager.cancelAll(room);
}

// ─── Socket-identity helpers ────────────────────────────────────────────────
// When a host player opens the TV/host-screen at /host, HostPage.jsx creates a
// NEW socket and calls join_spectator, which sets hostPlayer.tvSocketId to the TV socket id.
// This allows hostPlayer.socketId to remain strictly the phone controller socket, preventing
// reconnection conflicts and restoring clear event targeting.
//
// findPlayer   — locate a player by EITHER their phone socket, TV socket, or legacy phoneSocketId.
//
// getPlayerSocket — return the phone/mobile socket id when present so personal game events
//                   reach their controller instead of the TV screen.

function findPlayer(room, socketId) {
  return room.players.find(p => p.socketId === socketId || p.tvSocketId === socketId || p.phoneSocketId === socketId);
}

function getPlayerSocket(player) {
  if (player.tvSocketId) return player.socketId;
  return player.phoneSocketId || player.socketId;
}
// ────────────────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  log.debug('socket connected', { id: socket.id });

  // ─── Flood guard ────────────────────────────────────────────────────────────
  // Drop events from a socket that exceeds the per-second rate limit. Silent
  // (no next()) so an abusive client is throttled without disrupting others.
  socket.use((packet, next) => {
    if (rateLimiter.allow(socket.id)) return next();
    const now = Date.now();
    if (now - lastRateLog > 1000) { lastRateLog = now; log.warn('rate-limit: throttling socket', { id: socket.id }); }
    // drop: do not call next()
  });

  // ─── Observability: record every inbound event ─────────────────────────────
  // One middleware captures all client→server events with player + phase
  // context, building a per-room timeline for debugging. Best-effort and never
  // blocks the handler. Payloads are summarised in eventLog (no blobs stored).
  socket.use(([event, ...args], next) => {
    try {
      const room = getRoomBySocketId(socket.id);
      const code = room?.code || args[0]?.code || null;
      const player = room ? findPlayer(room, socket.id) : null;
      eventLog.logInbound(code, event, player?.id, room?.phase, args[0]);
    } catch (_) { /* logging must never break gameplay */ }
    next();
  });

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

  // ─── Server-authoritative screen check ─────────────────────────────────────
  // A client periodically asks "what screen should I be on?" and the server —
  // which knows the full per-player truth (whose turn, who submitted) — answers
  // via the ack. The client navigates only if it's on the wrong screen, so a
  // missed navigation event self-heals within one poll interval.
  socket.on('whats_my_screen', ({ code } = {}, ack) => {
    if (typeof ack !== 'function') return;
    try {
      const room = (code && getRoom(code)) || getRoomBySocketId(socket.id);
      if (!room) { ack(null); return; }
      const player = findPlayer(room, socket.id);
      if (!player) { ack(null); return; }
      ack(computeCanonicalRoute(room, player.id));
    } catch (_) {
      ack(null);
    }
  });

  // ─── On-demand resync ──────────────────────────────────────────────────────
  // A client that suspects it may be stale (tab regained focus after phone
  // sleep, a suspected missed event) can ask for a fresh authoritative snapshot
  // at any time. Reuses the exact same payload as a rejoin so the client's
  // restore path rebuilds the correct screen — no bespoke second code path.
  socket.on('request_resync', ({ code } = {}) => {
    try {
      const room = (code && getRoom(code)) || getRoomBySocketId(socket.id);
      if (!room) return;
      const player = findPlayer(room, socket.id);
      if (!player) return;
      touchRoom(room.code);
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
    } catch (_) {
      // Best-effort — a failed resync just leaves the client on its current state.
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
    const player = findPlayer(room, socket.id);
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
    const player = findPlayer(room, socket.id);
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
    const player = findPlayer(room, socket.id);
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
      room._timers?.answer?.cancel();
      const [replacement] = selectSituationalQuestions(1);
      room.questions[room.currentQuestionIndex] = replacement;
      room.answers = [];
      room.sit.votes = {};
      room.sit._voteCollector?.reset();
      room.skipVotes = [];
      room.phase = 'question';
      emitWstQuestion(io, room, code);
      io.to(code).emit('question_changed', { code });
    } else if (qType === 'wst' && (room.phase === 'question' || room.phase === 'voting')) {
      room._timers?.answer?.cancel();
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
    const player = findPlayer(room, socket.id);
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
    room.sit._voteCollector?.reset();
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

    const player = findPlayer(room, socket.id);
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
    const host = findPlayer(room, socket.id);
    if (!host || !host.isHost) return;

    const targetPlayerIndex = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetPlayerIndex !== -1) {
      const targetPlayer = room.players[targetPlayerIndex];
      const targetSocketId = targetPlayer.socketId;
      const targetPhoneSocketId = targetPlayer.phoneSocketId;
      const targetTvSocketId = targetPlayer.tvSocketId;
      
      // Remove from room
      room.players.splice(targetPlayerIndex, 1);
      
      // Notify remaining players
      io.to(code).emit('player_joined', { players: room.players });
      
      // Disconnect the target player explicitly (TV socket, phone socket, and phoneSocketId if present)
      if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
        io.sockets.sockets.get(targetSocketId).emit('kicked');
        io.sockets.sockets.get(targetSocketId).disconnect(true);
      }
      if (targetPhoneSocketId && io.sockets.sockets.get(targetPhoneSocketId)) {
        io.sockets.sockets.get(targetPhoneSocketId).emit('kicked');
        io.sockets.sockets.get(targetPhoneSocketId).disconnect(true);
      }
      if (targetTvSocketId && io.sockets.sockets.get(targetTvSocketId)) {
        io.sockets.sockets.get(targetTvSocketId).emit('kicked');
        io.sockets.sockets.get(targetTvSocketId).disconnect(true);
      }
    }
  });

  socket.on('answer_draft', ({ code, text }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'question') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isConnected || !player.isPlaying) return;
    if (!room.answerDrafts) room.answerDrafts = {};
    room.answerDrafts[player.id] = typeof text === 'string' ? text.trim().slice(0, 300) : '';
  });

  socket.on('submit_answer', ({ code, text }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'question') return;
    touchRoom(code);

    const player = findPlayer(room, socket.id);
    if (!player || !player.isConnected || !player.isPlaying) return;

    const clean = clampText(text, MAX_ANSWER); // bound stored answer length

    const existingAnswer = room.answers.find(a => a.playerId === player.id);
    if (existingAnswer) {
      existingAnswer.text = clean;
      existingAnswer.votes = [];
      room._answerTracker?.update(player.id, (prev) => ({ ...prev, text: clean, votes: [] }));
    } else {
      const answerData = { playerId: player.id, playerName: player.name, text: clean, votes: [] };
      // Push to room.answers BEFORE recording in the tracker so that when
      // onComplete fires (synchronously inside record()), advanceWstAnswerPhase
      // sees all answers including this last one.
      room.answers.push(answerData);
      room._answerTracker?.record(player.id, answerData);
    }

    const connectedPlayersCount = activePlayers(room).length;
    const answeredCount = room._answerTracker?.count() ?? room.answers.length;
    const answeredPlayerIds = room._answerTracker?.getPlayerIds() ?? room.answers.map(a => a.playerId);
    io.to(code).emit('answer_received', { answeredCount, totalPlayers: connectedPlayersCount, answeredPlayerIds });

    if ((room._answerTracker?.isComplete()) || answeredCount >= connectedPlayersCount) {
      advanceWstAnswerPhase(io, room, code);
    }
  });

  socket.on('sit:vote', ({ code, answerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'sit-voting') return;

    const player = findPlayer(room, socket.id);
    if (!player || !player.isConnected || !player.isPlaying) return;
    if (answerId === player.id) return;           // can't vote own answer

    // Use VoteCollector for dedup + threshold detection
    const accepted = room.sit._voteCollector
      ? room.sit._voteCollector.castVote(player.id, answerId)
      : !room.sit.votes[player.id];
    if (!accepted) return;

    room.sit.votes[player.id] = answerId; // keep legacy map in sync

    const connectedPlayersCount = activePlayers(room).length;
    const voteCount = room.sit._voteCollector?.count() ?? Object.keys(room.sit.votes).length;
    io.to(code).emit('sit:vote_received', {
      voteCount,
      totalVoters: connectedPlayersCount,
      votedPlayerIds: room.sit._voteCollector?.getVoterIds() ?? Object.keys(room.sit.votes),
    });

    // Fallback close if no VoteCollector (onComplete handles threshold when collector exists)
    if (!room.sit._voteCollector) {
      const allVoted = activePlayers(room).every(p => room.sit.votes[p.id]);
      if (voteCount >= connectedPlayersCount || allVoted) {
        closeSitVoting(io, room, code);
      }
    }
  });

  socket.on('sit:force_results', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'sit-voting') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    if (room._timers?.sitVoting) room._timers.sitVoting.cancel();
    closeSitVoting(io, room, code);
  });

  socket.on('sit:next', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'sit-results') return;

    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    room.sit.votes = {};
    room.sit._voteCollector?.reset();
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

    const player = findPlayer(room, socket.id);
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
    log.debug('WST vote', { votes: currentAnswer.votes.length, expected: expectedVotes, code });

    if (currentAnswer.votes.length >= expectedVotes) {
      if (room._timers?.wstVoting) room._timers.wstVoting.cancel();
      io.to(code).emit('all_votes_in', { currentIndex: room.currentAnswerIndex });
    }
  });



  socket.on('next_answer_request', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'voting') return;

    if (room._timers?.wstVoting) room._timers.wstVoting.cancel();

    room.currentAnswerIndex++;
    if (room.currentAnswerIndex < room.answers.length) {
      startWstVotingTimer(io, room, code);
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

    const player = findPlayer(room, socket.id);
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

    const player = findPlayer(room, socket.id);
    if (!player || !player.isConnected || !player.isPlaying) return;

    const pid = player.id;
    if (room.tot.votesA[pid] || room.tot.votesB[pid]) return; // already voted

    if (choice === 'a') {
      room.tot.votesA[pid] = true;
    } else if (choice === 'b') {
      room.tot.votesB[pid] = true;
    } else {
      return;
    }

    const connectedPlayers = activePlayers(room);
    const voteCount = Object.keys(room.tot.votesA).length + Object.keys(room.tot.votesB).length;
    io.to(code).emit('tot:vote_received', {
      voteCount,
      totalVoters:    connectedPlayers.length,
      votedPlayerIds: [...Object.keys(room.tot.votesA), ...Object.keys(room.tot.votesB)],
    });

    const allVoted = connectedPlayers.every(p => room.tot.votesA[p.id] || room.tot.votesB[p.id]);
    if (voteCount >= connectedPlayers.length || allVoted) {
      totGame.closeRound(io, room, code);
    }
  });

  socket.on('tot:next_round', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'tot') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    if (room.currentRound >= room.totalRounds) {
      if (room.gameType === 'this-or-that') {
        totGame.sendEnd(io, room, code);
      } else {
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    if (room.currentRound >= room.totalRounds) {
      if (room.gameType === 'this-or-that') {
        totGame.sendEnd(io, room, code);
      } else {
        room.phase = 'gameEnd';
        io.to(code).emit('game_ended', { finalScores: room.tot.scores, players: room.players, stats: {} });
        mergeToGlobalScores(io, room, room.tot.scores);
      }
      return;
    }

    room._timers?.tot?.cancel();
    room.currentRound++;
    room.currentQuestionIndex++;
    emitNextQuestion(io, room, code);
  });

  // Change the current question without advancing the round counter
  socket.on('tot:change_question', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'tot') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    room._timers?.tot?.cancel();

    // Find the next unused ToT question in the pool and swap it in
    let nextIdx = -1;
    for (let i = room.currentQuestionIndex + 1; i < room.questions.length; i++) {
      if (room.questions[i].type === 'this-or-that' || room.questions[i].a) {
        nextIdx = i;
        break;
      }
    }
    if (nextIdx === -1) {
      // No replacement available — re-emit same question with fresh timer
      emitTotQuestion(io, room, code);
      return;
    }
    const replacement = room.questions[nextIdx];
    room.questions[nextIdx] = room.questions[room.currentQuestionIndex];
    room.questions[room.currentQuestionIndex] = replacement;
    emitTotQuestion(io, room, code);
  });

  socket.on('tot:pause', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'tot' || room.tot.roundState !== 'voting') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    room._timers?.tot?.pause();
    io.to(code).emit('tot:paused', { secondsLeft: room.tot.secondsLeft });
  });

  socket.on('tot:resume', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'tot' || room.tot.roundState !== 'voting') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    room._timers?.tot?.resume();
    io.to(code).emit('tot:resumed', { secondsLeft: room.tot.secondsLeft });
  });

  socket.on('answer:pause', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    if (room.phase !== 'question' && room.phase !== 'sit-voting' && room.phase !== 'voting') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    
    if (room.phase === 'question') room._timers?.answer?.pause();
    if (room.phase === 'sit-voting') room._timers?.sitVoting?.pause();
    if (room.phase === 'voting') room._timers?.wstVoting?.pause();
  });

  socket.on('answer:resume', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    if (room.phase !== 'question' && room.phase !== 'sit-voting' && room.phase !== 'voting') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    
    if (room.phase === 'question') room._timers?.answer?.resume();
    if (room.phase === 'sit-voting') room._timers?.sitVoting?.resume();
    if (room.phase === 'voting') room._timers?.wstVoting?.resume();
  });

  // ──────────────────────────────────────────────────────────────────────────

  // ─── Host screen spectator ──────────────────────────────────────────────────

  socket.on('join_spectator', ({ code } = {}) => {
    if (!code || typeof code !== 'string') { socket.emit('error', { message: 'Room code required' }); return; }
    const room = getRoom(code.toUpperCase().slice(0, 8));
    if (!room) { socket.emit('error', { message: 'Room not found' }); return; }

    const playerId = null;
    socket.join(room.code);

    // Transfer host socket to this TV/host-screen connection so all host-guarded
    // events work regardless of whether the room was created from this socket.
    const hostPlayer = room.players.find(p => p.isHost);
    if (hostPlayer) {
      // Preserve the host player's original phone socket so they can still
      // participate in games (drawing, guessing, voting) on their phone.
      if (hostPlayer.socketId && hostPlayer.socketId !== socket.id) {
        hostPlayer.phoneSocketId = hostPlayer.socketId;
      }
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
          prompt:      room.mlt.prompt,   // was currentPrompt before mltGame migration
          round:       room.mlt.round,
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
        dt: (room.phase === 'dt' || room.phase?.startsWith('dt-')) ? (() => {
          const myGuessChain = room.dt.phase === 'guessing' ? Object.values(room.dt.chains || {}).find(c => c.targetPlayerId === playerId) : null;
          const myDrawChain = room.dt.phase === 'drawing' ? Object.values(room.dt.chains || {}).find(c => c.participants[c.currentParticipantIndex] === playerId) : null;
          const buildCombinedStrokesLocal = (chain) => chain.drawingSteps.flatMap(step => step.strokes || []);
          return {
            phase: room.dt.phase,
            promptsSubmittedCount: (room.dt.prompts || []).length,
            totalPrompts: playingPlayers.length,
            submittedPlayerIds: (room.dt.prompts || []).map(p => p.authorId).filter(Boolean),
            guessedCount: Object.keys(room.dt.guesses || {}).length,
            totalGuessers: playingPlayers.length,
            guessedPlayerIds: Object.keys(room.dt.guesses || {}),
            hasGuessed: !!room.dt.guesses?.[playerId],
            guessSecondsLeft: room._timers?.dtGuess ? room._timers.dtGuess.getSecondsLeft() : 60,
            guessTurn: myGuessChain ? {
              promptId: myGuessChain.id,
              finalStrokes: buildCombinedStrokesLocal(myGuessChain),
              originalSelfieData: myGuessChain.originalSelfieData,
              drawerCount: myGuessChain.drawingSteps.length,
              secondsLeft: room._timers?.dtGuess ? room._timers.dtGuess.getSecondsLeft() : 60,
            } : null,
            currentTurn: myDrawChain ? {
              promptId: myDrawChain.id,
              word: myDrawChain.currentParticipantIndex === 0 ? myDrawChain.templateText.replace(/\[name\]/gi, myDrawChain.targetName) : 'Draw what you see!',
              isInitial: myDrawChain.currentParticipantIndex === 0,
              targetName: myDrawChain.targetName,
              originalSelfieData: myDrawChain.originalSelfieData,
              previousStrokes: buildCombinedStrokesLocal(myDrawChain),
              secondsLeft: room._timers?.[`dtDraw_${myDrawChain.id}`] ? room._timers[`dtDraw_${myDrawChain.id}`].getSecondsLeft() : 60,
            } : null,
            reveal: room.dt.phase === 'reveal' ? (() => {
              const chainId = room.dt.revealQueue?.[room.dt.revealCurrentIndex];
              const c = room.dt.chains?.[chainId];
              return c ? {
                promptId: c.id,
                targetPlayerId: c.targetPlayerId,
                targetName: c.targetName,
                authorId: c.authorId,
                authorName: room.players.find(p=>p.id===c.authorId)?.name,
                templateText: c.templateText,
                finalText: c.finalText,
                originalSelfieData: c.originalSelfieData,
                drawingSteps: c.drawingSteps,
                finalStrokes: buildCombinedStrokesLocal(c),
                guesses: Object.keys(room.dt.guesses || {}).map(pid => ({ playerId: pid, playerName: room.players.find(p=>p.id===pid)?.name, guessText: room.dt.guesses[pid] })),
                revealStep: room.dt.revealStep,
                votes: room.dt.votes?.[c.id] || {},
              } : null;
            })() : null,
          };
        })() : null,
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    log.debug('socket disconnected', { id: socket.id });
    rateLimiter.forget(socket.id);
    const room = getRoomBySocketId(socket.id);
    if (room) {
      const { player, newHost, wentOffline } = removePlayerBySocketId(socket.id, false);
      // If an MLT timer is running and room is now empty, clean it up
      if (room.phase === 'mlt' && room._timers?.mlt && room.players.filter(p => p.isConnected).length === 0) {
        room._timers.mlt.cancel();
        room._timers.mlt = null;
      }
      // Only announce a disconnect if the player actually went fully offline.
      // Closing a secondary socket (e.g. the TV screen while the phone stays on)
      // must not flag the player as disconnected to everyone else.
      if (player && wentOffline) {
        io.to(room.code).emit('player_disconnected', { playerId: player.id, playerName: player.name });
        eventLog.logSystem(room.code, 'disconnect', player.id, room.phase, { name: player.name });
        if (newHost) {
          io.to(room.code).emit('host_changed', { host: newHost.id });
          eventLog.logSystem(room.code, 'host_migrated', newHost.id, room.phase, { name: newHost.name });
        }
        // Persist the changed connection/host state.
        persistSoon();
      }
    }
  });

  // ─── Most Likely To events ─────────────────────────────────────────────────
  // Game logic is in server/game/mltGame.js (built on VotingGameTemplate).
  // These handlers validate auth/state then delegate to mltGame.* methods.

  socket.on('mlt:start', ({ code, rounds }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    cancelAllTimers(room);

    const connectedPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    if (connectedPlayers.length < 2) return; // need at least 2 votable players

    // Build prompt pool (custom questions take priority, padded with bank)
    const customMltPrompts = (room.customQuestions || []).map(q => q.text).filter(Boolean);
    const promptPool = customMltPrompts.length > 0
      ? [...customMltPrompts, ...mltPromptBank]
      : [...mltPromptBank];

    const totalRounds = Math.min(Math.max(parseInt(rounds) || 5, 1), promptPool.length);

    // Use room-level history to avoid recently seen prompts
    if (!room.promptHistory) room.promptHistory = { mlt: [], fitb: [], caption: [], pmatch: [], photoassoc: [] };
    const shuffled = selectWithHistory(promptPool, room.promptHistory.mlt, totalRounds);

    // Init jokers: 2 per player per game
    const jokers = {};
    connectedPlayers.forEach(p => { jokers[p.id] = 2; });

    room.phase = 'mlt';

    // mltGame.start() initialises room.mlt and triggers round 1 via onRoundStart
    mltGame.start(io, room, code, {
      rounds: totalRounds,
      _initialState: {
        prompts:        shuffled.slice(0, totalRounds),
        totalVotes:     {},
        wins:           {},
        jokers,
        jokersThisRound: {},
        roundState:     'voting',
        allowSelfVote:  true,
      },
    });

    // Track used prompts in room-level history
    shuffled.slice(0, totalRounds).forEach(p => room.promptHistory.mlt.push(p));
  });

  socket.on('mlt:vote', ({ code, targetPlayerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt' || room.mlt.roundState !== 'voting') return;
    touchRoom(code);

    const player = findPlayer(room, socket.id);
    if (!player || !player.isConnected || !player.isPlaying) return;

    const accepted = room.mlt._voteCollector?.castVote(player.id, targetPlayerId);
    if (!accepted) return;
    // room.mlt.votes[player.id] is kept in sync by VoteCollector's onVote callback

    const voteCount  = room.mlt._voteCollector.count();
    const totalVoters = activePlayers(room).length;
    io.to(code).emit('mlt:vote_received', {
      voteCount,
      totalVoters,
      votedPlayerIds: room.mlt._voteCollector.getVoterIds(),
    });
  });

  socket.on('mlt:next_round', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    // nextRound() fires onRoundStart for the next round, or onEnd if game is over
    mltGame.nextRound(io, room, code);
  });

  socket.on('mlt:toggle_joker', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt' || room.mlt.roundState !== 'voting') return;

    const player = findPlayer(room, socket.id);
    if (!player || !player.isConnected || !player.isPlaying) return;

    const pid = player.id;
    const remaining = room.mlt.jokers[pid] ?? 2;

    if (room.mlt.jokersThisRound[pid]) {
      // Toggle OFF — joker refunded (not spent until round closes)
      delete room.mlt.jokersThisRound[pid];
      socket.emit('mlt:joker_state', { jokerActive: false, jokersLeft: remaining });
    } else {
      if (remaining <= 0) return;
      room.mlt.jokersThisRound[pid] = true;
      socket.emit('mlt:joker_state', { jokerActive: true, jokersLeft: remaining - 1 });
    }
  });

  // Replace current prompt without advancing round number
  socket.on('mlt:change_question', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    // Cancel any running timer first
    if (room._timers?.mlt) { room._timers.mlt.cancel(); room._timers.mlt = null; }

    // Pick a new prompt not already used in this game
    const usedPrompts = new Set(room.mlt.prompts.slice(0, room.mlt.round - 1));
    const currentPrompt = room.mlt.prompt;
    const customMltPrompts = (room.customQuestions || []).map(q => q.text).filter(Boolean);
    const fullBank = customMltPrompts.length > 0 ? [...customMltPrompts, ...mltPromptBank] : [...mltPromptBank];
    const freshPool = fullBank.filter(p => p !== currentPrompt && !usedPrompts.has(p));
    const pool = freshPool.length > 0 ? freshPool : fullBank.filter(p => p !== currentPrompt);
    const candidate = (pool.length > 0 ? pool : fullBank)[Math.floor(Math.random() * Math.max(pool.length || fullBank.length, 1))];

    // Update state
    room.mlt.prompt = candidate;
    room.mlt.prompts[room.mlt.round - 1] = candidate;
    room.mlt.votes = {};
    room.mlt.jokersThisRound = {};
    room.mlt.roundState = 'voting';
    room.mlt.phase = 'voting';
    room.mlt.paused = false;
    room.players.forEach(p => { p.joinedMidRound = false; });

    // Re-create VoteCollector for the fresh question
    room.mlt._voteCollector = VoteCollector.create({
      getExpectedCount: () => activePlayers(room).length,
      allowSelfVote:    true,
      onVote:           (voterId, targetId) => { room.mlt.votes[voterId] = targetId; },
      onComplete:       () => mltGame.showResults(io, room, code),
    });

    const players = room.players.filter(p => p.isConnected && p.isPlaying);
    io.to(code).emit('mlt:prompt', {
      prompt:      room.mlt.prompt,
      round:       room.mlt.round,
      totalRounds: room.mlt.totalRounds,
      players:     players.map(p => ({ id: p.id, name: p.name, color: p.color })),
      gameName:    room.gameName,
    });
    io.to(code).emit('mlt:question_changed', { currentPrompt: candidate });

    // Restart voting timer via template (also emits mlt:voting_started, harmless for clients)
    mltGame.startVoting(io, room, code);
  });

  socket.on('mlt:skip', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    // skipRound() advances without scoring; fires onEnd on last round
    mltGame.skipRound(io, room, code);
  });

  socket.on('mlt:restart', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mltEnd') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    if (room._timers?.mlt) { room._timers.mlt.cancel(); room._timers.mlt = null; }

    const prevTotalRounds = room.mlt.totalRounds;
    room.phase = 'lobby';
    room.mlt = {
      roundState:     'waiting',
      phase:          'waiting',
      prompt:         null,
      prompts:        [],
      votes:          {},
      scores:         {},
      totalVotes:     {},
      wins:           {},
      jokers:         {},
      jokersThisRound: {},
      round:          0,
      totalRounds:    prevTotalRounds,
      allowSelfVote:  true,
      paused:         false,
      secondsLeft:    30,
    };

    room.players.forEach(p => { p.isReady = false; });

    io.to(code).emit('mlt:restarted', {
      code:     room.code,
      gameName: room.gameName,
      players:  room.players,
      gameType: room.gameType,
    });
  });

  socket.on('mlt:pause', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt' || room.mlt.roundState !== 'voting') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    if (room.mlt.paused) return;

    room._timers?.mlt?.pause();
    io.to(code).emit('mlt:paused', { secondsLeft: room.mlt.secondsLeft });
  });

  socket.on('mlt:resume', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'mlt' || room.mlt.roundState !== 'voting') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    if (!room.mlt.paused) return;

    room._timers?.mlt?.resume();
    io.to(code).emit('mlt:resumed', { secondsLeft: room.mlt.secondsLeft });
  });

  // ─── Drawing (Sketch It!) handlers ────────────────────────────────────────

  socket.on('draw:start', ({ code, rounds, mode }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = findPlayer(room, socket.id);
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
        if (getPlayerSocket(p)) io.to(getPlayerSocket(p)).emit('draw:secret_word', { word: room.draw.playerWords[p.id] });
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
    const player = findPlayer(room, socket.id);
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
          if (getPlayerSocket(p)) io.to(getPlayerSocket(p)).emit('draw:secret_word', { word: room.draw.playerWords[p.id], skipped: true });
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
      room._timers?.draw?.cancel();
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isPlaying) return;
    const isResubmit = !!room.draw.submissions[player.id];

    // Cap strokes/points, validate colour/width/type via the shared limiter.
    if (!Array.isArray(strokes)) return;
    const sanitized = sanitizeStrokes(strokes);

    const data = { strokes: sanitized, submittedAt: Date.now() };
    if (room.draw._submissionTracker) {
      room.draw._submissionTracker.recordOrUpdate(player.id, data, () => data);
    } else {
      room.draw.submissions[player.id] = data;
    }
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const submittedCount = room.draw._submissionTracker
      ? room.draw._submissionTracker.count()
      : Object.keys(room.draw.submissions).length;
    const submittedPlayerIds = room.draw._submissionTracker
      ? room.draw._submissionTracker.getPlayerIds()
      : Object.keys(room.draw.submissions);
    io.to(code).emit('draw:submission_received', { submittedCount, totalDrawers: playingPlayers.length, submittedPlayerIds });
    log.debug('draw submission', { count: submittedCount, of: playingPlayers.length, code });

    if (!room.draw._submissionTracker && submittedCount >= playingPlayers.length) {
      room._timers?.draw?.cancel();
      startDrawVoting(io, room, code);
    }
  });

  socket.on('draw:skip_to_vote', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'drawing' || !room.draw || room.draw.phase !== 'drawing') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    room._timers?.draw?.cancel();
    startDrawVoting(io, room, code);
  });

  socket.on('draw:vote', ({ code, votedForPlayerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'drawing' || !room.draw || room.draw.phase !== 'voting') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isPlaying) return;
    if (votedForPlayerId === player.id) {
      socket.emit('draw:vote_rejected', { reason: 'no_self_vote' });
      return;
    }
    if (!room.draw.submissions[votedForPlayerId]) {
      socket.emit('draw:vote_rejected', { reason: 'invalid_submission' });
      return;
    }

    // Use VoteCollector for dedup + threshold
    const accepted = room.draw._voteCollector
      ? room.draw._voteCollector.castVote(player.id, votedForPlayerId)
      : !room.draw.votes[player.id];
    if (!accepted) return;

    room.draw.votes[player.id] = votedForPlayerId; // keep legacy map in sync
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const voteCount = room.draw._voteCollector?.count() ?? Object.keys(room.draw.votes).length;
    io.to(code).emit('draw:vote_received', { voteCount, totalVoters: playingPlayers.length, votedPlayerIds: room.draw._voteCollector?.getVoterIds() ?? Object.keys(room.draw.votes) });
    log.debug('draw vote', { count: voteCount, of: playingPlayers.length, code });

    if (!room.draw._voteCollector && voteCount >= playingPlayers.length) {
      resolveDrawVoting(io, room, code);
    }
  });

  socket.on('draw:show_results', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'drawing' || !room.draw || room.draw.phase !== 'voting') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    resolveDrawVoting(io, room, code);
  });

  socket.on('draw:next_round', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'drawing' || !room.draw || room.draw.phase !== 'results') return;
    const player = findPlayer(room, socket.id);
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
    room.draw._voteCollector?.reset();
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
        if (getPlayerSocket(p)) io.to(getPlayerSocket(p)).emit('draw:secret_word', { word: room.draw.playerWords[p.id] });
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    room._timers?.draw?.cancel();
    room.phase = 'lobby';
    room.draw = { phase: 'waiting', round: 0, totalRounds: room.draw?.totalRounds || 3, word: null, submissions: {}, votes: {}, scores: {}, secondsLeft: 90 };
    room.players.forEach(p => { p.isReady = false; });
    io.to(code).emit('draw:restarted', { code, players: room.players });
  });

  // ─── Fill-in-the-Blank handlers ───────────────────────────────────────────

  const fitbQuestions = require('./questions/fillInTheBlank');

  const pickFitbQuestion = (room, players) => {
    // Use room-level prompt history (persists across game restarts) combined with
    // per-session used questions for fine-grained deduplication within a session
    if (!room.promptHistory) room.promptHistory = { mlt: [], fitb: [], caption: [], pmatch: [], photoassoc: [] };
    const sessionUsed = room.fitb.usedQuestions || [];
    const allUsed = [...new Set([...room.promptHistory.fitb, ...sessionUsed])];
    const maxExclude = Math.floor(fitbQuestions.length * 0.7);
    const recentUsed = allUsed.slice(-maxExclude);
    const unused = fitbQuestions.filter(q => !recentUsed.includes(q));
    const pool = unused.length > 0 ? unused : fitbQuestions;
    const q = pool[Math.floor(Math.random() * pool.length)];
    if (!room.fitb.usedQuestions) room.fitb.usedQuestions = [];
    room.fitb.usedQuestions.push(q);
    room.promptHistory.fitb.push(q);
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
  const startFitbAnswerTimer = (io, room, code, seconds) => {
    room._timers = room._timers || {};
    if (room._timers.fitbAnswer) room._timers.fitbAnswer.cancel();
    room.fitb.answerSecondsLeft = seconds;
    room.fitb.paused = false;
    room._timers.fitbAnswer = TimerManager.create({
      io,
      code,
      seconds,
      tickEvent: 'fitb:answer_timer',
      isActive: () => room.fitb?.phase === 'answering',
      onTick: (s) => { room.fitb.answerSecondsLeft = s; },
      onPause: () => { room.fitb.paused = true; },
      onResume: () => { room.fitb.paused = false; },
      onExpire: () => {
        // Auto-submit: use player's typed draft if available, otherwise default
        const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
        playingPlayers.forEach(p => {
          if (!room.fitb.answers.find(a => a.playerId === p.id)) {
            const draftText = (room.fitb.drafts || {})[p.id] || '';
            room.fitb.answers.push({
              playerId: p.id, playerName: p.name, playerColor: p.color,
              text: draftText || '...',
              votes: 0,
            });
          }
        });
        startFitbVoting(io, room, code);
      },
    });
  };

  socket.on('fitb:start', ({ code, rounds }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = findPlayer(room, socket.id);
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
      answerSecondsLeft: timeLimit,
      paused: false,
    };
    room.fitb._submissionTracker = SubmissionTracker.create({
      getExpectedCount: () => room.players.filter(p => p.isConnected && p.isPlaying).length,
      onComplete: () => startFitbVoting(io, room, code),
    });
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    room.fitb.drafts = room.fitb.drafts || {};
    room.fitb.drafts[player.id] = String(text || '').slice(0, 120);
    touchRoom(code); // keep room alive while players are actively typing
  });

  socket.on('fitb:answer', ({ code, text }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'fitb' || room.fitb.phase !== 'answering') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;

    const sanitizedText = String(text || '').slice(0, 120).trim();
    if (!sanitizedText) return;

    const existingFitb = room.fitb.answers.find(a => a.playerId === player.id);
    if (existingFitb) {
      existingFitb.text = sanitizedText;
      room.fitb._submissionTracker?.update(player.id, (prev) => ({ ...prev, text: sanitizedText }));
    } else {
      const entry = { playerId: player.id, playerName: player.name, playerColor: player.color, text: sanitizedText, votes: 0 };
      // Push BEFORE record so onComplete sees all answers (record may fire synchronously)
      room.fitb.answers.push(entry);
      room.fitb._submissionTracker?.record(player.id, entry);
    }

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const answeredCount = room.fitb._submissionTracker?.count() ?? room.fitb.answers.length;
    const answeredPlayerIds = room.fitb._submissionTracker?.getPlayerIds() ?? room.fitb.answers.map(a => a.playerId);
    io.to(code).emit('fitb:answer_received', { answeredCount, totalPlayers: playingPlayers.length, answeredPlayerIds });

    // onComplete handles threshold when tracker exists; fallback for edge cases
    if (!room.fitb._submissionTracker && answeredCount >= playingPlayers.length) {
      startFitbVoting(io, room, code);
    }
  });

  const startFitbVoting = (io, room, code) => {
    if (room.fitb.phase !== 'answering') return;
    room._timers?.fitbAnswer?.cancel();
    room.fitb.phase = 'voting';
    room.fitb._votes = {};
    room.fitb._voteCollector = VoteCollector.create({
      getExpectedCount: () => room.players.filter(p => p.isConnected && p.isPlaying).length,
      allowSelfVote: false,
      onVote: (voterId, idxStr) => {
        if (!room.fitb._votes) room.fitb._votes = {};
        const i = Number(idxStr);
        room.fitb._votes[voterId] = i;
        if (room.fitb.answers[i]) room.fitb.answers[i].votes++;
      },
      onComplete: () => resolveFitbVoting(io, room, code),
    });
    // Shuffle answers so order doesn't reveal authorship
    const shuffled = [...room.fitb.answers].sort(() => Math.random() - 0.5);
    room.fitb.answers = shuffled;
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    // Send anonymous answers (no author info) + tell each player which index is theirs
    const anonAnswers = shuffled.map((a, i) => ({ id: i, text: a.text }));
    playingPlayers.forEach(p => {
      const myAnswerIndex = shuffled.findIndex(a => a.playerId === p.id);
      io.to(getPlayerSocket(p)).emit('fitb:voting_started', {
        answers: anonAnswers,
        question: room.fitb.question,
        totalVoters: playingPlayers.length,
        myAnswerIndex,
      });
    });
    // Broadcast to everyone else in the room (host socket, spectator/browser screen, non-playing players)
    // This ensures the host TV screen receives the event even when it has a separate socket from hostPlayer.
    const playingSocketIds = playingPlayers.map(p => p.socketId);
    io.to(code).except(playingSocketIds).emit('fitb:voting_started', {
      answers: anonAnswers,
      question: room.fitb.question,
      totalVoters: playingPlayers.length,
      myAnswerIndex: -1,
    });
  };

  socket.on('fitb:skip_to_vote', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'fitb' || room.fitb.phase !== 'answering') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    startFitbVoting(io, room, code);
  });

  socket.on('fitb:pause', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'fitb' || room.fitb.phase !== 'answering') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    room._timers?.fitbAnswer?.pause();
  });

  socket.on('fitb:resume', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'fitb' || room.fitb.phase !== 'answering') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    room._timers?.fitbAnswer?.resume();
  });

  socket.on('fitb:change_question', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'fitb' || room.fitb.phase !== 'answering') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    room._timers?.fitbAnswer?.cancel();
    const timeLimit = room.roomConfig?.roundDurationSecs || 30;
    room.fitb.answers = [];
    room.fitb._submissionTracker?.reset();
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    const idx = parseInt(answerId);
    if (isNaN(idx) || idx < 0 || idx >= room.fitb.answers.length) return;
    // Prevent voting for own answer
    if (room.fitb.answers[idx].playerId === player.id) return;

    // Use VoteCollector for dedup + threshold (onVote handles legacy sync)
    const accepted = room.fitb._voteCollector
      ? room.fitb._voteCollector.castVote(player.id, String(idx))
      : !room.fitb._votes?.[player.id];
    if (!accepted) return;

    if (!room.fitb._voteCollector) {
      if (!room.fitb._votes) room.fitb._votes = {};
      room.fitb._votes[player.id] = idx;
      room.fitb.answers[idx].votes++;
    }

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const voteCount = room.fitb._voteCollector?.count() ?? Object.keys(room.fitb._votes).length;
    io.to(code).emit('fitb:vote_received', { voteCount, totalVoters: playingPlayers.length, votedPlayerIds: room.fitb._voteCollector?.getVoterIds() ?? Object.keys(room.fitb._votes) });

    if (!room.fitb._voteCollector && voteCount >= playingPlayers.length) {
      resolveFitbVoting(io, room, code);
    }
  });

  const resolveFitbVoting = (io, room, code) => {
    if (room.fitb.phase !== 'voting') return;
    room.fitb.phase = 'results';
    // Award points: +1 per vote received (a.votes synced by VoteCollector.onVote)
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    resolveFitbVoting(io, room, code);
  });

  socket.on('fitb:next_round', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'fitb' || room.fitb.phase !== 'results') return;
    const player = findPlayer(room, socket.id);
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
    room.fitb._submissionTracker?.reset();
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    room.phase = 'lobby';
    room.fitb = { phase: 'waiting', round: 0, totalRounds: 3, question: null, answers: [], usedQuestions: [], scores: {} };
    room.players.forEach(p => { p.isReady = false; });
    io.to(code).emit('fitb:restarted', { code, players: room.players });
  });

  // ─── Selfie Roast handlers ─────────────────────────────────────────────────

    setupDtGame(io, socket, { getPlayerSocket, findPlayer, cancelAllTimers, mergeToGlobalScores, fisherYatesShuffle, selectWithHistory, storageConfigured, getPublicBaseUrl });

  // ─── Change game (keep same room/players, switch game type) ───────────────

  socket.on('change_game', ({ code, newGameType }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = findPlayer(room, socket.id);
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
    room.dt = { phase: 'waiting', paused: false, prompts: [], chains: {}, activeTurns: {}, pendingTurns: {}, guesses: {}, votes: {}, revealQueue: [], revealCurrentIndex: 0, revealStep: 0, chainsCompletedDrawing: 0, totalChains: 0, scores: {}, promptStartedAt: null, guessStartedAt: null, voteStartedAt: null };

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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    room.globalScores = {};
    io.to(code).emit('global_scores_updated', { globalScores: {}, leaderboard: [] });
  });

  socket.on('remove_from_global_scores', ({ code, playerId }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = findPlayer(room, socket.id);
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
  log.info('server running', { port: PORT });
});

// ─── Room eviction: drop rooms idle for >60 minutes every 10 minutes ─────────
const ROOM_IDLE_TTL_MS = 60 * 60 * 1000;   // 60 min
const EVICTION_INTERVAL_MS = 10 * 60 * 1000; // 10 min
setInterval(() => {
  const evicted = evictStaleRooms(ROOM_IDLE_TTL_MS);
  if (evicted.length > 0) {
    evicted.forEach(code => eventLog.clearLog(code)); // free the room's timeline too
    log.info('eviction: dropped idle rooms', { count: evicted.length, codes: evicted });
  }
}, EVICTION_INTERVAL_MS).unref(); // .unref() so this timer doesn't keep the process alive during tests
