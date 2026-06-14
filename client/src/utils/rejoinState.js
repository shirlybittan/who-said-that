const noopPayload = {};

const getPlayers = (room) => room.players || [];

const getBaseRoomPayload = (room, playerId, isRejoin) => {
  const myPlayer = getPlayers(room).find((player) => player.id === playerId);
  const isPlaying = myPlayer?.isPlaying ?? true;
  const isHost = room.host === playerId;
  const phase = room.phase;
  const joinedMidRound = !isRejoin && phase && phase !== 'lobby';

  return {
    roomCode: room.code,
    phase: room.phase,
    players: room.players,
    mode: room.mode,
    totalRounds: room.totalRounds,
    currentRound: room.currentRound || 0,
    isHost,
    isPlaying,
    joinedMidRound: !!joinedMidRound,
    gameType: room.gameType || 'who-said-that',
    selectedSubGames: room.selectedSubGames || [],
    gameName: room.gameName || '',
    scores: room.scores || {},
    roomConfig: room.roomConfig || {},
    globalScores: room.globalScores || {},
    mlt: {
      totalRounds: room.mlt?.totalRounds ?? 5,
      allowSelfVote: room.mlt?.allowSelfVote ?? false,
    },
  };
};

export const getRouteForPhase = (phase, snapshot) => {
  if (!phase || phase === 'lobby') return '/lobby';

  switch (phase) {
    case 'question':
      return '/question';
    case 'sit-voting':
    case 'sit-results':
      return '/sit-vote';
    case 'voting':
      return '/vote';
    case 'roundEnd':
      return '/round-end';
    case 'gameEnd':
      return '/game-end';
    case 'mlt':
      if (snapshot?.roundState === 'results') return '/mlt-results';
      return '/mlt-vote';
    case 'mltEnd':
      return '/mlt-end';
    case 'tot':
      return '/tot';
    case 'totEnd':
      return '/tot-end';
    case 'drawing':
      return '/draw';
    case 'drawEnd':
      return '/draw-end';
    case 'fitb':
      return '/fitb';
    case 'fitbEnd':
      return '/fitb-end';
    case 'selfie':
      if (snapshot?.phase === 'voting') return '/selfie-vote';
      if (snapshot?.phase === 'results') return '/selfie-results';
      if (snapshot?.phase === 'drawing') return '/selfie-draw';
      return '/selfie-photo';
    case 'selfieEnd':
      return '/selfie-results';
    case 'caption':
      if (snapshot?.phase === 'photo') return '/caption-photo';
      if (snapshot?.phase === 'writing') return '/caption-write';
      if (snapshot?.phase === 'voting') return '/caption-vote';
      return '/caption-results';
    case 'photovote':
      if (snapshot?.phase === 'photo') return '/photo-vote-photo';
      if (snapshot?.phase === 'voting') return '/photo-vote';
      return '/photo-vote-results';
    case 'dt':
      if (snapshot?.phase === 'selfie') return '/selfie-photo';
      if (snapshot?.phase === 'prompting') return '/draw-tel-prompt';
      if (snapshot?.phase === 'drawing') return snapshot?.currentTurn ? '/draw-tel-draw' : '/draw-tel-wait';
      if (snapshot?.phase === 'guessing') return snapshot?.guessTurn ? '/draw-tel-guess' : '/draw-tel-wait';
      if (snapshot?.phase === 'reveal') return '/draw-tel-reveal';
      if (snapshot?.phase === 'end') return '/draw-tel-end';
      return '/draw-tel-wait';
    case 'dtEnd':
      return '/draw-tel-end';
    default:
      return '/lobby';
  }
};

