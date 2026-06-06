import React, { createContext, useReducer, useContext } from 'react';

const initialState = {
  playerId: localStorage.getItem('wst_playerId') || null,
  playerName: localStorage.getItem('wst_playerName') || null,
  roomCode: localStorage.getItem('wst_roomCode') || null,
  isHost: false,
  isPlaying: true,
  joinedMidRound: false,
  phase: null,
  players: [],
  mode: "friends",
  totalRounds: 3,
  currentRound: 0,
  currentQuestion: null,
  currentRoundType: 'wst',          // 'wst' | 'situational' | 'this-or-that'
  situationalTarget: null,          // { id, name, color } or null
  answers: [],
  currentAnswerIndex: 0,
  myAnswer: null,
  myAnswerIndex: null,
  scores: {},
  stats: null,
  customQuestions: [],
  hasAnswered: false,
  hasVoted: false,
  answeredCount: 0,
  votedCount: 0,
  totalPlayers: 0,
  error: null,
  lang: localStorage.getItem('wst_lang') || 'en',
  gameType: 'most-likely-to',
  gameName: '',
  // Persistent selfie: stored across game switches in localStorage
  savedSelfie: localStorage.getItem('wst_saved_selfie') || null,
  tot: {
    question: null,
    a: '',
    b: '',
    round: 0,
    totalRounds: 5,
    hasVoted: false,
    myChoice: null,       // 'a' | 'b'
    countA: 0,
    countB: 0,
    pctA: 0,
    pctB: 0,
    voteCount: 0,
    totalVoters: 0,
    resultsVisible: false,
    majorityChoice: null,
    voteDetails: [],
    scores: {},
    prevScores: {},
    scorePlayers: [],
    leaderboard: [],
    secondsLeft: 0,
    paused: false,
    timeLimit: 30,
    votedPlayerIds: [],
  },
  mlt: {
    totalRounds: 5,
    allowSelfVote: true,
    prompt: null,
    round: 0,
    roundState: 'waiting',
    players: [],
    results: [],
    majorityPlayerIds: [],
    leaderboard: [],
    secondsLeft: 30,
    hasVoted: false,
    votedPlayerId: null,
    voteCount: 0,
    totalVoters: 0,
    jokersLeft: 2,
    jokerActive: false,
    paused: false,
    jokersUsed: [],
    gameName: '',
    scores: {},
    prevScores: {},
    scorePlayers: [],
  },
  sit: {
    phase: 'voting',       // 'voting' | 'results'
    question: '',
    answers: [],           // [{id, text}] during voting; [{id,text,authorName,authorColor,votes}] in results
    hasVoted: false,
    myVote: null,
    voteCount: 0,
    totalVoters: 0,
    scores: {},
    scorePlayers: [],
    winners: [],
  },
  fitb: {
    phase: 'waiting',      // 'waiting' | 'answering' | 'voting' | 'results'
    round: 0,
    totalRounds: 3,
    question: null,
    answers: [],           // [{id, text}] during voting; [{playerId, playerName, playerColor, text, votes}] in results
    players: [],
    hasAnswered: false,
    hasVoted: false,
    myAnswer: null,
    myAnswerIndex: -1,
    myVote: null,
    answeredCount: 0,
    totalAnswerers: 0,
    voteCount: 0,
    totalVoters: 0,
    scores: {},
    leaderboard: [],
    answerTimeLeft: 30,
    timeLimit: 30,
  },
  selfie: {
    phase: 'waiting',      // 'waiting' | 'photo' | 'drawing' | 'voting' | 'results'
    players: [],
    photoCount: 0,
    totalPhotographers: 0,
    drawingCount: 0,
    totalDrawers: 0,
    hasSubmittedPhoto: false,
    hasSubmittedDrawing: false,
    hasVoted: false,
    myVote: null,
    assignedPhotoData: null,
    assignedOwnerName: null,
    assignedOwnerColor: null,
    assignedOwnerPlayerId: null,
    assignedPrompt: null,       // e.g. "Turn Maya into a pirate"
    promptTemplate: null,       // e.g. "Turn [Name] into a pirate"
    secondsLeft: 90,            // drawing phase countdown
    timeLimit: 90,
    submissions: [],       // [{drawerId, drawerName, drawerColor, ownerName, photoData, strokes, votes?, prompt}]
    voteCount: 0,
    totalVoters: 0,
    scores: {},
    leaderboard: [],
  },
  draw: {
    phase: 'waiting',      // 'waiting' | 'drawing' | 'voting' | 'results' | 'end'
    mode: 'classic',       // 'classic' | 'secret'
    round: 0,
    totalRounds: 3,
    word: null,
    yourWord: null,        // player's personal word (classic = same as word; secret = unique)
    skipsUsed: 0,
    maxSkips: 2,
    timeLimit: 90,
    secondsLeft: 90,
    players: [],
    submittedCount: 0,
    submittedPlayerIds: [],
    submissions: [],       // [{playerId, name, color, strokes, word}]
    results: [],           // [{playerId, name, color, strokes, votes, word}]
    scores: {},
    roundScores: {},
    leaderboard: [],
    hasSubmitted: false,
    hasVoted: false,
    votedForPlayerId: null,
    voteCount: 0,
    totalVoters: 0,
    wordResult: null,
  },
  globalScores: {},             // { playerId: cumulativeScore } — persists across games until host resets
  globalLeaderboard: [],        // sorted [{id, name, color, score}]
  phaseTimer: { secondsLeft: 60, active: false },
  roomConfig: { roundDurationSecs: 60, anonymousMode: false },
  caption: {
    phase: 'waiting',      // 'waiting' | 'photo' | 'writing' | 'voting' | 'results' | 'ended'
    round: 0,
    totalRounds: 3,
    prompt: null,
    featuredOwnerId: null,
    featuredOwnerName: null,
    featuredPhotoData: null,
    writers: [],           // players who can write (not the owner)
    captions: [],          // [{id, text}] during voting (anonymised)
    captionResults: [],    // [{id, text, playerName, voteCount}] in results
    hasSubmittedPhoto: false,
    hasWrittenCaption: false,
    hasVoted: false,
    myVote: null,          // captionId
    photoSubmittedCount: 0,
    totalPhotographers: 0,
    captionSubmittedCount: 0,
    totalWriters: 0,
    voteCount: 0,
    totalVoters: 0,
    scores: {},
    roundScores: {},
  },
  photoVote: {
    subType: 'pmatch',     // 'pmatch' | 'photoassoc'
    phase: 'waiting',      // 'waiting' | 'photo' | 'voting' | 'results' | 'ended'
    round: 0,
    totalRounds: 5,
    prompt: null,
    photos: [],            // [{playerId, playerName, photoData}]
    hasSubmittedPhoto: false,
    hasVoted: false,
    myVote: null,          // targetPlayerId
    photoSubmittedCount: 0,
    totalPhotographers: 0,
    voteCount: 0,
    totalVoters: 0,
    voteResults: [],       // [{playerId, playerName, photoData, voteCount, isWinner}]
    scores: {},
    roundScores: {},
  },
  dt: {
    phase: 'waiting',            // 'waiting'|'prompting'|'drawing'|'guessing'|'reveal'|'end'
    hasSubmittedPrompt: false,
    promptsSubmittedCount: 0,
    totalPrompts: 0,
    promptSecondsLeft: 60,
    guessSecondsLeft: 60,
    // Drawing turn (sent to you when it's your turn in a chain)
    currentTurn: null,           // { promptId, finalText, existingStrokes, position, totalPositions, secondsLeft }
    hasSubmittedTurn: false,
    // Drawing phase progress
    chainsCompletedCount: 0,
    totalChains: 0,
    chainProgress: {},           // { promptId: { stepsDone, totalSteps, drawerName } }
    // Guessing phase
    guessTurn: null,             // { promptId, finalStrokes, drawerCount }
    hasGuessed: false,
    guessedCount: 0,
    totalGuessers: 0,
    // Reveal phase
    reveal: {
      promptIndex: 0,
      totalPrompts: 0,
      step: 0,
      promptId: null,
      templateText: '',
      targetPlayerId: null,
      targetName: '',
      targetColor: '',
      authorPlayerId: null,
      authorName: '',
      finalText: '',
      drawingSteps: [],          // [{ playerId, playerName, playerColor, strokes, stepIndex }]
      guessText: '',
      votes: {},
      voteCount: 0,
      totalVoters: 0,
      voteSecondsLeft: 30,
      hasVoted: false,
      success: null,
      correctCount: 0,
      closeCount: 0,
      wrongCount: 0,
    },
    scores: {},
    leaderboard: [],
  },
};

