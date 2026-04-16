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

const createRoom = (socketId, playerName = 'Host') => {
  const code = generateRoomCode();
  const player = {
    id: uuidv4(),
    socketId: socketId,
    name: playerName,
    color: generatePlayerColor([]),
    isHost: true,
    isConnected: true
  };
  
  const room = {
    code,
    host: player.id,
    phase: 'lobby',
    gameType: 'who-said-that',
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
    mlt: {
      roundState: 'waiting',
      currentPrompt: null,
      prompts: [],
      votes: {},
      scores: {},
      totalVotes: {},
      wins: {},
      round: 0,
      totalRounds: 5,
      allowSelfVote: false,
      timerRef: null
    }
  };
  
  rooms.set(code, room);
  return { room, player };
};

const joinRoom = (code, socketId, playerName, playerId) => {
  if (!rooms.has(code)) throw new Error('Room not found');
  const room = rooms.get(code);
  
  if (room.phase !== 'lobby') throw new Error('Cannot join while game is in progress');
  
  // Rejoin
  if (playerId) {
    const existingPlayer = room.players.find(p => p.id === playerId);
    if (existingPlayer) {
      existingPlayer.socketId = socketId;
      existingPlayer.isConnected = true;
      existingPlayer.name = playerName || existingPlayer.name;
      return { room, player: existingPlayer, isRejoin: true };
    }
  }
  
  // New player
  const existingColors = room.players.map(p => p.color);
  const player = {
    id: uuidv4(),
    socketId: socketId,
    name: playerName || `Player ${room.players.length + 1}`,
    color: generatePlayerColor(existingColors),
    isHost: room.players.length === 0,
    isConnected: true
  };
  
  if (room.players.length === 0) {
    room.host = player.id;
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
  if (gameType !== undefined) room.gameType = gameType;
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
};
