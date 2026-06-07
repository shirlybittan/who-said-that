const { randomUUID: uuidv4 } = require('crypto');

const rooms = new Map();

const generateRoomCode = () => {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 6).toUpperCase();
  } while (rooms.has(code));
  return code;
};

const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8B94', '#6C5CE7', '#FFA07A', '#00CEC9'];

const generatePlayerColor = (existingColors) => {
  const availableColors = colors.filter(c => !existingColors.includes(c));
  return availableColors.length > 0 ? availableColors[0] : colors[Math.floor(Math.random() * colors.length)];
};

const createRoom = (socketId, playerName = 'Host', gameType = 'most-likely-to', gameName = '', hostIsPlaying = false, roomConfig = {}) => {
  const code = generateRoomCode();
  const player = {
    id: uuidv4(),
    socketId: socketId,
    name: playerName,
    color: generatePlayerColor([]),
    isHost: true,
    isPlaying: hostIsPlaying,
    isConnected: true
  };

  const validGameTypes = ['who-said-that', 'most-likely-to', 'situational', 'this-or-that', 'mixed', 'drawing', 'fill-in-the-blank', 'selfie-roast', 'caption', 'pmatch', 'photoassoc', 'draw-telephone'];
  const standaloneTypes = new Set(['drawing', 'fill-in-the-blank', 'selfie-roast', 'caption', 'pmatch', 'photoassoc', 'draw-telephone']);
  let resolvedGameType = gameType;
  let selectedSubGames = [];

  if (Array.isArray(gameType)) {
    // If they picked multiple specific ones, or if they just picked 'mixed' in an array
    if (gameType.includes('mixed')) {
      resolvedGameType = 'mixed';
      selectedSubGames = validGameTypes.filter(g => g !== 'mixed' && !standaloneTypes.has(g));
    } else {
      resolvedGameType = gameType.length > 1 ? 'mixed' : (validGameTypes.includes(gameType[0]) ? gameType[0] : 'most-likely-to');
      selectedSubGames = gameType.filter(g => validGameTypes.includes(g));
    }
  } else {
    resolvedGameType = validGameTypes.includes(gameType) ? gameType : 'most-likely-to';
    selectedSubGames = (resolvedGameType === 'mixed') ? validGameTypes.filter(g => g !== 'mixed' && !standaloneTypes.has(g)) : [resolvedGameType];
  }
  
  const room = {
    code,
    gameName: gameName.trim().slice(0, 40) || '',
    host: player.id,
    phase: 'lobby',
    gameType: resolvedGameType,
    selectedSubGames,
    mode: 'friends',
    totalRounds: 3,
    currentRound: 0,
    currentQuestionIndex: 0,
    currentAnswerIndex: 0,
    questions: [],
    customQuestions: [],
    currentQuestion: "",
    answers: [],
    scores: {},
    players: [player],
    usedQuestionIds: [],
    timer: null,
    answerTimerRef: null,
    globalScores: {},
    roomConfig: {
      roundDurationSecs: typeof roomConfig.roundDurationSecs === 'number'
        ? Math.min(Math.max(roomConfig.roundDurationSecs, 20), 300) : 60,
      anonymousMode: !!roomConfig.anonymousMode,
    },
    sit: {
      targetPlayerIndex: 0,   // cycles through non-host players
      votes: {},              // { voterPlayerId: authorPlayerId }
    },
    tot: {
      roundState: 'waiting',  // 'voting' | 'results'
      question: null,
      a: '',
      b: '',
      votesA: {},             // { playerId: true }
      votesB: {},             // { playerId: true }
      scores: {},
      round: 0,
      totalRounds: 5,
      timerRef: null,
      secondsLeft: 0,
      paused: false,
    },
    mlt: {
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
      totalRounds: 5,
      allowSelfVote: false,
      paused: false,
      secondsLeft: 30,
      timerRef: null
    },
    draw: {
      phase: 'waiting',
      round: 0,
      totalRounds: 3,
      word: null,
      submissions: {},
      votes: {},
      scores: {},
      timerRef: null,
      secondsLeft: 90,
    },
    fitb: {
      phase: 'waiting',   // 'waiting'|'answering'|'voting'|'results'
      round: 0,
      totalRounds: 3,
      question: null,     // formatted string (name substituted)
      answers: [],        // [{playerId, playerName, playerColor, text, votes}]
      usedQuestions: [],
      scores: {},
    },
    selfie: {
      phase: 'waiting',    // 'waiting'|'photo'|'drawing'|'voting'|'results'
      photos: {},          // {playerId: base64DataUrl}
      assignments: {},     // {drawerPlayerId: ownerPlayerId}  — who draws whose photo
      strokes: {},         // {drawerPlayerId: [{color,width,type,points},...]}
      votes: {},           // {voterPlayerId: drawerPlayerId}
      scores: {},
    },
    // Persistent selfie bank — survives game switches, only cleared when room is destroyed
    playerPhotos: {},      // {playerId: base64DataUrl}  — reused across all selfie-based mini games
    dt: {
      phase: 'waiting',        // 'waiting'|'prompting'|'drawing'|'guessing'|'reveal'|'end'
      prompts: [],             // [{id, authorId, templateText}]
      chains: {},              // {promptId: ChainObj}
      activeTurns: {},         // {playerId: promptId}  — who is currently drawing for which chain
      pendingTurns: {},        // {playerId: promptId[]} — queued future turns
      guesses: {},             // {promptId: guessText}
      votes: {},               // {promptId: {playerId: 'correct'|'close'|'wrong'}}
      revealQueue: [],         // [promptId] ordered
      revealCurrentIndex: 0,
      revealStep: 0,
      chainsCompletedDrawing: 0,
      totalChains: 0,
      scores: {},              // {playerId: pts}
      promptStartedAt: null,
      guessStartedAt: null,
      voteStartedAt: null,
    },
  };
  
  room.lastActivityAt = Date.now();

  rooms.set(code, room);
  return { room, player };
};