export const gameReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LANG':
      localStorage.setItem('wst_lang', action.payload);
      return { ...state, lang: action.payload };
    case 'SAVED_SELFIE_STORED':
      try { localStorage.setItem('wst_saved_selfie', action.payload); } catch (_) {}
      return { ...state, savedSelfie: action.payload };
    case 'RESET_GAME':
      return initialState;
    case 'SET_PLAYER_ID':
      localStorage.setItem('wst_playerId', action.payload);
      return { ...state, playerId: action.payload };
    case 'SET_ROOM':
      return {
        ...state,
        ...action.payload,
        gameName: action.payload.gameName !== undefined ? action.payload.gameName : state.gameName,
        mlt: action.payload.mlt ? { ...state.mlt, ...action.payload.mlt } : state.mlt,
        roomConfig: action.payload.roomConfig ? { ...state.roomConfig, ...action.payload.roomConfig } : state.roomConfig,
        globalScores: action.payload.globalScores || state.globalScores,
        globalLeaderboard: action.payload.globalLeaderboard || state.globalLeaderboard,
      };
    case 'UPDATE_PLAYERS':
      return { ...state, players: action.payload };
    case 'UPDATE_PLAYER_CONNECTION': {
      const { playerId, isConnected } = action.payload;
      return {
        ...state,
        players: state.players.map(p => p.id === playerId ? { ...p, isConnected } : p),
      };
    }
    case 'UPDATE_CUSTOM_QUESTIONS':
      return { ...state, customQuestions: action.payload };
    case 'SET_PHASE':
      return { ...state, phase: action.payload };
    case 'SET_OPTIONS':
      return {
        ...state,
        mode: action.payload.mode,
        totalRounds: action.payload.totalRounds,
        customQuestions: action.payload.customQuestions || state.customQuestions,
        gameType: action.payload.gameType !== undefined ? action.payload.gameType : state.gameType,
        selectedSubGames: action.payload.selectedSubGames !== undefined ? action.payload.selectedSubGames : state.selectedSubGames,
        mlt: {
          ...state.mlt,
          totalRounds: action.payload.mltTotalRounds !== undefined ? action.payload.mltTotalRounds : state.mlt.totalRounds,
          allowSelfVote: action.payload.mltAllowSelfVote !== undefined ? action.payload.mltAllowSelfVote : state.mlt.allowSelfVote,
        },
      };
    case 'SET_GAME_STARTED':
      return { ...state, phase: 'question', currentRound: action.payload.round, totalRounds: action.payload.totalRounds };
    case 'SET_QUESTION':
      return {
        ...state,
        phase: 'question',
        currentQuestion: action.payload.question,
        currentRound: action.payload.round,
        totalRounds: action.payload.totalRounds,
        currentRoundType: action.payload.roundType || 'wst',
        situationalTarget: action.payload.target || null,
        hasAnswered: false,
        myAnswer: null,
        myAnswerIndex: null,
        answeredCount: 0,
        votedCount: 0,
        answers: [],
      };
    case 'SET_ANSWERED_COUNT':
      return { ...state, answeredCount: action.payload.answeredCount, totalPlayers: action.payload.totalPlayers };
    case 'SET_VOTE_COUNT':
      return { ...state, votedCount: action.payload.votedCount, totalPlayers: action.payload.totalPlayers };
    case 'SET_ANSWERS':
      return { ...state, phase: 'voting', answers: action.payload.answers, currentAnswerIndex: action.payload.currentIndex, hasVoted: false, votedCount: 0, allVotesIn: false, myAnswerIndex: null };
    case 'MARK_ANSWERED':
      return { ...state, hasAnswered: true, myAnswer: action.payload?.myAnswer || null };
    case 'SET_MY_ANSWER_INDEX':
      return { ...state, myAnswerIndex: action.payload.index };
    case 'MARK_VOTED':
      return { ...state, hasVoted: true };
    case 'ALL_VOTES_IN':
      return { ...state, allVotesIn: true };
    case 'REVEAL_ANSWER': {
      const ObjectWithNewAnswers = [...state.answers];
      ObjectWithNewAnswers[action.payload.currentIndex] = action.payload.answer;
      return { ...state, answers: ObjectWithNewAnswers, allVotesIn: false, scores: action.payload.scores || state.scores };
    }
    case 'START_NEXT_ANSWER':
      return { ...state, currentAnswerIndex: action.payload.currentIndex, hasVoted: false, votedCount: 0, allVotesIn: false };
    case 'SET_ROUND_ENDED':
      return { ...state, phase: 'roundEnd', scores: action.payload.scores, players: action.payload.players, answers: action.payload.answers, stats: action.payload.stats };
    case 'SET_PLAYERS_READY':
      return { ...state, playersReady: { readyCount: action.payload.readyCount, totalPlayers: action.payload.totalPlayers } };
    // ─── Situational actions ─────────────────────────────────────────────────
    case 'SIT_VOTING_STARTED':
      return {
        ...state,
        phase: 'sit-voting',
        sit: {
          ...state.sit,
          phase: 'voting',
          question: action.payload.question,
          answers: action.payload.answers,
          totalVoters: action.payload.totalVoters,
          hasVoted: false,
          myVote: null,
          voteCount: 0,
          winners: [],
        },
      };
    case 'SIT_VOTE_RECEIVED':
      return {
        ...state,
        sit: { ...state.sit, voteCount: action.payload.voteCount, totalVoters: action.payload.totalVoters },
      };
    case 'SIT_MARK_VOTED':
      return {
        ...state,
        sit: { ...state.sit, hasVoted: true, myVote: action.payload.answerId },
      };
    case 'SIT_SET_RESULTS':
      return {
        ...state,
        sit: {
          ...state.sit,
          phase: 'results',
          answers: action.payload.answers,
          scores: action.payload.scores,
          scorePlayers: action.payload.players,
          winners: action.payload.winners,
        },
      };
    case 'SET_GAME_ENDED':
      return { ...state, gameEnded: true, phase: 'game_end', stats: action.payload.stats, players: action.payload.players || state.players, scores: action.payload.finalScores || state.scores };
    case 'GAME_SWITCHED':
      return {
        ...state,
        gameType: action.payload.gameType,
        players: action.payload.players || state.players,
        gameName: action.payload.gameName !== undefined ? action.payload.gameName : state.gameName,
        phase: 'lobby',
        hasAnswered: false,
        hasVoted: false,
        answers: [],
        currentQuestion: null,
        gameEnded: false,
        mlt:       { ...initialState.mlt,      totalRounds: state.mlt.totalRounds, allowSelfVote: state.mlt.allowSelfVote },
        draw:      { ...initialState.draw },
        fitb:      { ...initialState.fitb },
        selfie:    { ...initialState.selfie },
        caption:   { ...initialState.caption },
        photoVote: { ...initialState.photoVote },
        sit:       { ...initialState.sit },
        tot:       { ...initialState.tot },
        dt:        { ...initialState.dt },
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    // ─── This or That actions ────────────────────────────────────────────────
    case 'SET_TOT_QUESTION':
      return {
        ...state,
        phase: 'tot',
        currentRound: action.payload.round,
        totalRounds: action.payload.totalRounds,
        currentRoundType: 'this-or-that',
        tot: {
          ...state.tot,
          question: action.payload.question,
          a: action.payload.a || '',
          b: action.payload.b || '',
          round: action.payload.round,
          totalRounds: action.payload.totalRounds,
          hasVoted: false,
          myChoice: null,
          countA: 0,
          countB: 0,
          pctA: 0,
          pctB: 0,
          voteCount: 0,
          totalVoters: 0,
          resultsVisible: false,
          majorityChoice: null,
          voteDetails: [],
          votedPlayerIds: [],
          secondsLeft: action.payload.secondsLeft ?? action.payload.timeLimit ?? 30,
          timeLimit: action.payload.timeLimit ?? 30,
          paused: false,
        },
      };
    case 'TOT_VOTE_RECEIVED':
      return {
        ...state,
        tot: {
          ...state.tot,
          voteCount: action.payload.voteCount,
          totalVoters: action.payload.totalVoters,
          votedPlayerIds: action.payload.votedPlayerIds || state.tot.votedPlayerIds,
        },
      };
    case 'TOT_MARK_VOTED':
      return {
        ...state,
        tot: { ...state.tot, hasVoted: true, myChoice: action.payload.choice },
      };
    case 'TOT_SET_RESULTS':
      return {
        ...state,
        tot: {
          ...state.tot,
          countA: action.payload.countA,
          countB: action.payload.countB,
          pctA: action.payload.pctA,
          pctB: action.payload.pctB,
          majorityChoice: action.payload.majorityChoice,
          voteDetails: action.payload.voteDetails || [],
          prevScores: { ...state.tot.scores },
          scores: action.payload.scores || state.tot.scores,
          scorePlayers: action.payload.players || state.tot.scorePlayers || [],
          resultsVisible: true,
        },
      };
    case 'TOT_SET_END':
      return {
        ...state,
        phase: 'totEnd',
        tot: { ...state.tot, leaderboard: action.payload.leaderboard, resultsVisible: true },
      };
    case 'TOT_SET_TIMER':
      return { ...state, tot: { ...state.tot, secondsLeft: action.payload.secondsLeft } };
    case 'TOT_SET_PAUSED':
      return { ...state, tot: { ...state.tot, paused: true, secondsLeft: action.payload?.secondsLeft ?? state.tot.secondsLeft } };
    case 'TOT_SET_RESUMED':
      return { ...state, tot: { ...state.tot, paused: false, secondsLeft: action.payload?.secondsLeft ?? state.tot.secondsLeft } };
    // ────────────────────────────────────────────────────────────────────────
    // ─── Most Likely To actions ──────────────────────────────────────────────
    case 'MLT_SET_PROMPT':
      return {
        ...state,
        phase: 'mlt',
        mlt: {
          ...state.mlt,
          prompt: action.payload.prompt,
          round: action.payload.round,
          totalRounds: action.payload.totalRounds,
          players: action.payload.players,
          roundState: 'voting',
          hasVoted: false,
          votedPlayerId: null,
          voteCount: 0,
          totalVoters: action.payload.players.length,
          secondsLeft: 30,
          results: [],
          majorityPlayerIds: [],
          jokerActive: false,
          jokersLeft: action.payload.jokersLeft !== undefined ? action.payload.jokersLeft : state.mlt.jokersLeft,
          paused: false,
          gameName: action.payload.gameName !== undefined ? action.payload.gameName : state.mlt.gameName,
        },
      };
    case 'MLT_QUESTION_CHANGED':
      return {
        ...state,
        mlt: {
          ...state.mlt,
          prompt: action.payload.currentPrompt,
        },
      };
    case 'MLT_SET_TIMER':
      return { ...state, mlt: { ...state.mlt, secondsLeft: action.payload.secondsLeft } };
    case 'MLT_VOTE_RECEIVED':
      return { ...state, mlt: { ...state.mlt, voteCount: action.payload.voteCount, totalVoters: action.payload.totalVoters } };
    case 'MLT_MARK_VOTED':
      return { ...state, mlt: { ...state.mlt, hasVoted: true, votedPlayerId: action.payload.votedPlayerId } };
    case 'MLT_SET_RESULTS':
      return {
        ...state,
        mlt: {
          ...state.mlt,
          results: action.payload.results,
          majorityPlayerIds: action.payload.majorityPlayerIds || [],
          jokersUsed: action.payload.jokersUsed || [],
          roundState: 'results',
          prevScores: { ...state.mlt.scores },
          scores: action.payload.scores || state.mlt.scores,
          scorePlayers: action.payload.players || state.mlt.scorePlayers || [],
        },
      };
    case 'MLT_JOKER_STATE':
      return {
        ...state,
        mlt: { ...state.mlt, jokerActive: action.payload.jokerActive, jokersLeft: action.payload.jokersLeft },
      };
    case 'MLT_SET_PAUSED':
      return { ...state, mlt: { ...state.mlt, paused: true } };
    case 'MLT_SET_RESUMED':
      return { ...state, mlt: { ...state.mlt, paused: false, secondsLeft: action.payload.secondsLeft } };
    case 'MLT_SET_END':
      return {
        ...state,
        phase: 'mltEnd',
        mlt: { ...state.mlt, leaderboard: action.payload.leaderboard, roundState: 'end' },
      };
    case 'MLT_RESTARTED':
      return {
        ...state,
        phase: 'lobby',
        gameName: action.payload.gameName !== undefined ? action.payload.gameName : state.gameName,
        players: action.payload.players || state.players,
        gameType: action.payload.gameType || state.gameType,
        mlt: {
          ...initialState.mlt,
          totalRounds: state.mlt.totalRounds,
          allowSelfVote: state.mlt.allowSelfVote,
          gameName: action.payload.gameName !== undefined ? action.payload.gameName : state.mlt.gameName,
        },
      };
    // ─── Fill-in-the-Blank actions ───────────────────────────────────────────
    case 'FITB_ROUND_START':
      return {
        ...state,
        phase: 'fitb',
        phaseTimer: { secondsLeft: 0, active: false, paused: false },
        fitb: {
          ...state.fitb,
          phase: 'answering',
          question: action.payload.question,
          round: action.payload.round,
          totalRounds: action.payload.totalRounds,
          players: action.payload.players || state.fitb.players,
          answers: [],
          hasAnswered: false,
          hasVoted: false,
          myAnswer: null,
          myAnswerIndex: -1,
          myVote: null,
          answeredCount: 0,
          totalAnswerers: (action.payload.players || state.fitb.players).length,
          voteCount: 0,
          totalVoters: 0,
          answerTimeLeft: action.payload.timeLimit ?? state.fitb.timeLimit ?? 30,
          timeLimit: action.payload.timeLimit ?? state.fitb.timeLimit ?? 30,
        },
      };
    case 'FITB_ANSWER_RECEIVED':
      return {
        ...state,
        fitb: { ...state.fitb, answeredCount: action.payload.answeredCount, totalAnswerers: action.payload.totalPlayers },
      };
    case 'FITB_ANSWER_TIMER':
      return {
        ...state,
        fitb: { ...state.fitb, answerTimeLeft: action.payload.secondsLeft },
      };
    case 'FITB_MARK_ANSWERED':
      return {
        ...state,
        fitb: { ...state.fitb, hasAnswered: true, myAnswer: action.payload.myAnswer },
      };
    case 'FITB_VOTING_STARTED':
      return {
        ...state,
        fitb: {
          ...state.fitb,
          phase: 'voting',
          answers: action.payload.answers,
          question: action.payload.question || state.fitb.question,
          totalVoters: action.payload.totalVoters,
          hasVoted: false,
          myVote: null,
          voteCount: 0,
          myAnswerIndex: action.payload.myAnswerIndex ?? -1,
        },
      };
    case 'FITB_VOTE_RECEIVED':
      return {
        ...state,
        fitb: { ...state.fitb, voteCount: action.payload.voteCount, totalVoters: action.payload.totalVoters },
      };
    case 'FITB_MARK_VOTED':
      return {
        ...state,
        fitb: { ...state.fitb, hasVoted: true, myVote: action.payload.answerId },
      };
    case 'FITB_RESULTS':
      return {
        ...state,
        fitb: {
          ...state.fitb,
          phase: 'results',
          answers: action.payload.answers,
          scores: action.payload.scores || {},
          leaderboard: action.payload.leaderboard || [],
          question: action.payload.question || state.fitb.question,
        },
      };
    case 'FITB_END':
      return {
        ...state,
        phase: 'fitbEnd',
        fitb: { ...state.fitb, phase: 'end', leaderboard: action.payload.leaderboard },
      };
    case 'FITB_RESTARTED':
      return {
        ...state,
        phase: 'lobby',
        players: action.payload.players || state.players,
        fitb: { ...initialState.fitb },
      };
    // ─── Selfie Roast actions ────────────────────────────────────────────────
    case 'SELFIE_PHOTO_PHASE':
      return {
        ...state,
        phase: 'selfie',
        selfie: {
          ...state.selfie,
          phase: 'photo',
          players: action.payload.players || [],
          hasSubmittedPhoto: false,
          photoCount: 0,
          totalPhotographers: (action.payload.players || []).length,
          hasSubmittedDrawing: false,
          hasVoted: false,
          myVote: null,
          assignedPhotoData: null,
          assignedOwnerName: null,
          assignedOwnerColor: null,
          assignedOwnerPlayerId: null,
          assignedPrompt: null,
          promptTemplate: null,
          submissions: [],
        },
      };
    case 'SELFIE_PHOTO_RECEIVED':
      return {
        ...state,
        selfie: { ...state.selfie, photoCount: action.payload.photoCount, totalPhotographers: action.payload.totalPlayers },
      };
    case 'SELFIE_MARK_PHOTO_SUBMITTED':
      return {
        ...state,
        selfie: { ...state.selfie, hasSubmittedPhoto: true },
      };
    case 'SELFIE_DRAW_ASSIGNED':
      return {
        ...state,
        selfie: {
          ...state.selfie,
          phase: 'drawing',
          assignedPhotoData: action.payload.photoData,
          assignedOwnerName: action.payload.ownerName,
          assignedOwnerColor: action.payload.ownerColor,
          assignedOwnerPlayerId: action.payload.ownerPlayerId,
          assignedPrompt: action.payload.prompt || null,
          promptTemplate: action.payload.promptTemplate || null,
        },
      };
    case 'SELFIE_DRAWING_PHASE':
      return {
        ...state,
        selfie: {
          ...state.selfie,
          phase: 'drawing',
          drawingCount: 0,
          totalDrawers: action.payload.totalDrawers || state.selfie.totalPhotographers,
          promptTemplate: action.payload.promptTemplate || state.selfie.promptTemplate,
          timeLimit: action.payload.timeLimit || 90,
          secondsLeft: action.payload.secondsLeft ?? action.payload.timeLimit ?? 90,
          hasSubmittedDrawing: false,
        },
      };
    case 'SELFIE_DRAW_TIMER':
      return {
        ...state,
        selfie: { ...state.selfie, secondsLeft: action.payload.secondsLeft },
      };
    case 'SELFIE_DRAWING_RECEIVED':
      return {
        ...state,
        selfie: { ...state.selfie, drawingCount: action.payload.drawingCount, totalDrawers: action.payload.totalDrawers },
      };
    case 'SELFIE_MARK_DRAWING_SUBMITTED':
      return {
        ...state,
        selfie: { ...state.selfie, hasSubmittedDrawing: true },
      };
    case 'SELFIE_UPDATE_PROMPT': {
      const updatedSelfie = {
        ...state.selfie,
        assignedPrompt: action.payload.prompt,
        promptTemplate: action.payload.promptTemplate || action.payload.prompt || state.selfie.promptTemplate,
        hasSubmittedDrawing: false,
      };
      if (updatedSelfie.currentTurn) {
        updatedSelfie.currentTurn = { ...updatedSelfie.currentTurn, prompt: action.payload.prompt };
      }
      if (updatedSelfie.turn) {
        updatedSelfie.turn = { ...updatedSelfie.turn, prompt: action.payload.prompt };
      }
      return {
        ...state,
        selfie: updatedSelfie,
      };
    }
    case 'SELFIE_RETAKE_READY':
      // Player requested a retake — reset photo-submitted flag so they can capture again
      return {
        ...state,
        selfie: { ...state.selfie, hasSubmittedPhoto: false },
      };
    case 'SELFIE_VOTING_STARTED':
      return {
        ...state,
        selfie: {
          ...state.selfie,
          phase: 'voting',
          submissions: action.payload.submissions,
          totalVoters: action.payload.totalVoters,
          hasVoted: false,
          myVote: null,
          voteCount: 0,
        },
      };
    case 'SELFIE_VOTE_RECEIVED':
      return {
        ...state,
        selfie: { ...state.selfie, voteCount: action.payload.voteCount, totalVoters: action.payload.totalVoters },
      };
    case 'SELFIE_MARK_VOTED':
      return {
        ...state,
        selfie: { ...state.selfie, hasVoted: true, myVote: action.payload.drawerId },
      };
    case 'SELFIE_RESULTS':
      return {
        ...state,
        phase: 'selfieEnd',
        selfie: {
          ...state.selfie,
          phase: 'results',
          submissions: action.payload.submissions,
          scores: action.payload.scores || {},
          leaderboard: action.payload.leaderboard || [],
          promptTemplate: action.payload.promptTemplate || state.selfie.promptTemplate,
        },
      };
    case 'SELFIE_RESTARTED':
      return {
        ...state,
        phase: 'lobby',
        players: action.payload.players || state.players,
        selfie: { ...initialState.selfie },
      };
    // ────────────────────────────────────────────────────────────────────────
    // ─── Drawing (Sketch It!) actions ───────────────────────────────────────
    case 'DRAW_SET_ROUND':
      return {
        ...state,
        phase: 'drawing',
        phaseTimer: { secondsLeft: 0, active: false, paused: false },
        draw: {
          ...state.draw,
          phase: 'drawing',
          mode: action.payload.mode || 'classic',
          round: action.payload.round,
          totalRounds: action.payload.totalRounds,
          word: action.payload.word || null,
          yourWord: action.payload.word || null,
          skipsUsed: 0,
          maxSkips: 2,
          timeLimit: action.payload.timeLimit,
          secondsLeft: action.payload.timeLimit,
          players: action.payload.players || state.draw.players,
          submissions: [],
          results: [],
          submittedCount: 0,
          submittedPlayerIds: [],
          hasSubmitted: false,
          hasVoted: false,
          votedForPlayerId: null,
          voteCount: 0,
          totalVoters: (action.payload.players || state.draw.players).length,
          wordResult: null,
        },
      };
    case 'DRAW_SECRET_WORD':
      return {
        ...state,
        draw: {
          ...state.draw,
          word: action.payload.word,
          yourWord: action.payload.word,
          // If skipped in secret mode, reset submission flag
          hasSubmitted: action.payload.skipped ? false : state.draw.hasSubmitted,
          skipsUsed: action.payload.skipped ? state.draw.skipsUsed + 1 : state.draw.skipsUsed,
        },
      };
    case 'DRAW_WORD_CHANGED':
      return {
        ...state,
        draw: {
          ...state.draw,
          word: action.payload.word,
          yourWord: action.payload.word,
          hasSubmitted: false,
          skipsUsed: action.payload.skipsUsed || state.draw.skipsUsed + 1,
          maxSkips: action.payload.maxSkips || state.draw.maxSkips,
        },
      };
    case 'DRAW_TIMER':
      return { ...state, draw: { ...state.draw, secondsLeft: action.payload.secondsLeft } };
    case 'DRAW_SUBMISSION_RECEIVED':
      return { ...state, draw: { ...state.draw, submittedCount: action.payload.submittedCount, totalDrawers: action.payload.totalDrawers, submittedPlayerIds: action.payload.submittedPlayerIds } };
    case 'DRAW_MARK_SUBMITTED':
      return { ...state, draw: { ...state.draw, hasSubmitted: true } };
    case 'DRAW_VOTING_STARTED':
      return {
        ...state,
        draw: {
          ...state.draw,
          phase: 'voting',
          submissions: action.payload.submissions,
          wordResult: action.payload.word,
          mode: action.payload.mode || state.draw.mode,
          totalVoters: action.payload.totalVoters || state.draw.players.length,
          votes: {},
          voteCount: 0,
        },
      };
    case 'DRAW_VOTE_RECEIVED':
      return { ...state, draw: { ...state.draw, voteCount: action.payload.voteCount, totalVoters: action.payload.totalVoters } };
    case 'DRAW_MARK_VOTED':
      return { ...state, draw: { ...state.draw, hasVoted: true, votedForPlayerId: action.payload.votedForPlayerId } };
    case 'DRAW_SET_RESULTS':
      return {
        ...state,
        draw: {
          ...state.draw,
          phase: 'results',
          results: action.payload.results,
          scores: action.payload.scores,
          roundScores: action.payload.roundScores,
          leaderboard: action.payload.leaderboard,
          wordResult: action.payload.word,
        },
      };
    case 'DRAW_SET_END':
      return {
        ...state,
        phase: 'drawEnd',
        draw: { ...state.draw, phase: 'end', leaderboard: action.payload.leaderboard },
      };
    case 'DRAW_RESTARTED':
      return {
        ...state,
        phase: 'lobby',
        players: action.payload.players || state.players,
        draw: { ...initialState.draw },
      };
    case 'GLOBAL_SCORES_UPDATED':
      return {
        ...state,
        globalScores: action.payload.globalScores || {},
        globalLeaderboard: action.payload.leaderboard || [],
      };
    case 'PHASE_TIMER_TICK':
      return {
        ...state,
        phaseTimer: {
          secondsLeft: action.payload.secondsLeft,
          active: action.payload.secondsLeft > 0,
          paused: !!action.payload.paused,
        },
      };
    case 'PHASE_TIMER_STOP':
      return { ...state, phaseTimer: { secondsLeft: 0, active: false } };
    case 'CLEAR_SESSION':
      // Wipe stale session identifiers so the reconnect handler doesn't
      // auto-rejoin a room from a previous game.
      return { ...state, playerId: null, roomCode: null, playerName: null };
    case 'SET_ROOM_CONFIG':
      return { ...state, roomConfig: { ...state.roomConfig, ...action.payload } };
    // ─── Caption actions ─────────────────────────────────────────────────────
    case 'CAPTION_PHOTO_PHASE':
      return {
        ...state,
        phase: 'caption',
        caption: {
          ...initialState.caption,
          phase: 'photo',
          round: action.payload.round,
          totalRounds: action.payload.totalRounds,
          totalPhotographers: (action.payload.players || []).length,
        },
      };
    case 'CAPTION_PHOTO_SUBMITTED':
      return {
        ...state,
        caption: {
          ...state.caption,
          photoSubmittedCount: action.payload.submittedCount,
        },
      };
    case 'CAPTION_MARK_PHOTO_SUBMITTED':
      return { ...state, caption: { ...state.caption, hasSubmittedPhoto: true } };
    case 'CAPTION_WRITING_PHASE':
      return {
        ...state,
        caption: {
          ...state.caption,
          phase: 'writing',
          round: action.payload.round,
          prompt: action.payload.prompt,
          featuredOwnerId: action.payload.featuredOwnerId,
          featuredOwnerName: action.payload.featuredOwnerName,
          featuredPhotoData: action.payload.featuredPhotoData,
          writers: action.payload.writers || [],
          totalWriters: (action.payload.writers || []).length,
          captionSubmittedCount: 0,
          captionSubmittedPlayerIds: [],
          hasWrittenCaption: false,
        },
      };
    case 'CAPTION_CAPTION_SUBMITTED': {
      const prevIds = state.caption.captionSubmittedPlayerIds || [];
      const newIds = action.payload.playerId && !prevIds.includes(action.payload.playerId)
        ? [...prevIds, action.payload.playerId]
        : prevIds;
      return {
        ...state,
        caption: {
          ...state.caption,
          captionSubmittedCount: action.payload.submittedCount,
          captionSubmittedPlayerIds: newIds,
        },
      };
    }
    case 'CAPTION_MARK_CAPTION_WRITTEN':
      return { ...state, caption: { ...state.caption, hasWrittenCaption: true } };
    case 'CAPTION_VOTING_PHASE':
      return {
        ...state,
        caption: {
          ...state.caption,
          phase: 'voting',
          captions: action.payload.captions,
          featuredPhotoData: action.payload.featuredPhotoData,
          featuredOwnerName: action.payload.featuredOwnerName,
          featuredOwnerId: action.payload.featuredOwnerId,
          hasVoted: false,
          myVote: null,
          myOwnCaptionId: null,
          voteCount: 0,
        },
      };
    case 'CAPTION_VOTE_RECEIVED':
      return { ...state, caption: { ...state.caption, voteCount: action.payload.voteCount, totalVoters: action.payload.totalVoters } };
    case 'CAPTION_SET_OWN_ID':
      return { ...state, caption: { ...state.caption, myOwnCaptionId: action.payload.captionId } };
    case 'CAPTION_MARK_VOTED':
      return { ...state, caption: { ...state.caption, hasVoted: true, myVote: action.payload.captionId } };
    case 'CAPTION_ROUND_RESULTS':
      return {
        ...state,
        caption: {
          ...state.caption,
          phase: 'results',
          round: action.payload.round,
          captionResults: action.payload.captionResults,
          roundScores: action.payload.roundScores,
          scores: action.payload.scores,
        },
      };
    case 'CAPTION_GAME_OVER':
      return {
        ...state,
        caption: { ...state.caption, phase: 'ended', scores: action.payload.scores },
      };
    case 'CAPTION_RESTARTED':
      return {
        ...state,
        phase: 'lobby',
        players: action.payload.players || state.players,
        caption: { ...initialState.caption },
      };
    // ─── PhotoVote actions ────────────────────────────────────────────────────
    case 'PHOTOVOTE_PHOTO_PHASE':
      return {
        ...state,
        phase: 'photovote',
        photoVote: {
          ...initialState.photoVote,
          subType: action.payload.subType || 'pmatch',
          phase: 'photo',
          round: action.payload.round,
          totalRounds: action.payload.totalRounds,
          totalPhotographers: (action.payload.players || []).length,
          hasSubmittedPhoto: false,
          photoSubmittedCount: 0,
          prompt: action.payload.prompt || null,
        },
      };
    case 'PHOTOVOTE_PHOTO_SUBMITTED':
      return {
        ...state,
        photoVote: {
          ...state.photoVote,
          photoSubmittedCount: action.payload.submittedCount,
        },
      };
    case 'PHOTOVOTE_MARK_PHOTO_SUBMITTED':
      return { ...state, photoVote: { ...state.photoVote, hasSubmittedPhoto: true } };
    case 'PHOTOVOTE_VOTING_PHASE':
      return {
        ...state,
        photoVote: {
          ...state.photoVote,
          phase: 'voting',
          round: action.payload.round,
          prompt: action.payload.prompt,
          photos: action.payload.photos || [],
          hasVoted: false,
          myVote: null,
          voteCount: 0,
        },
      };
    case 'PHOTOVOTE_VOTE_RECEIVED':
      return { ...state, photoVote: { ...state.photoVote, voteCount: action.payload.voteCount, totalVoters: action.payload.totalVoters } };
    case 'PHOTOVOTE_MARK_VOTED':
      return { ...state, photoVote: { ...state.photoVote, hasVoted: true, myVote: action.payload.targetPlayerId } };
    case 'PHOTOVOTE_ROUND_RESULTS':
      return {
        ...state,
        photoVote: {
          ...state.photoVote,
          phase: 'results',
          round: action.payload.round,
          voteResults: action.payload.voteResults,
          roundScores: action.payload.roundScores,
          scores: action.payload.scores,
        },
      };
    case 'PHOTOVOTE_GAME_OVER':
      return {
        ...state,
        photoVote: { ...state.photoVote, phase: 'ended', scores: action.payload.scores },
      };
    case 'PHOTOVOTE_RESTARTED':
      return {
        ...state,
        phase: 'lobby',
        players: action.payload.players || state.players,
        photoVote: { ...initialState.photoVote },
      };
    // ─── Draw Telephone actions ───────────────────────────────────────────────
    case 'DT_SELFIE_PHASE':
      return {
        ...state,
        phase: 'dt',
        dt: {
          ...initialState.dt,
          phase: 'selfie',
          selfiePhotoCount: action.payload.photoCount || 0,
          selfieTotalPhotographers: action.payload.totalPhotographers || 0,
        },
        selfie: {
          ...state.selfie,
          hasSubmittedPhoto: false,
          photoCount: action.payload.photoCount || 0,
          totalPhotographers: action.payload.totalPhotographers || 0,
        },
      };
    case 'DT_SELFIE_PHOTO_REUSED':
      return {
        ...state,
        selfie: { ...state.selfie, hasSubmittedPhoto: true },
      };
    case 'DT_PHOTO_RECEIVED':
      return {
        ...state,
        dt: {
          ...state.dt,
          selfiePhotoCount: action.payload.photoCount,
          selfieTotalPhotographers: action.payload.totalPhotographers,
        },
        selfie: { ...state.selfie, photoCount: action.payload.photoCount },
      };
    case 'DT_PROMPT_PHASE':
      return {
        ...state,
        phase: 'dt',
        dt: {
          ...initialState.dt,
          phase: 'prompting',
          totalPrompts: action.payload.totalPrompts,
          promptSecondsLeft: action.payload.secondsLeft || 60,
          hasSubmittedPrompt: false,
          promptsSubmittedCount: 0,
        },
      };
    case 'DT_PROMPT_RECEIVED':
      return {
        ...state,
        dt: {
          ...state.dt,
          promptsSubmittedCount: action.payload.submittedCount,
          totalPrompts: action.payload.totalPrompts,
        },
      };
    case 'DT_MARK_PROMPT_SUBMITTED':
      return {
        ...state,
        dt: {
          ...state.dt,
          hasSubmittedPrompt: true,
        },
      };
    case 'DT_DRAWING_PHASE':
      return {
        ...state,
        dt: {
          ...state.dt,
          phase: 'drawing',
          totalChains: action.payload.totalChains,
          chainsCompletedCount: 0,
          chainProgress: {},
          currentTurn: null,
          hasSubmittedTurn: false,
        },
      };
    case 'DT_YOUR_TURN':
      return {
        ...state,
        dt: {
          ...state.dt,
          phase: 'drawing',
          currentTurn: {
            promptId: action.payload.promptId,
            finalText: action.payload.finalText,
            existingStrokes: action.payload.existingStrokes || [],
            originalSelfieData: action.payload.originalSelfieData || null,
            position: action.payload.position,
            totalPositions: action.payload.totalPositions,
            secondsLeft: action.payload.secondsLeft,
          },
          hasSubmittedTurn: false,
        },
      };
    case 'DT_TURN_TIMER':
      return {
        ...state,
        dt: {
          ...state.dt,
          currentTurn: state.dt.currentTurn
            ? { ...state.dt.currentTurn, secondsLeft: action.payload.secondsLeft }
            : state.dt.currentTurn,
        },
      };
    case 'DT_MARK_TURN_SUBMITTED':
      return {
        ...state,
        dt: { ...state.dt, hasSubmittedTurn: true },
      };
    case 'DT_CHAIN_PROGRESS':
      return {
        ...state,
        dt: {
          ...state.dt,
          chainsCompletedCount: action.payload.chainsCompleted,
          totalChains: action.payload.totalChains,
        },
      };
    case 'DT_DRAWING_PROGRESS':
      return {
        ...state,
        dt: {
          ...state.dt,
          chainProgress: {
            ...state.dt.chainProgress,
            [action.payload.promptId]: {
              stepsDone: action.payload.stepsDone,
              totalSteps: action.payload.totalSteps,
              drawerName: action.payload.drawerName,
            },
          },
        },
      };
    case 'DT_GUESSING_PHASE':
      return {
        ...state,
        dt: {
          ...state.dt,
          phase: 'guessing',
          totalGuessers: action.payload.totalGuessers,
          guessSecondsLeft: action.payload.secondsLeft || 60,
          guessedCount: 0,
        },
      };
    case 'DT_YOUR_GUESS':
      return {
        ...state,
        dt: {
          ...state.dt,
          phase: 'guessing',
          guessSecondsLeft: action.payload.secondsLeft || 60,
          guessTurn: {
            promptId: action.payload.promptId,
            finalStrokes: action.payload.finalStrokes || [],
            originalSelfieData: action.payload.originalSelfieData || null,
            drawerCount: action.payload.drawerCount,
          },
          hasGuessed: false,
        },
      };
    case 'DT_MARK_GUESSED':
      return {
        ...state,
        dt: { ...state.dt, hasGuessed: true },
      };
    case 'DT_GUESS_RECEIVED':
      return {
        ...state,
        dt: {
          ...state.dt,
          guessedCount: action.payload.guessedCount,
          totalGuessers: action.payload.totalGuessers,
        },
      };
    case 'DT_REVEAL_PHASE':
      return {
        ...state,
        dt: {
          ...state.dt,
          phase: 'reveal',
          reveal: {
            ...initialState.dt.reveal,
            totalPrompts: action.payload.totalPrompts,
          },
        },
      };
    case 'DT_REVEAL_UPDATE':
      return {
        ...state,
        dt: {
          ...state.dt,
          phase: 'reveal',
          reveal: {
            ...state.dt.reveal,
            promptIndex: action.payload.promptIndex,
            totalPrompts: action.payload.totalPrompts,
            step: action.payload.step,
            promptId: action.payload.promptId,
            templateText: action.payload.templateText,
            targetPlayerId: action.payload.targetPlayerId,
            targetName: action.payload.targetName,
            targetColor: action.payload.targetColor || '#fff',
            originalSelfieData: action.payload.originalSelfieData || null,
            authorPlayerId: action.payload.authorPlayerId,
            authorName: action.payload.authorName,
            finalText: action.payload.finalText,
            drawingSteps: action.payload.drawingSteps || [],
            guessText: action.payload.guessText,
            votes: action.payload.votes || {},
            voteCount: action.payload.voteCount,
            totalVoters: action.payload.totalVoters,
            voteSecondsLeft: action.payload.voteSecondsLeft ?? state.dt.reveal.voteSecondsLeft,
            success: action.payload.success,
            correctCount: action.payload.correctCount || 0,
            closeCount: action.payload.closeCount || 0,
            wrongCount: action.payload.wrongCount || 0,
            hasVoted: action.payload.votes?.[state.playerId] !== undefined,
          },
        },
      };
    case 'DT_MARK_VOTED':
      return {
        ...state,
        dt: { ...state.dt, reveal: { ...state.dt.reveal, hasVoted: true } },
      };
    case 'DT_VOTE_RECEIVED':
      return {
        ...state,
        dt: {
          ...state.dt,
          reveal: {
            ...state.dt.reveal,
            voteCount: action.payload.voteCount,
            totalVoters: action.payload.totalVoters,
          },
        },
      };
    case 'DT_END':
      return {
        ...state,
        phase: 'dtEnd',
        dt: {
          ...state.dt,
          phase: 'end',
          scores: action.payload.scores || {},
          leaderboard: action.payload.leaderboard || [],
        },
      };
    case 'DT_RESTARTED':
      return {
        ...state,
        phase: 'lobby',
        players: action.payload.players || state.players,
        dt: { ...initialState.dt },
      };
    // ────────────────────────────────────────────────────────────────────────
    default:
      return state;
  }
};

const GameContext = createContext();

export const GameProvider = ({ children }) => {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => useContext(GameContext);
