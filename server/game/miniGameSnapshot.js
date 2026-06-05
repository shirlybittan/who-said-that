const mapPlayer = (player) => ({ id: player.id, name: player.name, color: player.color });

const getActivePlayers = (room) =>
  (room.players || []).filter((player) => player.isConnected && player.isPlaying);

const buildLeaderboard = (players, scores = {}) =>
  players
    .map((player) => ({ id: player.id, name: player.name, color: player.color, score: scores[player.id] || 0 }))
    .sort((a, b) => b.score - a.score);

const buildDrawSnapshot = (room, playerId) => {
  const activePlayers = getActivePlayers(room);
  const players = activePlayers.map(mapPlayer);
  const submissions = Object.entries(room.draw?.submissions || {}).map(([submissionPlayerId, submission]) => {
    const player = room.players.find((entry) => entry.id === submissionPlayerId);
    const word = room.draw?.mode === 'secret'
      ? (room.draw?.playerWords?.[submissionPlayerId] || '?')
      : room.draw?.word;

    return {
      playerId: submissionPlayerId,
      name: player?.name || 'Unknown',
      color: player?.color || '#fff',
      strokes: submission?.strokes || [],
      word,
    };
  });

  const voteCounts = {};
  activePlayers.forEach((player) => { voteCounts[player.id] = 0; });
  Object.values(room.draw?.votes || {}).forEach((votedFor) => {
    if (voteCounts[votedFor] !== undefined) voteCounts[votedFor] += 1;
  });

  const results = submissions
    .map((submission) => ({ ...submission, votes: voteCounts[submission.playerId] || 0 }))
    .sort((a, b) => b.votes - a.votes);

  return {
    type: 'draw',
    phase: room.draw?.phase || 'waiting',
    round: room.draw?.round || room.currentRound || 0,
    totalRounds: room.draw?.totalRounds || room.totalRounds || 0,
    mode: room.draw?.mode || 'classic',
    word: room.draw?.mode === 'secret' ? (room.draw?.playerWords?.[playerId] || null) : (room.draw?.word || null),
    wordResult: room.draw?.word || null,
    timeLimit: room.draw?.timeLimit || 90,
    secondsLeft: room.draw?.secondsLeft ?? room.draw?.timeLimit ?? 90,
    players,
    submissions,
    submittedCount: submissions.length,
    submittedPlayerIds: submissions.map((submission) => submission.playerId),
    hasSubmitted: !!room.draw?.submissions?.[playerId],
    hasVoted: room.draw?.votes?.[playerId] !== undefined,
    myVote: room.draw?.votes?.[playerId] || null,
    voteCount: Object.keys(room.draw?.votes || {}).length,
    totalVoters: activePlayers.length,
    results,
    roundScores: voteCounts,
    scores: room.draw?.scores || {},
    leaderboard: buildLeaderboard(activePlayers, room.draw?.scores || {}),
  };
};

const buildFitbSnapshot = (room, playerId) => {
  const activePlayers = getActivePlayers(room);
  const players = activePlayers.map(mapPlayer);
  const myAnswerEntry = (room.fitb?.answers || []).find((answer) => answer.playerId === playerId) || null;
  const myVote = room.fitb?._votes?.[playerId];
  const answers = room.fitb?.phase === 'voting'
    ? (room.fitb?.answers || []).map((answer, index) => ({ id: index, text: answer.text }))
    : [...(room.fitb?.answers || [])].sort((a, b) => (b.votes || 0) - (a.votes || 0));

  return {
    type: 'fitb',
    phase: room.fitb?.phase || 'waiting',
    question: room.fitb?.question || '',
    round: room.fitb?.round || 0,
    totalRounds: room.fitb?.totalRounds || 0,
    players,
    answers,
    hasAnswered: !!myAnswerEntry,
    myAnswer: myAnswerEntry?.text || null,
    answeredCount: (room.fitb?.answers || []).length,
    totalAnswerers: activePlayers.length,
    hasVoted: myVote !== undefined,
    myVote: myVote !== undefined ? myVote : null,
    voteCount: Object.keys(room.fitb?._votes || {}).length,
    totalVoters: activePlayers.length,
    scores: room.fitb?.scores || {},
    leaderboard: buildLeaderboard(activePlayers, room.fitb?.scores || {}),
  };
};