// ─── Activity tracking ────────────────────────────────────────────────────────

/**
 * Refresh the last-active timestamp for a room. Call this on any meaningful
 * socket event (answers, votes, photo uploads, etc.) so idle detection stays
 * accurate even for long-running games.
 */
const touchRoom = (code) => {
  const room = rooms.get(code);
  if (room) room.lastActivityAt = Date.now();
};

/**
 * Evict rooms that have been completely idle for longer than maxAgeMs.
 * Cancels all pending timers before dropping the room so Node can GC the
 * closure references held by setInterval / setTimeout callbacks.
 *
 * @param {number} maxAgeMs - idle threshold (default: 60 minutes)
 * @returns {string[]} codes of evicted rooms
 */
const evictStaleRooms = (maxAgeMs = 60 * 60 * 1000) => {
  const now = Date.now();
  const evicted = [];
  for (const [code, room] of rooms.entries()) {
    const age = now - (room.lastActivityAt || 0);
    if (age < maxAgeMs) continue;

    // Cancel all timer references to free event-loop slots
    const timerFields = [
      room.timer,
      room.answerTimerRef,
      room.mlt?.timerRef,
      room.tot?.timerRef,
      room.draw?.timerRef,
      room.dt?.promptTimerRef,
      room.dt?.drawTimerRef,
      room.dt?.guessTimerRef,
      room.dt?.voteTimerRef,
    ];
    timerFields.forEach(ref => { if (ref) { try { clearTimeout(ref); clearInterval(ref); } catch (_) {} } });

    // Drop heavy asset blobs to free memory before GC
    if (room.playerPhotos) room.playerPhotos = {};
    if (room.selfie?.photos) room.selfie.photos = {};
    if (room.selfie?.strokes) room.selfie.strokes = {};
    if (room.draw?.submissions) room.draw.submissions = {};
    if (room.dt?.chains) room.dt.chains = {};

    rooms.delete(code);
    evicted.push(code);
  }
  return evicted;
};

