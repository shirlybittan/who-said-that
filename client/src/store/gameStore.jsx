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
    myVote: null,
    answeredCount: 0,
    totalAnswerers: 0,
    voteCount: 0,
    totalVoters: 0,
    scores: {},
    leaderboard: [],
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
    submissions: [],       // [{drawerId, drawerName, drawerColor, ownerName, photoData, strokes, votes?}]
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
};

export const gameReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LANG':
      localStorage.setItem('wst_lang', action.payload);
      return { ...state, lang: action.payload };
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
      };
    case 'UPDATE_PLAYERS':
      return { ...state, players: action.payload };
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
        answeredCount: 0,
        votedCount: 0,
        answers: [],
      };
    case 'SET_ANSWERED_COUNT':
      return { ...state, answeredCount: action.payload.answeredCount, totalPlayers: action.payload.totalPlayers };
    case 'SET_VOTE_COUNT':
      return { ...state, votedCount: action.payload.votedCount, totalPlayers: action.payload.totalPlayers };
    case 'SET_ANSWERS':
      return { ...state, phase: 'voting', answers: action.payload.answers, currentAnswerIndex: action.payload.currentIndex, hasVoted: false, votedCount: 0, allVotesIn: false };
    case 'MARK_ANSWERED':
      return { ...state, hasAnswered: true, myAnswer: action.payload?.myAnswer || null };
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
        },
      };
    case 'TOT_VOTE_RECEIVED':
      return {
        ...state,
        tot: {
          ...state.tot,
          voteCount: action.payload.voteCount,
          totalVoters: action.payload.totalVoters,
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
          myVote: null,
          answeredCount: 0,
          totalAnswerers: (action.payload.players || state.fitb.players).length,
          voteCount: 0,
          totalVoters: 0,
        },
      };
    case 'FITB_ANSWER_RECEIVED':
      return {
        ...state,
        fitb: { ...state.fitb, answeredCount: action.payload.answeredCount, totalAnswerers: action.payload.totalPlayers },
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
        },
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