const buildSelfieSubmissions = (room) => {
  return Object.keys(room.selfie?.strokes || {}).map((drawerId) => {
    const drawer = room.players.find((player) => player.id === drawerId);
    const ownerPlayerId = room.selfie?.assignments?.[drawerId];
    const owner = room.players.find((player) => player.id === ownerPlayerId);
    const voteCount = Object.values(room.selfie?.votes || {}).filter((vote) => vote === drawerId).length;
    const personalizedPrompt = (room.selfie?.promptTemplate || '').replace(/\[Name\]/g, owner?.name || '?');

    return {
      drawerId,
      drawerName: drawer?.name || '?',
      drawerColor: drawer?.color || '#fff',
      ownerPlayerId,
      ownerName: owner?.name || '?',
      photoData: room.selfie?.photos?.[ownerPlayerId] || null,
      strokes: room.selfie?.strokes?.[drawerId] || [],
      prompt: personalizedPrompt,
      votes: voteCount,
    };
  }).sort((a, b) => b.votes - a.votes);
};

const buildSelfieSnapshot = (room, playerId) => {
  const activePlayers = getActivePlayers(room);
  const players = activePlayers.map(mapPlayer);
  const assignedOwnerPlayerId = room.selfie?.assignments?.[playerId] || null;
  const assignedOwner = room.players.find((player) => player.id === assignedOwnerPlayerId);
  const submissions = buildSelfieSubmissions(room);
  const drawerIds = activePlayers.filter((player) => room.selfie?.assignments?.[player.id]).map((player) => player.id);

  return {
    type: 'selfie',
    phase: room.selfie?.phase || 'waiting',
    round: room.selfie?.round || 0,
    totalRounds: room.selfie?.totalRounds || 0,
    players,
    photoCount: Object.keys(room.selfie?.photos || {}).length,
    totalPhotographers: activePlayers.length,
    hasSubmittedPhoto: !!room.selfie?.photos?.[playerId],
    drawingCount: Object.keys(room.selfie?.strokes || {}).length,
    totalDrawers: drawerIds.length,
    hasSubmittedDrawing: !!room.selfie?.strokes?.[playerId],
    hasVoted: room.selfie?.votes?.[playerId] !== undefined,
    myVote: room.selfie?.votes?.[playerId] || null,
    voteCount: Object.keys(room.selfie?.votes || {}).length,
    totalVoters: activePlayers.length,
    assignedPhotoData: assignedOwnerPlayerId ? (room.selfie?.photos?.[assignedOwnerPlayerId] || null) : null,
    assignedOwnerName: assignedOwner?.name || null,
    assignedOwnerColor: assignedOwner?.color || null,
    assignedOwnerPlayerId,
    assignedPrompt: assignedOwnerPlayerId
      ? (room.selfie?.promptTemplate || '').replace(/\[Name\]/g, assignedOwner?.name || '?')
      : null,
    promptTemplate: room.selfie?.promptTemplate || null,
    submissions,
    scores: room.selfie?.scores || {},
    leaderboard: buildLeaderboard(activePlayers, room.selfie?.scores || {}),
  };
};

const buildCaptionRoundScores = (room) => {
  const roundScores = {};
  Object.entries(room.caption?.votes || {}).forEach(([, captionId]) => {
    const caption = Object.values(room.caption?.captions || {}).find((entry) => entry.id === captionId);
    if (!caption) return;
    roundScores[caption.playerId] = (roundScores[caption.playerId] || 0) + 1;
  });
  return roundScores;
};

