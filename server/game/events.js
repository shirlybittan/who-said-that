/**
 * events.js — Socket event name registry.
 *
 * Centralises the naming convention for all game socket events so that server
 * handlers and client listeners stay in sync without magic strings.
 *
 * Convention: {gameKey}:{action}
 *
 * Usage:
 *   const { EVENTS } = require('./events');
 *   io.to(code).emit(EVENTS.ROUND_START('mlt'), { ... });
 *   socket.on(EVENTS.VOTE('mlt'), handler);
 *
 * Standard lifecycle for voting games:
 *   round_start → timer → vote → vote_received → results → [next round] → end
 *
 * Games may emit additional game-specific events alongside these standard ones.
 */

const EVENTS = {
  // ── Server → Client ─────────────────────────────────────────────────────────

  /** Host starts a round; payload includes prompt/question and round metadata. */
  ROUND_START: (game) => `${game}:round_start`,

  /** Countdown tick; payload: { secondsLeft, paused }. */
  TIMER: (game) => `${game}:timer`,

  /** A vote was recorded; payload: { voteCount, totalVoters, votedPlayerIds }. */
  VOTE_RECEIVED: (game) => `${game}:vote_received`,

  /** Voting has closed; results payload with per-player scores and winner(s). */
  RESULTS: (game) => `${game}:results`,

  /** Game over; payload includes final leaderboard. */
  END: (game) => `${game}:end`,

  // ── Client → Server ─────────────────────────────────────────────────────────

  /** Player casts a vote; payload: { code, [targetId | choice] }. */
  VOTE: (game) => `${game}:vote`,

  /** Host advances to the next round. */
  NEXT_ROUND: (game) => `${game}:next_round`,

  /** Host skips the current round without scoring. */
  SKIP: (game) => `${game}:skip`,

  /** Host starts the game; payload: { code, rounds, ... }. */
  START: (game) => `${game}:start`,
};

/**
 * Game keys used across the codebase.
 * Centralised here so renaming a game key only requires one change.
 */
const GAME_KEYS = {
  WHO_SAID_THAT:   'wst',
  MOST_LIKELY_TO:  'mlt',
  THIS_OR_THAT:    'tot',
  SITUATIONAL:     'sit',
  FILL_IN_BLANK:   'fitb',
  DRAWING:         'draw',
  DRAW_TEL:        'dt',
  CAPTION:         'caption',
  SELFIE:          'selfie',
  PHOTO_VOTE:      'photoVote',
};

module.exports = { EVENTS, GAME_KEYS };