const joinRoom = (code, socketId, playerName, playerId) => {
  if (!rooms.has(code)) throw new Error('Room not found');
  const room = rooms.get(code);
  
  // Rejoin existing player — allowed even mid-game
  if (playerId) {
    const existingPlayer = room.players.find(p => p.id === playerId);
    if (existingPlayer) {
      existingPlayer.socketId = socketId;
      existingPlayer.isConnected = true;
      existingPlayer.name = playerName || existingPlayer.name;
      return { room, player: existingPlayer, isRejoin: true };
    }
  }
  
  // New player — allowed any time; flagged if joining mid-game
  const existingColors = room.players.map(p => p.color);
  const player = {
    id: uuidv4(),
    socketId: socketId,
    name: playerName || `Player ${room.players.length + 1}`,
    color: generatePlayerColor(existingColors),
    isHost: room.players.length === 0,
    isPlaying: true,
    isConnected: true,
    joinedMidRound: room.phase !== 'lobby',
  };
  
  if (room.players.length === 0) {
    room.host = player.id;
  }
  
  // Initialize scores for new mid-game player so they appear on scoreboards
  if (room.phase !== 'lobby') {
    if (room.scores) room.scores[player.id] = 0;
    if (room.mlt?.scores) room.mlt.scores[player.id] = 0;
    if (room.tot?.scores) room.tot.scores[player.id] = 0;
    if (room.fitb?.scores) room.fitb.scores[player.id] = 0;
    if (room.draw?.scores) room.draw.scores[player.id] = 0;
    if (room.dt?.scores) room.dt.scores[player.id] = 0;
  }

  room.players.push(player);
  return { room, player, isRejoin: false };
};

const getRoom = (code) => {
  return rooms.get(code) || null;
};

const getRoomBySocketId = (socketId) => {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.socketId === socketId)) {
      return room;
    }
  }
  return null;
};

const removePlayerBySocketId = (socketId, permanent) => {
  const room = getRoomBySocketId(socketId);
  if (!room) return null;
  
  let player = null;
  let newHost = null;
  
  if (permanent) {
    room.players = room.players.filter(p => !p.isConnected); // Need logic here
  } else {
    player = room.players.find(p => p.socketId === socketId);
    if (player) {
      player.isConnected = false;
      if (player.isHost) {
        player.isHost = false;
        const nextConnected = room.players.find(p => p.isConnected);
        if (nextConnected) {
          nextConnected.isHost = true;
          room.host = nextConnected.id;
          newHost = nextConnected;
        }
      }
    }
  }
  
  if (room.players.filter(p => p.isConnected).length === 0) {
    // maybe clear room later
  }
  
  return { player, newHost };
};

const setGameOptions = (code, socketId, mode, totalRounds, gameType, mltRounds, allowSelfVote) => {
  const room = getRoom(code);
  if (!room) throw new Error('Room not found');
  const player = room.players.find(p => p.socketId === socketId);
  if (!player || !player.isHost) throw new Error('Only host can change options');

  if (mode !== undefined) room.mode = mode;
  if (totalRounds !== undefined) room.totalRounds = totalRounds;
  
  const validGameTypes = ['who-said-that', 'most-likely-to', 'situational', 'this-or-that', 'mixed', 'drawing', 'fill-in-the-blank', 'selfie-roast', 'caption', 'pmatch', 'photoassoc', 'draw-telephone'];
  const standaloneTypes = new Set(['drawing', 'fill-in-the-blank', 'selfie-roast', 'caption', 'pmatch', 'photoassoc', 'draw-telephone']);

  if (gameType !== undefined) {
    if (Array.isArray(gameType)) {
      if (gameType.includes('mixed')) {
        room.gameType = 'mixed';
        room.selectedSubGames = validGameTypes.filter(g => g !== 'mixed' && !standaloneTypes.has(g));
      } else {
        room.gameType = gameType.length > 1 ? 'mixed' : (validGameTypes.includes(gameType[0]) ? gameType[0] : 'most-likely-to');
        room.selectedSubGames = gameType.filter(g => validGameTypes.includes(g));
      }
    } else if (validGameTypes.includes(gameType)) {
      room.gameType = gameType;
      room.selectedSubGames = (gameType === 'mixed') ? validGameTypes.filter(g => g !== 'mixed' && !standaloneTypes.has(g)) : [gameType];
    }
  }
  
  if (mltRounds !== undefined) room.mlt.totalRounds = mltRounds;
  if (allowSelfVote !== undefined) room.mlt.allowSelfVote = allowSelfVote;
  return room;
};

module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  getRoomBySocketId,
  removePlayerBySocketId,
  generateRoomCode,
  generatePlayerColor,
  setGameOptions,
  touchRoom,
  evictStaleRooms,
};