const buildCaptionSnapshot = (room, playerId) => {
  const activePlayers = getActivePlayers(room);
  const players = activePlayers.map(mapPlayer);
  const owner = room.players.find((player) => player.id === room.caption?.featuredOwnerId);
  const captions = Object.values(room.caption?.captions || {}).map((caption) => ({ id: caption.id, text: caption.text }));
  const myCaption = room.caption?.captions?.[playerId] || null;
  const roundScores = buildCaptionRoundScores(room);
  const captionResults = Object.values(room.caption?.captions || {}).map((caption) => ({
    id: caption.id,
    playerId: caption.playerId,
    text: caption.text,
    voteCount: Object.values(room.caption?.votes || {}).filter((vote) => vote === caption.id).length,
    playerName: room.players.find((player) => player.id === caption.playerId)?.name || '?',
  })).sort((a, b) => b.voteCount - a.voteCount);

  return {
    type: 'caption',
    phase: room.caption?.phase || 'waiting',
    round: room.caption?.currentRound || 0,
    totalRounds: room.caption?.totalRounds || 0,
    players,
    prompt: room.caption?.currentPrompt || null,
    featuredOwnerId: room.caption?.featuredOwnerId || null,
    featuredOwnerName: owner?.name || '?',
    featuredPhotoData: room.caption?.featuredOwnerId ? (room.caption?.photos?.[room.caption.featuredOwnerId] || null) : null,
    writers: activePlayers.filter((player) => player.id !== room.caption?.featuredOwnerId).map((player) => ({ id: player.id, name: player.name })),
    totalPhotographers: activePlayers.length,
    photoSubmittedCount: Object.keys(room.caption?.photos || {}).length,
    hasSubmittedPhoto: !!room.caption?.photos?.[playerId],
    captionSubmittedCount: Object.keys(room.caption?.captions || {}).length,
    totalWriters: activePlayers.length,
    hasWrittenCaption: !!myCaption,
    myCaption: myCaption?.text || '',
    captions,
    myOwnCaptionId: myCaption?.id || null,
    hasVoted: !!room.caption?.votes?.[playerId],
    myVote: room.caption?.votes?.[playerId] || null,
    voteCount: Object.keys(room.caption?.votes || {}).length,
    totalVoters: activePlayers.length,
    captionResults,
    roundScores,
    scores: room.caption?.scores || {},
    leaderboard: Object.entries(room.caption?.scores || {})
      .map(([id, pts]) => ({ id, pts, name: room.players.find((player) => player.id === id)?.name || '?' }))
      .sort((a, b) => b.pts - a.pts),
  };
};

const buildPhotoVoteResults = (room) => {
  const activePlayers = getActivePlayers(room);
  const voteCounts = {};
  Object.values(room.photoVote?.votes || {}).forEach((targetId) => {
    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
  });
  const maxVotes = Math.max(0, ...Object.values(voteCounts));
  const winners = Object.keys(voteCounts).filter((id) => voteCounts[id] === maxVotes && maxVotes > 0);

  return {
    roundScores: Object.entries(room.photoVote?.votes || {}).reduce((scores, [voterId, targetId]) => {
      if (winners.includes(targetId)) scores[voterId] = (scores[voterId] || 0) + 1;
      return scores;
    }, winners.reduce((scores, winnerId) => {
      scores[winnerId] = (scores[winnerId] || 0) + (voteCounts[winnerId] || 0);
      return scores;
    }, {})),
    voteResults: activePlayers.map((player) => ({
      playerId: player.id,
      playerName: player.name,
      photoData: room.photoVote?.photos?.[player.id] || null,
      voteCount: voteCounts[player.id] || 0,
      isWinner: winners.includes(player.id),
    })).sort((a, b) => b.voteCount - a.voteCount),
  };
};

