const { selfiePrompts } = require('../questions/selfie');
const { words: drawWordBank, prompts: drawPrompts } = require('../questions/drawing');
const { isConfigured: storageConfigured, getPublicBaseUrl } = require('../storage/photoStorage');
const TimerManager = require('./TimerManager');
const VoteCollector = require('./VoteCollector');
const { buildMiniGameSnapshot } = require('./miniGameSnapshot');
const { shuffleAnswers } = require('./gameLogic');
const { sanitizeStrokes } = require('./limits');
const {
  createRoom,
  joinRoom,
  getRoom,
  getRoomBySocketId,
  removePlayerBySocketId,
  setGameOptions,
  touchRoom,
  evictStaleRooms,
} = require('./roomManager');

const DT_DRAW_SECS = 45;   // seconds per drawing turn
const DT_PROMPT_SECS = 60;  // seconds to write a prompt before auto-generation
const DT_GUESS_SECS = 60;   // seconds to guess before auto-submit
const DT_VOTE_SECS = 30;    // seconds to vote before auto-advance

// We need to pass in dependencies from index.js
function setupDtGame(io, socket, {
  getPlayerSocket,
  findPlayer,
  cancelAllTimers,
  mergeToGlobalScores,
  fisherYatesShuffle,
  selectWithHistory,
  storageConfigured,
  getPublicBaseUrl,
}) {
  socket.on('selfie:start', ({ code, rounds }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = findPlayer(room, socket.id);
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
        io.to(getPlayerSocket(p)).emit('player:photo_reused', { gameType: 'selfie' });
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
      const player = findPlayer(room, socket.id);
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
    const player = findPlayer(room, socket.id);
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
          io.to(getPlayerSocket(drawer)).emit('selfie:draw_assigned', {
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
        io.to(getPlayerSocket(player)).emit('selfie:draw_assigned', {
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
        io.to(getPlayerSocket(p)).emit('selfie:draw_assigned', {
          photoData: room.selfie.photos[ownerPlayerId],
          ownerName: owner?.name || '?',
          ownerColor: owner?.color || '#fff',
          ownerPlayerId,
          prompt: personalizedPrompt,
          promptTemplate: room.selfie.promptTemplate,
        });
      }
    });

    // Broadcast drawing phase start + start timer
    const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
    const SELFIE_DRAW_SECS = 90;
    room.selfie.secondsLeft = SELFIE_DRAW_SECS;
    room.selfie.paused = false;
    io.to(code).emit('selfie:drawing_phase', { players, totalDrawers: drawerIds.length, promptTemplate: room.selfie.promptTemplate, secondsLeft: SELFIE_DRAW_SECS });

    room._timers = room._timers || {};
    if (room._timers.selfie) room._timers.selfie.cancel();
    room._timers.selfie = TimerManager.create({
      io, code,
      seconds: SELFIE_DRAW_SECS,
      tickEvent: 'selfie:timer',
      isActive: () => room.phase === 'selfie' && room.selfie.phase === 'drawing',
      onTick: (s) => { room.selfie.secondsLeft = s; },
      onPause: () => { room.selfie.paused = true; },
      onResume: () => { room.selfie.paused = false; },
      onExpire: () => {
        if (room.selfie.phase !== 'drawing') return;
        io.to(code).emit('selfie:drawing_ending');
        const gracePeriod = setTimeout(() => {
          if (room.selfie.phase !== 'drawing') return;
          startSelfieVoting(io, room, code);
        }, 1500);
        room._timers.selfieGrace = { cancel: () => clearTimeout(gracePeriod) };
      },
    });
  };

  socket.on('selfie:skip_to_drawing', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie' || room.selfie.phase !== 'photo') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    // Only assign if there's at least one photo
    if (Object.keys(room.selfie.photos).length < 1) return;
    assignSelfieDrawers(io, room, code);
  });

  socket.on('selfie:submit_drawing', ({ code, strokes }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie' || room.selfie.phase !== 'drawing') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    const isUpdate = !!room.selfie.strokes[player.id];

    // Sanitize strokes (shared limiter: cap count/points, validate colour/width)
    if (!Array.isArray(strokes)) return;
    const sanitized = sanitizeStrokes(strokes);

    room.selfie.strokes[player.id] = sanitized;

    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying && room.selfie.assignments[p.id]);
    const drawingCount = Object.keys(room.selfie.strokes).length;
    // Only broadcast count change for first submissions (updates don't change the count)
    if (!isUpdate) {
      io.to(code).emit('selfie:drawing_received', { drawingCount, totalDrawers: playingPlayers.length, drawnPlayerIds: Object.keys(room.selfie.strokes) });
    }

    if (!isUpdate && drawingCount >= playingPlayers.length) {
      startSelfieVoting(io, room, code);
    }
  });

  const startSelfieVoting = (io, room, code) => {
    if (room.selfie.phase !== 'drawing') return;
    room.selfie.phase = 'voting';
    room.selfie.votes = {};
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    room.selfie._voteCollector = VoteCollector.create({
      getExpectedCount: () => room.players.filter(p => p.isConnected && p.isPlaying).length,
      allowSelfVote: false,
      onVote: (voterId, targetId) => { room.selfie.votes[voterId] = targetId; },
      onComplete: () => resolveSelfieVoting(io, room, code),
    });

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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    room._timers?.selfie?.cancel();
    room._timers?.selfieGrace?.cancel();
    // Signal all clients to auto-submit their current drawings
    io.to(code).emit('selfie:drawing_ending');
    // Give clients 1.5 s to submit, then advance regardless
    const gracePeriod = setTimeout(() => {
      if (room.selfie.phase !== 'drawing') return; // already advanced
      startSelfieVoting(io, room, code);
    }, 1500);
    room._timers = room._timers || {};
    room._timers.selfieGrace = { cancel: () => clearTimeout(gracePeriod) };
  });

  socket.on('selfie:pause', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie' || room.selfie.phase !== 'drawing') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    room._timers?.selfie?.pause();
    io.to(code).emit('selfie:paused', { secondsLeft: room.selfie.secondsLeft });
  });

  socket.on('selfie:resume', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie' || room.selfie.phase !== 'drawing') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    room._timers?.selfie?.resume();
    io.to(code).emit('selfie:resumed', { secondsLeft: room.selfie.secondsLeft });
  });

  socket.on('selfie:vote', ({ code, drawerId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie' || room.selfie.phase !== 'voting') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    if (!room.selfie.strokes[drawerId]) return; // invalid target

    const accepted = room.selfie._voteCollector
      ? room.selfie._voteCollector.castVote(player.id, drawerId)
      : room.selfie.votes[player.id] === undefined && drawerId !== player.id;
    if (!accepted) return;

    if (!room.selfie._voteCollector) {
      room.selfie.votes[player.id] = drawerId;
    }
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const voteCount = room.selfie._voteCollector?.count() ?? Object.keys(room.selfie.votes).length;
    io.to(code).emit('selfie:vote_received', { voteCount, totalVoters: playingPlayers.length, votedPlayerIds: room.selfie._voteCollector?.getVoterIds() ?? Object.keys(room.selfie.votes) });

    if (!room.selfie._voteCollector) {
      const allVoted = playingPlayers.every(p => room.selfie.votes[p.id] !== undefined);
      if (voteCount >= playingPlayers.length || allVoted) {
        resolveSelfieVoting(io, room, code);
      }
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    resolveSelfieVoting(io, room, code);
  });

  socket.on('selfie:next_round', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'selfie' || room.selfie.phase !== 'results') return;
    const player = findPlayer(room, socket.id);
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
    const player = findPlayer(room, socket.id);
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
          io.to(getPlayerSocket(p)).emit('selfie:prompt_updated', {
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;
    if (room.selfie.strokes[player.id]) return; // already submitted drawing — too late
    // Clear photo so submit_photo guard will accept the new one
    delete room.selfie.photos[player.id];
    io.to(getPlayerSocket(player)).emit('selfie:retake_ready', {});
  });

  socket.on('selfie:restart', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = findPlayer(room, socket.id);
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    cancelAllTimers(room);
    const { captionPrompts } = require('../questions/captionPrompts');

    // Use room-level history to avoid recently seen caption prompts
    if (!room.promptHistory) room.promptHistory = { mlt: [], fitb: [], caption: [], pmatch: [], photoassoc: [] };
    const captionHistory = room.promptHistory.caption;
    const maxExclude = Math.floor(captionPrompts.length * 0.7);
    const recentHistory = captionHistory.slice(-maxExclude);
    const unusedCaptionPrompts = captionPrompts.filter(p => !recentHistory.includes(p.id));
    const captionPool = unusedCaptionPrompts.length >= Math.min(rounds, captionPrompts.length)
      ? unusedCaptionPrompts
      : captionPrompts;
    const shuffled = fisherYatesShuffle(captionPool);

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
        io.to(getPlayerSocket(p)).emit('player:photo_reused', { gameType: 'caption' });
      }
    });
  });

  socket.on('caption:submit_photo', ({ code, photoData }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'caption' || room.caption.phase !== 'photo') return;
    const player = findPlayer(room, socket.id);
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
    // Track prompt id in room-level history to avoid repetition across sessions
    if (promptObj.id && room.promptHistory) {
      room.promptHistory.caption.push(promptObj.id);
    }
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
    const player = findPlayer(room, socket.id);
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
    room.caption.votes = {};
    room.caption._voteCollector = VoteCollector.create({
      getExpectedCount: () => room.players.filter(p => p.isConnected && p.isPlaying).length,
      allowSelfVote: true, // self-vote validated manually in handler before castVote
      onVote: (voterId, captionId) => { room.caption.votes[voterId] = captionId; },
      onComplete: () => endCaptionRound(io, room, code),
    });
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
        io.to(getPlayerSocket(p)).emit('caption:your_caption_id', { captionId: myCap.id });
      }
    });
  }

  socket.on('caption:vote', ({ code, captionId }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'caption' || room.caption.phase !== 'voting') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;

    // Validate captionId exists
    const captionExists = Object.values(room.caption.captions).some(c => c.id === captionId);
    if (!captionExists) return;
    // Can't vote for your own caption
    const ownCaption = room.caption.captions[player.id];
    if (ownCaption && ownCaption.id === captionId) return;

    const accepted = room.caption._voteCollector
      ? room.caption._voteCollector.castVote(player.id, captionId)
      : !room.caption.votes[player.id];
    if (!accepted) return;

    if (!room.caption._voteCollector) {
      room.caption.votes[player.id] = captionId;
    }
    const voters = room.players.filter(p => p.isConnected && p.isPlaying);
    const voteCount = room.caption._voteCollector?.count() ?? Object.keys(room.caption.votes).length;
    io.to(code).emit('caption:vote_received', { voteCount, totalVoters: voters.length, votedPlayerIds: room.caption._voteCollector?.getVoterIds() ?? Object.keys(room.caption.votes) });

    if (!room.caption._voteCollector) {
      const allVoted = voters.every(p => room.caption.votes[p.id]);
      if (voteCount >= voters.length || allVoted) {
        endCaptionRound(io, room, code);
      }
    }
  });

  socket.on('caption:skip_to_voting', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'caption' || room.caption.phase !== 'writing') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    startCaptionVotingPhase(io, room, code);
  });

  socket.on('caption:change_question', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'caption' || room.caption.phase !== 'writing') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    // Reset captions and votes for current round, then start writing phase again with next prompt
    room.caption.captions = {};
    room.caption.votes = {};
    startCaptionWritingPhase(io, room, code);
  });

  socket.on('caption:skip_to_results', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'caption') return;
    const player = findPlayer(room, socket.id);
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
    const player = findPlayer(room, socket.id);
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
    const player = findPlayer(room, socket.id);
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

  // LobbyPage.jsx emits 'pmatch:start' when starting Selfie Challenge from the lobby;
  // treat it as an alias for photovote:start with subType='pmatch'.
  socket.on('pmatch:start', ({ code } = {}) => {
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    cancelAllTimers(room);
    const pvPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const { pmatchPrompts } = require('../questions/pmatchPrompts');
    const prompts = [...pmatchPrompts].sort(() => Math.random() - 0.5);
    room.phase = 'photovote';
    room.photoVote = { subType: 'pmatch', phase: 'photo', photos: {}, currentRound: 1, totalRounds: 5, prompts, currentPromptIndex: 0, votes: {}, scores: {} };
    const photoPhasePrompt = resolvePhotoVotePrompt(prompts[0], pvPlayers);
    room.photoVote.pendingPrompt = photoPhasePrompt;
    io.to(code).emit('photovote:photo_phase', {
      subType: 'pmatch', round: 1, totalRounds: 5,
      players: pvPlayers.map(p => ({ id: p.id, name: p.name, color: p.color })),
      prompt: photoPhasePrompt,
    });
  });

  socket.on('photovote:start', ({ code, subType = 'pmatch', rounds = 5 }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    if (!['pmatch', 'photoassoc'].includes(subType)) return;

    cancelAllTimers(room);
    const pvPlayers = room.players.filter(p => p.isConnected && p.isPlaying);

    // Use room-level history to avoid recently seen prompts; fix biased sort
    if (!room.promptHistory) room.promptHistory = { mlt: [], fitb: [], caption: [], pmatch: [], photoassoc: [] };
    const historyKey = subType === 'pmatch' ? 'pmatch' : 'photoassoc';
    let prompts;
    if (subType === 'pmatch') {
      const { pmatchPrompts } = require('../questions/pmatchPrompts');
      prompts = selectWithHistory(pmatchPrompts, room.promptHistory[historyKey], Math.min(rounds, pmatchPrompts.length));
    } else {
      const { photoAssocTraits } = require('../questions/photoAssocTraits');
      prompts = selectWithHistory(photoAssocTraits, room.promptHistory[historyKey], Math.min(rounds, photoAssocTraits.length));
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
        io.to(getPlayerSocket(p)).emit('player:photo_reused', { gameType: 'photovote' });
      }
    });
  });

  socket.on('photovote:submit_photo', ({ code, photoData }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'photovote' || room.photoVote.phase !== 'photo') return;
    const player = findPlayer(room, socket.id);
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
    room.photoVote._voteCollector = VoteCollector.create({
      getExpectedCount: () => room.players.filter(p => p.isConnected && p.isPlaying).length,
      allowSelfVote: false,
      onVote: (voterId, targetId) => { room.photoVote.votes[voterId] = targetId; },
      onComplete: () => endPhotoVoteRound(io, room, code),
    });
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;

    const target = room.players.find(p => p.id === targetPlayerId && p.isPlaying);
    if (!target) return;

    const accepted = room.photoVote._voteCollector
      ? room.photoVote._voteCollector.castVote(player.id, targetPlayerId)
      : !room.photoVote.votes[player.id] && targetPlayerId !== player.id;
    if (!accepted) return;

    if (!room.photoVote._voteCollector) {
      room.photoVote.votes[player.id] = targetPlayerId;
    }
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const voteCount = room.photoVote._voteCollector?.count() ?? Object.keys(room.photoVote.votes).length;
    const votedPlayerIds = room.photoVote._voteCollector?.getVoterIds() ?? Object.keys(room.photoVote.votes);
    io.to(code).emit('photovote:vote_received', { voteCount, totalVoters: playingPlayers.length, votedPlayerIds });

    if (!room.photoVote._voteCollector) {
      const allVoted = playingPlayers.every(p => room.photoVote.votes[p.id]);
      if (voteCount >= playingPlayers.length || allVoted) {
        endPhotoVoteRound(io, room, code);
      }
    }
  });

  socket.on('photovote:change_question', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'photovote') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    const isPhotoPhase = room.photoVote.phase === 'photo';
    const isVotingPhase = room.photoVote.phase === 'voting';
    if (!isPhotoPhase && !isVotingPhase) return;

    if (room.photoVote.subType === 'pmatch') {
      // For pmatch: change prompt, reset photos and go back to photo phase
      room.photoVote.phase = 'photo';
      room.photoVote.photos = {};
      room.photoVote.votes = {};
      room.photoVote._voteCollector = null;
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

    // For photoassoc: reset votes and pick the next prompt, stay in voting (photos already in)
    room.photoVote.votes = {};
    room.photoVote._voteCollector = null;
    room.photoVote.currentPromptIndex++;
    const playingPlayersForPrompt = room.players.filter(p => p.isConnected && p.isPlaying);
    const nextIndex = room.photoVote.currentPromptIndex % room.photoVote.prompts.length;
    const rawNextPrompt = room.photoVote.prompts[nextIndex];
    const prompt = resolvePhotoVotePrompt(rawNextPrompt, playingPlayersForPrompt);
    room.photoVote.currentPrompt = prompt;

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
    const player = findPlayer(room, socket.id);
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    if (room.photoVote.currentRound >= room.photoVote.totalRounds) {
      // Persist used prompts to room-level history before ending
      if (room.promptHistory && room.photoVote.prompts) {
        const histKey = room.photoVote.subType === 'pmatch' ? 'pmatch' : 'photoassoc';
        room.photoVote.prompts.forEach(p => {
          const key = typeof p === 'string' ? p : (p.template || JSON.stringify(p));
          room.promptHistory[histKey].push(key);
        });
      }
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
        room.photoVote._voteCollector = null;
        
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
        room.photoVote._voteCollector = null;
        startPhotoVoteRound(io, room, code);
      }
    }
  });

  socket.on('photovote:restart', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = findPlayer(room, socket.id);
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
  // Helper: sanitize strokes (shared limiter — same rules everywhere)
  const sanitizeDtStrokes = sanitizeStrokes;

  // Helper: build the combined strokes array from all completed drawing steps
  const buildCombinedStrokes = (chain) =>
    chain.drawingSteps.flatMap(step => step.strokes);

  // Helper: start the prompt-phase countdown; auto-generates prompts for idle players on expiry
  const startDtPromptTimer = (io, room, code) => {
    room._timers = room._timers || {};
    if (room._timers.dtPrompt) room._timers.dtPrompt.cancel();
    room._timers.dtPrompt = TimerManager.create({
      io,
      code,
      seconds: DT_PROMPT_SECS,
      tickEvent: 'phase_timer',
      extraData: { phase: 'dt-prompting' },
      isActive: () => room.phase === 'dt' && room.dt.phase === 'prompting',
      onExpire: () => {
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
      }
    });
  };

  // Helper: start the guess-phase countdown; auto-submits empty guess on expiry
  const startDtGuessTimer = (io, room, code) => {
    room._timers = room._timers || {};
    if (room._timers.dtGuess) room._timers.dtGuess.cancel();
    room._timers.dtGuess = TimerManager.create({
      io,
      code,
      seconds: DT_GUESS_SECS,
      tickEvent: 'phase_timer',
      extraData: { phase: 'dt-guessing' },
      isActive: () => room.phase === 'dt' && room.dt.phase === 'guessing',
      onExpire: () => {
        for (const promptId of Object.keys(room.dt.chains)) {
          if (!room.dt.guesses[promptId]) room.dt.guesses[promptId] = '';
        }
        startDtRevealPhase(io, room, code);
      }
    });
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
    // Always reset the timer to a full turn for each new participant
    chain.secondsLeft = DT_DRAW_SECS;
    // Clear any stale interval that may still be running
    if (chain.timerRef) { clearInterval(chain.timerRef); chain.timerRef = null; }
    chain.timerRef = setInterval(() => {
      chain.secondsLeft--;
      // (activeTurns maps playerId→promptId, so invert the lookup)
      const activeDrawerEntry = Object.entries(room.dt.activeTurns).find(([, pid]) => pid === promptId);
      if (activeDrawerEntry) {
        const [activeDrawerId] = activeDrawerEntry;
        const drawerPlayer = room.players.find(p => p.id === activeDrawerId);
        if (drawerPlayer?.socketId) {
          io.to(getPlayerSocket(drawerPlayer)).emit('dt:turn_timer', { promptId, secondsLeft: chain.secondsLeft });
        }
        io.to(code).emit('dt:drawer_timer', { playerId: activeDrawerId, secondsLeft: chain.secondsLeft });
      }
      if (chain.secondsLeft <= 0) {
        clearInterval(chain.timerRef);
        chain.timerRef = null;
        // Notify the active drawer to submit their current strokes immediately
        const drawerEntryAtTimeout = Object.entries(room.dt.activeTurns).find(([, pid]) => pid === promptId);
        if (drawerEntryAtTimeout) {
          const drawerAtTimeout = room.players.find(p => p.id === drawerEntryAtTimeout[0]);
          if (drawerAtTimeout?.socketId) {
            io.to(getPlayerSocket(drawerAtTimeout)).emit('dt:time_up', { promptId });
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
      io.to(getPlayerSocket(drawerPlayer)).emit('dt:your_turn', {
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

    // Build per-player guess payloads and cache them on the chain for recovery
    const guessPayloads = {};
    for (const [promptId, chain] of Object.entries(room.dt.chains)) {
      const finalStrokes = buildCombinedStrokes(chain);
      const payload = {
        promptId,
        targetPlayerId: chain.targetPlayerId,
        finalStrokes,
        originalSelfieData: chain.originalSelfieData,
        drawerCount: chain.drawingSteps.length,
        secondsLeft: DT_GUESS_SECS,
      };
      chain._guessPayload = payload; // cache for recovery requests
      guessPayloads[chain.targetPlayerId] = payload;
    }

    // Broadcast guessing phase to room (includes ALL payloads so each client can pick theirs)
    // This acts as a fallback: even if the direct socket send fails, the room broadcast carries the data.
    console.log(`[DT] Emitting dt:guessing_phase to room ${code}. Total guessers: ${totalGuessers}. Payloads:`, Object.keys(guessPayloads));
    io.to(code).emit('dt:guessing_phase', {
      totalGuessers,
      secondsLeft: DT_GUESS_SECS,
      guessPayloads, // map: targetPlayerId -> payload
    });

    // Also send direct targeted messages for reliability
    for (const [promptId, chain] of Object.entries(room.dt.chains)) {
      const targetPlayer = room.players.find(p => p.id === chain.targetPlayerId);
      if (targetPlayer) {
        const sock = getPlayerSocket(targetPlayer);
        if (sock) {
          io.to(sock).emit('dt:your_guess', chain._guessPayload);
        }
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
    const player = findPlayer(room, socket.id);
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
      paused: false,
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

    room.dt.phase = 'selfie';
    room.dt.selfiePhotos = {}; // Players must explicitly submit or reuse
    io.to(code).emit('dt:selfie_phase', { players, photoCount: 0, totalPhotographers: playingPlayers.length });

    // Notify players whose photos are already saved so they can choose to reuse them
    playingPlayers.forEach(p => {
      if (allPhotos[p.id] && p.socketId) {
        io.to(getPlayerSocket(p)).emit('player:photo_reused', { gameType: 'dt', waitingForConsent: true });
      }
    });
  });

  socket.on('dt:reuse_photo', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt' || room.dt.phase !== 'selfie') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isPlaying) return;

    if (!room.playerPhotos || !room.playerPhotos[player.id]) return; // No photo to reuse
    if (room.dt.selfiePhotos[player.id]) return; // Already submitted/reused

    room.dt.selfiePhotos[player.id] = true;
    const playingPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
    const photoCount = Object.keys(room.dt.selfiePhotos).length;
    const submittedPlayerIds = Object.keys(room.dt.selfiePhotos);

    io.to(code).emit('dt:photo_received', { photoCount, totalPhotographers: playingPlayers.length, submittedPlayerIds });

    if (photoCount >= playingPlayers.length) {
      room.dt.phase = 'prompting';
      const players = playingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }));
      io.to(code).emit('dt:prompt_phase', { players, totalPrompts: players.length, secondsLeft: DT_PROMPT_SECS });
      startDtPromptTimer(io, room, code);
    }
  });

  socket.on('dt:submit_prompt', ({ code, templateText }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt' || room.dt.phase !== 'prompting') return;
    const player = findPlayer(room, socket.id);
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
    console.log(`[DT] Creating chains for room ${code}. playingPlayers=${playingPlayers.length}, prompts=${room.dt.prompts.length}, shuffled=${shuffled.length}`);
    for (let i = 0; i < room.dt.prompts.length; i++) {
      const prompt = room.dt.prompts[i];
      const targetPlayerId = shuffled[i % shuffled.length];
      if (!targetPlayerId) {
        console.error(`[DT ERROR] targetPlayerId is undefined! i=${i}, shuffled=${JSON.stringify(shuffled)}`);
      }
      const targetPlayer = playingPlayers.find(p => p.id === targetPlayerId);
      const finalText = prompt.templateText.replace(/\[name\]/gi, targetPlayer?.name || '?');
      console.log(`[DT] Created chain ${prompt.id} with targetPlayerId=${targetPlayerId}`);
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isPlaying || !player.isConnected) return;

    const chain = room.dt.chains[promptId];
    if (!chain || (chain.phase !== 'drawing' && chain.phase !== 'done')) return;

    // Check if this is an update of an already submitted step
    const existingStepIndex = chain.drawingSteps.findIndex(s => s.playerId === player.id);
    if (existingStepIndex !== -1) {
      const sanitized = sanitizeDtStrokes(strokes);
      chain.drawingSteps[existingStepIndex].strokes = sanitized;
      
      // Notify the current drawer of this chain so they get the updated background
      const currentDrawerId = chain.participants[chain.currentParticipantIndex];
      if (currentDrawerId) {
        const currentDrawer = room.players.find(p => p.id === currentDrawerId);
        if (currentDrawer?.socketId) {
          // Re-calculate the background strokes (all steps up to currentParticipantIndex)
          const existingStrokes = chain.drawingSteps
            .slice(0, chain.currentParticipantIndex)
            .flatMap(step => step.strokes || []);
          
          io.to(getPlayerSocket(currentDrawer)).emit('dt:background_strokes_updated', {
            promptId,
            existingStrokes,
          });
        }
      }
      return;
    }

    // Verify this is the player's active turn for this chain
    if (room.dt.activeTurns[player.id] !== promptId) return;
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

  // Recovery handler: a player stuck on the wait page during guessing can request their guess data
  socket.on('dt:request_guess', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt' || room.dt.phase !== 'guessing') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isPlaying) return;
    // Find which chain this player is the target of
    for (const [promptId, chain] of Object.entries(room.dt.chains)) {
      if (chain.targetPlayerId === player.id && chain._guessPayload) {
        io.to(socket.id).emit('dt:your_guess', chain._guessPayload);
        break;
      }
    }
  });

  socket.on('dt:submit_guess', ({ code, promptId, guessText }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt' || room.dt.phase !== 'guessing') return;
    const player = findPlayer(room, socket.id);
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    const promptId = room.dt.revealQueue[room.dt.revealCurrentIndex];
    const chain = room.dt.chains[promptId];
    if (!chain) return;

    // Step layout: 0=context+prompt(merged), 1=all drawings grid, 2=guess+vote (auto-advances)
    const maxStep = 2; // 3 steps (0,1,2) regardless of N drawing steps

    if (room.dt.revealStep >= maxStep) {
      // Advance to next chain, cancelling the vote timer if it's active
      if (room._timers && room._timers.dtVote) {
        room._timers.dtVote.cancel();
      }
      advanceDtReveal(io, room, code);
      return;
    }

    room.dt.revealStep++;

    // On entering the last step (guess+vote), start the auto-advance vote timer
    if (room.dt.revealStep === maxStep) {
      room._timers = room._timers || {};
      if (room._timers.dtVote) room._timers.dtVote.cancel();
      room._timers.dtVote = TimerManager.create({
        io,
        code,
        seconds: DT_VOTE_SECS,
        tickEvent: 'phase_timer',
        extraData: { phase: 'dt-vote' },
        isActive: () => room.phase === 'dt' && room.dt.phase === 'reveal' && room.dt.revealStep === maxStep,
        onExpire: () => advanceDtReveal(io, room, code)
      });
    }

    const payload = buildDtRevealPayload(room);
    if (payload) io.to(code).emit('dt:reveal_update', payload);
  });

  socket.on('dt:vote', ({ code, promptId, vote }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt' || room.dt.phase !== 'reveal') return;
    const player = findPlayer(room, socket.id);
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
      room._timers = room._timers || {};
      if (room._timers.dtVote) room._timers.dtVote.cancel();
      room._timers.dtVote = TimerManager.create({
        io,
        code,
        seconds: 2,
        tickEvent: 'phase_timer',
        extraData: { phase: 'dt-vote' },
        isActive: () => room.phase === 'dt' && room.dt.phase === 'reveal',
        onExpire: () => advanceDtReveal(io, room, code)
      });
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
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    if (room.dt.phase === 'guessing') startDtRevealPhase(io, room, code);
  });

  socket.on('dt:end_game', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    endDtGame(io, room, code);
  });

  socket.on('dt:pause', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    room.dt.paused = true;
    if (room.dt.phase === 'prompting' && room._timers?.dtPrompt) {
      room._timers.dtPrompt.pause();
    } else if (room.dt.phase === 'drawing') {
      for (const chain of Object.values(room.dt.chains)) {
        if (chain.timerRef) {
          clearInterval(chain.timerRef);
          chain.timerRef = null;
        }
      }
    } else if (room.dt.phase === 'guessing' && room._timers?.dtGuess) {
      room._timers.dtGuess.pause();
    } else if (room.dt.phase === 'reveal' && room._timers?.dtVote) {
      room._timers.dtVote.pause();
    }

    io.to(code).emit('dt:paused');
  });

  socket.on('dt:resume', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'dt') return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;

    room.dt.paused = false;
    if (room.dt.phase === 'prompting' && room._timers?.dtPrompt) {
      room._timers.dtPrompt.resume();
    } else if (room.dt.phase === 'drawing') {
      for (const promptId of Object.values(room.dt.activeTurns)) {
        startDtChainTimer(io, room, code, promptId);
      }
    } else if (room.dt.phase === 'guessing' && room._timers?.dtGuess) {
      room._timers.dtGuess.resume();
    } else if (room.dt.phase === 'reveal' && room._timers?.dtVote) {
      room._timers.dtVote.resume();
    }

    io.to(code).emit('dt:resumed');
  });

  socket.on('dt:restart', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.isHost) return;
    cancelAllTimers(room);
    room.phase = 'lobby';
    room.dt = { phase: 'waiting', paused: false, prompts: [], chains: {}, activeTurns: {}, pendingTurns: {}, guesses: {}, votes: {}, revealQueue: [], revealCurrentIndex: 0, revealStep: 0, chainsCompletedDrawing: 0, totalChains: 0, scores: {}, promptTimerRef: null, promptStartedAt: null, guessTimerRef: null, guessStartedAt: null, voteTimerRef: null, voteStartedAt: null };
    room.players.forEach(p => { p.isReady = false; });
    io.to(code).emit('dt:restarted', { code, players: room.players });
  });
}

module.exports = { 
  setupDtGame,
  DT_DRAW_SECS,
  DT_PROMPT_SECS,
  DT_GUESS_SECS,
  DT_VOTE_SECS 
};