const buildClassicRestore = (room, playerId) => {
  const phase = room.phase;

  if (phase === 'question') {
    const q = room.questions?.[room.currentQuestionIndex];
    const actions = [{
      type: 'SET_QUESTION',
      payload: {
        question: room.currentQuestion,
        round: room.currentRound,
        totalRounds: room.totalRounds,
        roundType: q?.type || 'wst',
        target: null,
      },
    }];

    const myAnswer = room.answers?.find((answer) => answer.playerId === playerId);
    if (myAnswer) actions.push({ type: 'MARK_ANSWERED', payload: { myAnswer: myAnswer.text } });
    return actions;
  }

  if (phase === 'sit-voting' || phase === 'sit-results') {
    const answers = room.answers?.map((answer) => ({ id: answer.playerId, text: answer.text })) || [];
    const actions = [{
      type: 'SIT_VOTING_STARTED',
      payload: {
        question: room.currentQuestion,
        answers,
        totalVoters: getPlayers(room).filter((player) => player.isConnected && player.isPlaying).length,
      },
    }];

    if (phase === 'sit-results') {
      const voteCounts = {};
      (room.answers || []).forEach((answer) => { voteCounts[answer.playerId] = 0; });
      Object.values(room.sit?.votes || {}).forEach((authorId) => {
        if (voteCounts[authorId] !== undefined) voteCounts[authorId] += 1;
      });
      const maxVotes = Math.max(...Object.values(voteCounts), 0);
      const detailedAnswers = (room.answers || []).map((answer) => ({
        id: answer.playerId,
        text: answer.text,
        authorId: answer.playerId,
        authorName: answer.playerName,
        authorColor: room.players.find((player) => player.id === answer.playerId)?.color || '#888',
        votes: voteCounts[answer.playerId] || 0,
      }));
      const winners = maxVotes > 0 ? detailedAnswers.filter((answer) => answer.votes === maxVotes).map((answer) => answer.id) : [];
      actions.push({
        type: 'SIT_SET_RESULTS',
        payload: {
          answers: detailedAnswers,
          scores: room.scores || {},
          players: getPlayers(room).filter((player) => player.isConnected && player.isPlaying).map((player) => ({ id: player.id, name: player.name, color: player.color })),
          winners,
        },
      });
    } else if (room.sit?.votes?.[playerId]) {
      actions.push({ type: 'SIT_MARK_VOTED', payload: { answerId: room.sit.votes[playerId] } });
    }

    return actions;
  }

  if (phase === 'voting') {
    return [{
      type: 'SET_ANSWERS',
      payload: {
        answers: room.answers?.map((answer) => ({ text: answer.text })) || [],
        currentIndex: room.currentAnswerIndex || 0,
      },
    }];
  }

  if (phase === 'roundEnd') {
    return [{
      type: 'SET_ROUND_ENDED',
      payload: { scores: room.scores, players: room.players, answers: room.answers || [], stats: {} },
    }];
  }

  if (phase === 'gameEnd') {
    return [{
      type: 'SET_GAME_ENDED',
      payload: { players: room.players, stats: {} },
    }];
  }

  if (phase === 'tot') {
    const q = room.questions?.[room.currentQuestionIndex];
    return [{
      type: 'SET_TOT_QUESTION',
      payload: {
        question: q?.text || room.currentQuestion || '',
        a: q?.a || '',
        b: q?.b || '',
        round: room.currentRound,
        totalRounds: room.totalRounds,
      },
    }];
  }

  if (phase === 'totEnd') {
    const activePlayers = getPlayers(room).filter((player) => player.isConnected && player.isPlaying);
    const leaderboard = activePlayers
      .map((player) => ({
        playerId: player.id,
        name: player.name,
        color: player.color,
        score: room.tot?.scores?.[player.id] || 0,
      }))
      .sort((a, b) => b.score - a.score);
    return [{ type: 'TOT_SET_END', payload: { leaderboard } }];
  }

  if (phase === 'mlt') {
    const activePlayers = getPlayers(room).filter((player) => player.isConnected && player.isPlaying);
    const actions = [{
      type: 'MLT_SET_PROMPT',
      payload: {
        prompt: room.mlt?.prompt || room.mlt?.currentPrompt || '',
        round: room.mlt?.round || 1,
        totalRounds: room.mlt?.totalRounds || 5,
        players: activePlayers.map((player) => ({ id: player.id, name: player.name, color: player.color })),
        jokersLeft: room.mlt?.jokers?.[playerId] ?? 2,
        gameName: room.gameName || '',
      },
    }];

    const voteCount = Object.keys(room.mlt?.votes || {}).length;
    const totalVoters = activePlayers.length;
    actions.push({ type: 'MLT_VOTE_RECEIVED', payload: { voteCount, totalVoters } });

    const myVote = room.mlt?.votes?.[playerId];
    if (myVote) actions.push({ type: 'MLT_MARK_VOTED', payload: { votedPlayerId: myVote } });

    if (room.mlt?.paused) actions.push({ type: 'MLT_SET_PAUSED' });
    else actions.push({ type: 'MLT_SET_TIMER', payload: { secondsLeft: room.mlt?.secondsLeft ?? 0 } });

    if (room.mlt?.roundState === 'results') {
      // Recompute per-round results from stored votes
      const voteCounts = {};
      activePlayers.forEach((player) => { voteCounts[player.id] = 0; });
      Object.values(room.mlt?.votes || {}).forEach((targetId) => {
        if (voteCounts[targetId] !== undefined) voteCounts[targetId]++;
      });
      const totalVotesCount = Object.keys(room.mlt?.votes || {}).length;
      const results = activePlayers
        .map((player) => ({
          playerId: player.id,
          name: player.name,
          color: player.color,
          count: voteCounts[player.id] || 0,
          pct: totalVotesCount > 0 ? Math.round((voteCounts[player.id] || 0) / totalVotesCount * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);
      const maxVotes = results[0]?.count || 0;
      const majorityPlayerIds = maxVotes > 0 ? results.filter((r) => r.count === maxVotes).map((r) => r.playerId) : [];

      actions.push({
        type: 'MLT_SET_RESULTS',
        payload: {
          results,
          majorityPlayerIds,
          jokersUsed: Object.keys(room.mlt?.jokersThisRound || {}),
          scores: room.mlt?.scores || {},
          players: activePlayers.map((player) => ({ id: player.id, name: player.name, color: player.color })),
        },
      });
    }

    return actions;
  }

  if (phase === 'mltEnd') {
    const activePlayers = getPlayers(room).filter((player) => player.isConnected && player.isPlaying);
    const leaderboard = activePlayers
      .map((player) => ({
        playerId: player.id,
        name: player.name,
        color: player.color,
        score: room.mlt?.scores?.[player.id] || 0,
        totalVotes: room.mlt?.totalVotes?.[player.id] || 0,
        wins: room.mlt?.wins?.[player.id] || 0,
        title: null,
      }))
      .sort((a, b) => b.score - a.score);
    return [{ type: 'MLT_SET_END', payload: { leaderboard } }];
  }

  return [];
};

const buildDrawRestore = (snapshot) => {
  const actions = [];

  if (snapshot.phase === 'drawing') {
    actions.push({
      type: 'DRAW_SET_ROUND',
      payload: {
        mode: snapshot.mode,
        round: snapshot.round,
        totalRounds: snapshot.totalRounds,
        word: snapshot.word,
        timeLimit: snapshot.timeLimit,
        players: snapshot.players,
      },
    });
    actions.push({ type: 'DRAW_TIMER', payload: { secondsLeft: snapshot.secondsLeft } });
    actions.push({
      type: 'DRAW_SUBMISSION_RECEIVED',
      payload: {
        submittedCount: snapshot.submittedCount,
        totalDrawers: snapshot.totalVoters,
        submittedPlayerIds: snapshot.submittedPlayerIds,
      },
    });
    if (snapshot.hasSubmitted) actions.push({ type: 'DRAW_MARK_SUBMITTED', payload: noopPayload });
  }

  if (snapshot.phase === 'voting') {
    actions.push({
      type: 'DRAW_SET_ROUND',
      payload: {
        mode: snapshot.mode,
        round: snapshot.round,
        totalRounds: snapshot.totalRounds,
        word: snapshot.word,
        timeLimit: snapshot.timeLimit,
        players: snapshot.players,
      },
    });
    actions.push({
      type: 'DRAW_VOTING_STARTED',
      payload: {
        submissions: snapshot.submissions,
        word: snapshot.wordResult,
        mode: snapshot.mode,
        totalVoters: snapshot.totalVoters,
      },
    });
    actions.push({ type: 'DRAW_VOTE_RECEIVED', payload: { voteCount: snapshot.voteCount, totalVoters: snapshot.totalVoters } });
    if (snapshot.hasVoted) actions.push({ type: 'DRAW_MARK_VOTED', payload: { votedForPlayerId: snapshot.myVote } });
  }

  if (snapshot.phase === 'results') {
    actions.push({
      type: 'DRAW_SET_ROUND',
      payload: {
        mode: snapshot.mode,
        round: snapshot.round,
        totalRounds: snapshot.totalRounds,
        word: snapshot.word,
        timeLimit: snapshot.timeLimit,
        players: snapshot.players,
      },
    });
    actions.push({
      type: 'DRAW_SET_RESULTS',
      payload: {
        results: snapshot.results,
        scores: snapshot.scores,
        roundScores: snapshot.roundScores,
        leaderboard: snapshot.leaderboard,
        word: snapshot.wordResult,
      },
    });
  }

  if (snapshot.phase === 'end') {
    actions.push({ type: 'DRAW_SET_END', payload: { leaderboard: snapshot.leaderboard } });
  }

  return actions;
};

const buildFitbRestore = (snapshot) => {
  const actions = [];

  if (snapshot.phase === 'answering' || snapshot.phase === 'voting' || snapshot.phase === 'results') {
    actions.push({
      type: 'FITB_ROUND_START',
      payload: {
        question: snapshot.question,
        round: snapshot.round,
        totalRounds: snapshot.totalRounds,
        players: snapshot.players,
      },
    });
    actions.push({
      type: 'FITB_ANSWER_RECEIVED',
      payload: { answeredCount: snapshot.answeredCount, totalPlayers: snapshot.totalAnswerers },
    });
    if (snapshot.hasAnswered) actions.push({ type: 'FITB_MARK_ANSWERED', payload: { myAnswer: snapshot.myAnswer } });
  }

  if (snapshot.phase === 'voting') {
    actions.push({
      type: 'FITB_VOTING_STARTED',
      payload: {
        answers: snapshot.answers,
        question: snapshot.question,
        totalVoters: snapshot.totalVoters,
      },
    });
    actions.push({ type: 'FITB_VOTE_RECEIVED', payload: { voteCount: snapshot.voteCount, totalVoters: snapshot.totalVoters } });
    if (snapshot.hasVoted) actions.push({ type: 'FITB_MARK_VOTED', payload: { answerId: snapshot.myVote } });
  }

  if (snapshot.phase === 'results') {
    actions.push({
      type: 'FITB_RESULTS',
      payload: {
        answers: snapshot.answers,
        scores: snapshot.scores,
        leaderboard: snapshot.leaderboard,
        question: snapshot.question,
      },
    });
  }

  if (snapshot.phase === 'end') {
    actions.push({ type: 'FITB_END', payload: { leaderboard: snapshot.leaderboard } });
  }

  return actions;
};

const buildSelfieRestore = (snapshot) => {
  const actions = [];

  if (snapshot.phase === 'photo') {
    actions.push({
      type: 'SELFIE_PHOTO_PHASE',
      payload: { round: snapshot.round, totalRounds: snapshot.totalRounds, players: snapshot.players },
    });
    actions.push({
      type: 'SELFIE_PHOTO_RECEIVED',
      payload: { photoCount: snapshot.photoCount, totalPlayers: snapshot.totalPhotographers },
    });
    if (snapshot.hasSubmittedPhoto) actions.push({ type: 'SELFIE_MARK_PHOTO_SUBMITTED', payload: noopPayload });
  }

  if (snapshot.phase === 'drawing') {
    actions.push({
      type: 'SELFIE_PHOTO_PHASE',
      payload: { round: snapshot.round, totalRounds: snapshot.totalRounds, players: snapshot.players },
    });
    actions.push({
      type: 'SELFIE_DRAW_ASSIGNED',
      payload: {
        photoData: snapshot.assignedPhotoData,
        ownerName: snapshot.assignedOwnerName,
        ownerColor: snapshot.assignedOwnerColor,
        ownerPlayerId: snapshot.assignedOwnerPlayerId,
        prompt: snapshot.assignedPrompt,
        promptTemplate: snapshot.promptTemplate,
      },
    });
    actions.push({
      type: 'SELFIE_DRAWING_PHASE',
      payload: { players: snapshot.players, totalDrawers: snapshot.totalDrawers, promptTemplate: snapshot.promptTemplate },
    });
    actions.push({
      type: 'SELFIE_DRAWING_RECEIVED',
      payload: { drawingCount: snapshot.drawingCount, totalDrawers: snapshot.totalDrawers },
    });
    if (snapshot.hasSubmittedDrawing) actions.push({ type: 'SELFIE_MARK_DRAWING_SUBMITTED', payload: noopPayload });
  }

  if (snapshot.phase === 'voting') {
    actions.push({
      type: 'SELFIE_VOTING_STARTED',
      payload: { submissions: snapshot.submissions, totalVoters: snapshot.totalVoters },
    });
    actions.push({ type: 'SELFIE_VOTE_RECEIVED', payload: { voteCount: snapshot.voteCount, totalVoters: snapshot.totalVoters } });
    if (snapshot.hasVoted) actions.push({ type: 'SELFIE_MARK_VOTED', payload: { drawerId: snapshot.myVote } });
  }

  if (snapshot.phase === 'results') {
    actions.push({
      type: 'SELFIE_RESULTS',
      payload: {
        submissions: snapshot.submissions,
        scores: snapshot.scores,
        leaderboard: snapshot.leaderboard,
        promptTemplate: snapshot.promptTemplate,
      },
    });
  }

  return actions;
};

const buildCaptionRestore = (snapshot) => {
  const actions = [];

  if (snapshot.phase === 'photo') {
    actions.push({
      type: 'CAPTION_PHOTO_PHASE',
      payload: { round: snapshot.round, totalRounds: snapshot.totalRounds, players: snapshot.players },
    });
    actions.push({ type: 'CAPTION_PHOTO_SUBMITTED', payload: { submittedCount: snapshot.photoSubmittedCount } });
    if (snapshot.hasSubmittedPhoto) actions.push({ type: 'CAPTION_MARK_PHOTO_SUBMITTED', payload: noopPayload });
  }

  if (snapshot.phase === 'writing' || snapshot.phase === 'voting' || snapshot.phase === 'results' || snapshot.phase === 'ended') {
    actions.push({
      type: 'CAPTION_WRITING_PHASE',
      payload: {
        round: snapshot.round,
        totalRounds: snapshot.totalRounds,
        prompt: snapshot.prompt,
        featuredOwnerId: snapshot.featuredOwnerId,
        featuredOwnerName: snapshot.featuredOwnerName,
        featuredPhotoData: snapshot.featuredPhotoData,
        writers: snapshot.writers,
      },
    });
    actions.push({
      type: 'CAPTION_CAPTION_SUBMITTED',
      payload: { playerId: snapshot.myOwnCaptionId ? 'me' : null, submittedCount: snapshot.captionSubmittedCount },
    });
    if (snapshot.hasWrittenCaption) actions.push({ type: 'CAPTION_MARK_CAPTION_WRITTEN', payload: noopPayload });
  }

  if (snapshot.phase === 'voting' || snapshot.phase === 'results' || snapshot.phase === 'ended') {
    actions.push({
      type: 'CAPTION_VOTING_PHASE',
      payload: {
        captions: snapshot.captions,
        featuredOwnerId: snapshot.featuredOwnerId,
        featuredOwnerName: snapshot.featuredOwnerName,
        featuredPhotoData: snapshot.featuredPhotoData,
      },
    });
    if (snapshot.myOwnCaptionId) actions.push({ type: 'CAPTION_SET_OWN_ID', payload: { captionId: snapshot.myOwnCaptionId } });
    actions.push({ type: 'CAPTION_VOTE_RECEIVED', payload: { voteCount: snapshot.voteCount, totalVoters: snapshot.totalVoters } });
    if (snapshot.hasVoted) actions.push({ type: 'CAPTION_MARK_VOTED', payload: { captionId: snapshot.myVote } });
  }

  if (snapshot.phase === 'results') {
    actions.push({
      type: 'CAPTION_ROUND_RESULTS',
      payload: {
        round: snapshot.round,
        totalRounds: snapshot.totalRounds,
        captionResults: snapshot.captionResults,
        roundScores: snapshot.roundScores,
        scores: snapshot.scores,
      },
    });
  }

  if (snapshot.phase === 'ended') {
    actions.push({
      type: 'CAPTION_ROUND_RESULTS',
      payload: {
        round: snapshot.round,
        totalRounds: snapshot.totalRounds,
        captionResults: snapshot.captionResults,
        roundScores: snapshot.roundScores,
        scores: snapshot.scores,
      },
    });
    actions.push({ type: 'CAPTION_GAME_OVER', payload: { scores: snapshot.scores, leaderboard: snapshot.leaderboard } });
  }

  return actions;
};

const buildPhotoVoteRestore = (snapshot) => {
  const actions = [];

  if (snapshot.phase === 'photo') {
    actions.push({
      type: 'PHOTOVOTE_PHOTO_PHASE',
      payload: {
        subType: snapshot.subType,
        round: snapshot.round,
        totalRounds: snapshot.totalRounds,
        players: snapshot.players,
        prompt: snapshot.prompt,
      },
    });
    actions.push({ type: 'PHOTOVOTE_PHOTO_SUBMITTED', payload: { submittedCount: snapshot.photoSubmittedCount } });
    if (snapshot.hasSubmittedPhoto) actions.push({ type: 'PHOTOVOTE_MARK_PHOTO_SUBMITTED', payload: noopPayload });
  }

  if (snapshot.phase === 'voting' || snapshot.phase === 'results' || snapshot.phase === 'ended') {
    actions.push({
      type: 'PHOTOVOTE_VOTING_PHASE',
      payload: {
        subType: snapshot.subType,
        round: snapshot.round,
        totalRounds: snapshot.totalRounds,
        prompt: snapshot.prompt,
        photos: snapshot.photos,
      },
    });
    actions.push({ type: 'PHOTOVOTE_VOTE_RECEIVED', payload: { voteCount: snapshot.voteCount, totalVoters: snapshot.totalVoters } });
    if (snapshot.hasVoted) actions.push({ type: 'PHOTOVOTE_MARK_VOTED', payload: { targetPlayerId: snapshot.myVote } });
  }

  if (snapshot.phase === 'results') {
    actions.push({
      type: 'PHOTOVOTE_ROUND_RESULTS',
      payload: {
        round: snapshot.round,
        voteResults: snapshot.voteResults,
        roundScores: snapshot.roundScores,
        scores: snapshot.scores,
      },
    });
  }

  if (snapshot.phase === 'ended') {
    actions.push({
      type: 'PHOTOVOTE_ROUND_RESULTS',
      payload: {
        round: snapshot.round,
        voteResults: snapshot.voteResults,
        roundScores: snapshot.roundScores,
        scores: snapshot.scores,
      },
    });
    actions.push({ type: 'PHOTOVOTE_GAME_OVER', payload: { scores: snapshot.scores, leaderboard: snapshot.leaderboard } });
  }

  return actions;
};

const buildDtRestore = (snapshot) => {
  const actions = [];

  if (snapshot.phase === 'selfie') {
    actions.push({
      type: 'DT_SELFIE_PHASE',
      payload: { photoCount: snapshot.selfiePhotoCount, totalPhotographers: snapshot.selfieTotalPhotographers },
    });
    actions.push({
      type: 'DT_PHOTO_RECEIVED',
      payload: { photoCount: snapshot.selfiePhotoCount, totalPhotographers: snapshot.selfieTotalPhotographers },
    });
    if (snapshot.hasSubmittedSelfie) actions.push({ type: 'DT_SELFIE_PHOTO_REUSED', payload: noopPayload });
  }

  if (snapshot.phase === 'prompting') {
    actions.push({
      type: 'DT_PROMPT_PHASE',
      payload: { totalPrompts: snapshot.totalPrompts, secondsLeft: snapshot.promptSecondsLeft },
    });
    actions.push({
      type: 'DT_PROMPT_RECEIVED',
      payload: { submittedCount: snapshot.promptsSubmittedCount, totalPrompts: snapshot.totalPrompts },
    });
    if (snapshot.hasSubmittedPrompt) actions.push({ type: 'DT_MARK_PROMPT_SUBMITTED', payload: noopPayload });
  }

  if (snapshot.phase === 'drawing') {
    actions.push({ type: 'DT_DRAWING_PHASE', payload: { totalChains: snapshot.totalChains } });
    actions.push({
      type: 'DT_CHAIN_PROGRESS',
      payload: { chainsCompleted: snapshot.chainsCompletedCount, totalChains: snapshot.totalChains },
    });
    Object.entries(snapshot.chainProgress || {}).forEach(([promptId, progress]) => {
      actions.push({ type: 'DT_DRAWING_PROGRESS', payload: { promptId, ...progress } });
    });
    if (snapshot.currentTurn) actions.push({ type: 'DT_YOUR_TURN', payload: snapshot.currentTurn });
  }

  if (snapshot.phase === 'guessing') {
    actions.push({
      type: 'DT_GUESSING_PHASE',
      payload: { totalGuessers: snapshot.totalGuessers, secondsLeft: snapshot.guessSecondsLeft },
    });
    actions.push({
      type: 'DT_GUESS_RECEIVED',
      payload: { guessedCount: snapshot.guessedCount, totalGuessers: snapshot.totalGuessers },
    });
    if (snapshot.guessTurn) actions.push({ type: 'DT_YOUR_GUESS', payload: { ...snapshot.guessTurn, secondsLeft: snapshot.guessSecondsLeft } });
    if (snapshot.hasGuessed) actions.push({ type: 'DT_MARK_GUESSED', payload: noopPayload });
  }

  if (snapshot.phase === 'reveal') {
    actions.push({ type: 'DT_REVEAL_PHASE', payload: { totalPrompts: snapshot.reveal?.totalPrompts || 0 } });
    if (snapshot.reveal) actions.push({ type: 'DT_REVEAL_UPDATE', payload: snapshot.reveal });
  }

  if (snapshot.phase === 'end') {
    actions.push({ type: 'DT_END', payload: { scores: snapshot.scores, leaderboard: snapshot.leaderboard } });
  }

  return actions;
};

const buildMiniGameRestore = (room, snapshot) => {
  if (!snapshot) return [];

  switch (snapshot.type) {
    case 'draw':
      return buildDrawRestore(snapshot);
    case 'fitb':
      return buildFitbRestore(snapshot);
    case 'selfie':
      return buildSelfieRestore(snapshot);
    case 'caption':
      return buildCaptionRestore(snapshot);
    case 'photovote':
      return buildPhotoVoteRestore(snapshot);
    case 'dt':
      return buildDtRestore(snapshot);
    default:
      return [];
  }
};

export const buildJoinRestorePlan = ({ room, playerId, isRejoin, miniGameState }) => {
  const roomPayload = getBaseRoomPayload(room, playerId, isRejoin);

  // For mlt phase, pass room.mlt as snapshot so getRouteForPhase can check roundState
  const snapshot = room.phase === 'mlt' ? room.mlt : miniGameState;
  const route = roomPayload.joinedMidRound ? '/lobby' : getRouteForPhase(room.phase, snapshot);
  const actions = miniGameState
    ? buildMiniGameRestore(room, miniGameState)
    : buildClassicRestore(room, playerId);

  return { roomPayload, actions, route };
};