const buildPhotoVoteSnapshot = (room, playerId) => {
  const activePlayers = getActivePlayers(room);
  const players = activePlayers.map(mapPlayer);
  const { roundScores, voteResults } = buildPhotoVoteResults(room);

  return {
    type: 'photovote',
    phase: room.photoVote?.phase || 'waiting',
    subType: room.photoVote?.subType || 'pmatch',
    round: room.photoVote?.currentRound || 0,
    totalRounds: room.photoVote?.totalRounds || 0,
    players,
    prompt: room.photoVote?.phase === 'photo'
      ? (room.photoVote?.pendingPrompt || room.photoVote?.currentPrompt || null)
      : (room.photoVote?.currentPrompt || null),
    photos: activePlayers.map((player) => ({
      playerId: player.id,
      playerName: player.name,
      photoData: room.photoVote?.photos?.[player.id] || null,
    })),
    totalPhotographers: activePlayers.length,
    photoSubmittedCount: Object.keys(room.photoVote?.photos || {}).length,
    hasSubmittedPhoto: !!room.photoVote?.photos?.[playerId],
    hasVoted: !!room.photoVote?.votes?.[playerId],
    myVote: room.photoVote?.votes?.[playerId] || null,
    voteCount: Object.keys(room.photoVote?.votes || {}).length,
    totalVoters: activePlayers.length,
    voteResults,
    roundScores,
    scores: room.photoVote?.scores || {},
    leaderboard: Object.entries(room.photoVote?.scores || {})
      .map(([id, pts]) => ({ id, pts, name: room.players.find((player) => player.id === id)?.name || '?' }))
      .sort((a, b) => b.pts - a.pts),
  };
};

const buildCombinedStrokes = (chain) =>
  (chain?.drawingSteps || []).flatMap((step) => step.strokes || []);

const buildDtRevealSnapshot = (room, voteSeconds) => {
  const promptId = room.dt?.revealQueue?.[room.dt?.revealCurrentIndex || 0];
  if (!promptId) return null;

  const chain = room.dt?.chains?.[promptId];
  if (!chain) return null;

  const targetPlayer = room.players.find((player) => player.id === chain.targetPlayerId);
  const authorPlayer = room.players.find((player) => player.id === chain.authorId);
  const votes = room.dt?.votes?.[promptId] || {};
  const totalVoters = getActivePlayers(room).filter((player) => player.id !== chain.targetPlayerId).length;

  return {
    promptIndex: room.dt?.revealCurrentIndex || 0,
    totalPrompts: room.dt?.revealQueue?.length || 0,
    step: room.dt?.revealStep || 0,
    promptId,
    templateText: chain.templateText,
    targetPlayerId: chain.targetPlayerId,
    targetName: targetPlayer?.name || '?',
    targetColor: targetPlayer?.color || '#fff',
    originalSelfieData: chain.originalSelfieData || null,
    authorPlayerId: chain.authorId,
    authorName: authorPlayer?.name || '?',
    finalText: chain.finalText,
    drawingSteps: (chain.drawingSteps || []).map((step, index) => {
      const drawer = room.players.find((player) => player.id === step.playerId);
      return {
        playerId: step.playerId,
        playerName: drawer?.name || '?',
        playerColor: drawer?.color || '#fff',
        strokes: (chain.drawingSteps || []).slice(0, index + 1).flatMap((entry) => entry.strokes || []),
        stepIndex: index,
      };
    }),
    guessText: room.dt?.guesses?.[promptId] || '',
    votes,
    voteCount: Object.keys(votes).length,
    totalVoters,
    voteSecondsLeft: voteSeconds,
    correctCount: Object.values(votes).filter((vote) => vote === 'correct').length,
    closeCount: Object.values(votes).filter((vote) => vote === 'close').length,
    wrongCount: Object.values(votes).filter((vote) => vote === 'wrong').length,
  };
};

