/**
 * createGameSlice — factory for mini-game state slices in the global reducer.
 *
 * Standardises the boilerplate action types and reducer cases that every
 * mini-game needs: phase changes, round progression, timer ticks, vote
 * tracking, and results / end handling.
 *
 * Usage — define a slice:
 *   const mltSlice = createGameSlice('mlt', {
 *     totalRounds: 5,
 *     allowSelfVote: true,
 *     jokersLeft: 2,
 *     jokerActive: false,
 *   });
 *
 * Usage — wire into the reducer:
 *   const gameReducer = (state, action) => {
 *     const handler = mltSlice.handlers[action.type];
 *     if (handler) return handler(state, action);
 *     // … other cases
 *   };
 *
 * Usage — wire socket listeners (in useSocket / SocketHandler):
 *   socket.on('mlt:timer',         (data) => dispatch({ type: mltSlice.types.TIMER,         payload: data }));
 *   socket.on('mlt:vote_received', (data) => dispatch({ type: mltSlice.types.VOTE_RECEIVED, payload: data }));
 *   socket.on('mlt:results',       (data) => dispatch({ type: mltSlice.types.SET_RESULTS,   payload: data }));
 *   socket.on('mlt:end',           (data) => dispatch({ type: mltSlice.types.SET_END,        payload: data }));
 *
 * Every slice exposes:
 *   slice.types    — action type constants (string keys)
 *   slice.handlers — { [actionType]: (state, action) => newState }
 *   slice.defaults — the default sub-state object (useful for reset logic)
 */

/**
 * @param {string} gameKey       - e.g. 'mlt', 'tot', 'fitb'
 * @param {object} extraDefaults - Game-specific initial fields merged into defaults
 * @returns {{ types, handlers, defaults }}
 */
export function createGameSlice(gameKey, extraDefaults = {}) {
  const KEY = gameKey.toUpperCase();

  // ── Action type constants ──────────────────────────────────────────────────
  const types = {
    /** Server emitted {gameKey}:phase_changed */
    SET_PHASE:      `${KEY}_SET_PHASE`,
    /** Server emitted {gameKey}:round_start */
    SET_ROUND:      `${KEY}_SET_ROUND`,
    /** Server emitted {gameKey}:timer */
    TIMER:          `${KEY}_TIMER`,
    /** Server emitted {gameKey}:vote_received */
    VOTE_RECEIVED:  `${KEY}_VOTE_RECEIVED`,
    /** Client dispatches after sending their own vote */
    MARK_VOTED:     `${KEY}_MARK_VOTED`,
    /** Server emitted {gameKey}:results */
    SET_RESULTS:    `${KEY}_SET_RESULTS`,
    /** Server emitted {gameKey}:end */
    SET_END:        `${KEY}_SET_END`,
    /** Reset game sub-state (e.g. on game restart) */
    RESET:          `${KEY}_RESET`,
  };

  // ── Default sub-state ──────────────────────────────────────────────────────
  const defaults = {
    phase: 'waiting',
    round: 0,
    totalRounds: 5,
    prompt: null,
    players: [],
    scores: {},
    prevScores: {},
    scorePlayers: [],
    secondsLeft: 0,
    paused: false,
    hasVoted: false,
    myVote: null,
    voteCount: 0,
    totalVoters: 0,
    votedPlayerIds: [],
    ...extraDefaults,
  };

  // ── Reducer helpers ────────────────────────────────────────────────────────
  const updateSlice = (state, patch) => ({
    ...state,
    [gameKey]: { ...state[gameKey], ...patch },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlers = {
    [types.SET_PHASE]: (state, action) =>
      updateSlice(state, { phase: action.payload.phase }),

    [types.SET_ROUND]: (state, action) =>
      updateSlice(state, {
        ...action.payload,
        hasVoted: false,
        myVote: null,
        voteCount: 0,
        totalVoters: action.payload.totalVoters ?? state[gameKey].totalVoters,
        votedPlayerIds: [],
      }),

    [types.TIMER]: (state, action) =>
      updateSlice(state, {
        secondsLeft: action.payload.secondsLeft,
        paused: action.payload.paused ?? false,
      }),

    [types.VOTE_RECEIVED]: (state, action) =>
      updateSlice(state, {
        voteCount:      action.payload.voteCount,
        totalVoters:    action.payload.totalVoters,
        votedPlayerIds: action.payload.votedPlayerIds ?? state[gameKey].votedPlayerIds,
      }),

    [types.MARK_VOTED]: (state, action) =>
      updateSlice(state, {
        hasVoted: true,
        myVote:   action.payload.votedId ?? action.payload.votedPlayerId ?? null,
      }),

    [types.SET_RESULTS]: (state, action) =>
      updateSlice(state, { ...action.payload, phase: 'results' }),

    [types.SET_END]: (state, action) =>
      updateSlice(state, { ...action.payload, phase: 'ended' }),

    [types.RESET]: (state) =>
      updateSlice(state, { ...defaults }),
  };

  return { types, handlers, defaults };
}
