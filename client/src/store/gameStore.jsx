import React, { createContext, useReducer, useContext } from 'react';

const initialState = {
  playerId: localStorage.getItem('wst_playerId') || null,
  playerName: localStorage.getItem('wst_playerName') || null,
  roomCode: localStorage.getItem('wst_roomCode') || null,
  isHost: false,
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
    case 'REVEAL_ANSWER':
      const newAnswers = [...state.answers];
      newAnswers[action.payload.currentIndex] = action.payload.answer;
      return { ...state, answers: newAnswers, allVotesIn: false, scores: action.payload.scores || state.scores };
    case 'START_NEXT_ANSWER':
      return { ...state, currentAnswerIndex: action.payload.currentIndex, hasVoted: false, votedCount: 0, allVotesIn: false };
    case 'SET_ROUND_ENDED':
      return { ...state, phase: 'roundEnd', scores: action.payload.scores, players: action.payload.players, answers: action.payload.answers, stats: action.payload.stats };
    case 'SET_PLAYERS_READY':
      return { ...state, playersReady: action.payload.readyPlayers };
    case 'SET_GAME_ENDED':
      return { ...state, gameEnded: true, phase: 'game_end', stats: action.payload.stats, players: action.payload.players || state.players };
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