const buildDtSnapshot = (room, playerId, options = {}) => {
  const activePlayers = getActivePlayers(room);
  const promptPhaseRemaining = room.dt?.promptStartedAt
    ? Math.max(0, (options.dtPromptSeconds || 60) - Math.floor((Date.now() - room.dt.promptStartedAt) / 1000))
    : (options.dtPromptSeconds || 60);
  const guessPhaseRemaining = room.dt?.guessStartedAt
    ? Math.max(0, (options.dtGuessSeconds || 60) - Math.floor((Date.now() - room.dt.guessStartedAt) / 1000))
    : (options.dtGuessSeconds || 60);
  const revealVoteRemaining = room.dt?.voteStartedAt
    ? Math.max(0, (options.dtVoteSeconds || 30) - Math.floor((Date.now() - room.dt.voteStartedAt) / 1000))
    : (options.dtVoteSeconds || 30);
  const currentPromptId = room.dt?.activeTurns?.[playerId] || null;
  const currentChain = currentPromptId ? room.dt?.chains?.[currentPromptId] : null;
  const guessEntry = Object.entries(room.dt?.chains || {}).find(([, chain]) => chain.targetPlayerId === playerId);
  const guessPromptId = guessEntry?.[0] || null;
  const guessChain = guessEntry?.[1] || null;

  return {
    type: 'dt',
    phase: room.dt?.phase || 'waiting',
    selfiePhotoCount: Object.keys(room.dt?.selfiePhotos || {}).length,
    selfieTotalPhotographers: activePlayers.length,
    hasSubmittedSelfie: !!room.dt?.selfiePhotos?.[playerId],
    totalPrompts: activePlayers.length,
    promptsSubmittedCount: (room.dt?.prompts || []).length,
    hasSubmittedPrompt: (room.dt?.prompts || []).some((prompt) => prompt.authorId === playerId),
    promptSecondsLeft: promptPhaseRemaining,
    totalChains: room.dt?.totalChains || Object.keys(room.dt?.chains || {}).length,
    chainsCompletedCount: room.dt?.chainsCompletedDrawing || 0,
    chainProgress: Object.fromEntries(Object.entries(room.dt?.chains || {}).map(([promptId, chain]) => {
      const activeDrawerId = Object.keys(room.dt?.activeTurns || {}).find((drawerId) => room.dt?.activeTurns?.[drawerId] === promptId);
      const activeDrawer = room.players.find((player) => player.id === activeDrawerId);
      return [promptId, {
        stepsDone: chain.drawingSteps?.length || 0,
        totalSteps: chain.participants?.length || 0,
        drawerName: activeDrawer?.name || '?',
      }];
    })),
    currentTurn: currentChain ? {
      promptId: currentPromptId,
      finalText: currentChain.finalText,
      existingStrokes: buildCombinedStrokes(currentChain),
      originalSelfieData: currentChain.originalSelfieData || null,
      position: (currentChain.currentParticipantIndex || 0) + 1,
      totalPositions: currentChain.participants?.length || 0,
      secondsLeft: currentChain.secondsLeft ?? (options.dtDrawSeconds || 75),
    } : null,
    hasSubmittedTurn: false,
    totalGuessers: Object.keys(room.dt?.chains || {}).length,
    guessedCount: Object.keys(room.dt?.guesses || {}).length,
    guessSecondsLeft: guessPhaseRemaining,
    guessTurn: guessChain ? {
      promptId: guessPromptId,
      finalStrokes: buildCombinedStrokes(guessChain),
      originalSelfieData: guessChain.originalSelfieData || null,
      drawerCount: guessChain.drawingSteps?.length || 0,
    } : null,
    hasGuessed: !!(guessPromptId && room.dt?.guesses?.[guessPromptId] !== undefined),
    reveal: buildDtRevealSnapshot(room, revealVoteRemaining),
    scores: room.dt?.scores || {},
    leaderboard: buildLeaderboard(activePlayers, room.dt?.scores || {}),
  };
};

const buildMiniGameSnapshot = (room, playerId, options = {}) => {
  switch (room.phase) {
    case 'drawing':
    case 'drawEnd':
      return buildDrawSnapshot(room, playerId);
    case 'fitb':
    case 'fitbEnd':
      return buildFitbSnapshot(room, playerId);
    case 'selfie':
    case 'selfieEnd':
      return buildSelfieSnapshot(room, playerId);
    case 'caption':
      return buildCaptionSnapshot(room, playerId);
    case 'photovote':
      return buildPhotoVoteSnapshot(room, playerId);
    case 'dt':
    case 'dtEnd':
      return buildDtSnapshot(room, playerId, options);
    default:
      return null;
  }
};

module.exports = {
  buildMiniGameSnapshot,
};
