/**
 * RoundManager — standardised round progression.
 *
 * Replaces the ad-hoc `room.*.round++` patterns scattered across game
 * handlers.  Owns the current-round counter, total-round boundary checks,
 * and fires lifecycle callbacks so callers don't repeat the same guard logic.
 *
 * Usage:
 *   const rm = createRoundManager({
 *     totalRounds: 5,
 *     onRoundStart: (round) => { room.mlt.round = round; sendPrompt(); },
 *     onGameEnd:    ()      => { sendMltEnd(io, room, code); }
 *   });
 *   rm.start();      // fires onRoundStart(1)
 *   rm.nextRound();  // fires onRoundStart(2) … onGameEnd() after round 5
 */

/**
 * @param {object}   opts
 * @param {number}   opts.totalRounds     - Total number of rounds (>= 1)
 * @param {Function} [opts.onRoundStart]  - (round: number) => void  Called on start() and nextRound()
 * @param {Function} [opts.onGameEnd]     - () => void               Called when nextRound() is called on the last round
 *
 * @returns {{ start, nextRound, getCurrent, getTotal, isLastRound, getProgress }}
 */
function createRoundManager({ totalRounds, onRoundStart, onGameEnd }) {
  if (!totalRounds || totalRounds < 1) throw new Error('RoundManager requires totalRounds >= 1');

  let currentRound = 0;

  return {
    /**
     * Begin the first round.
     * Safe to call multiple times — subsequent calls are no-ops if already started.
     */
    start() {
      if (currentRound > 0) return;
      currentRound = 1;
      if (onRoundStart) onRoundStart(currentRound);
    },

    /**
     * Advance to the next round.
     * If already on the last round, fires onGameEnd() and returns false.
     * @returns {boolean} true if a new round started, false if the game has ended
     */
    nextRound() {
      if (currentRound >= totalRounds) {
        if (onGameEnd) onGameEnd();
        return false;
      }
      currentRound++;
      if (onRoundStart) onRoundStart(currentRound);
      return true;
    },

    /** Returns the current round number (0 before start() is called). */
    getCurrent() { return currentRound; },

    /** Returns the total number of rounds. */
    getTotal() { return totalRounds; },

    /** Returns true if the current round is the final round. */
    isLastRound() { return currentRound === totalRounds; },

    /** Returns a "current/total" string, e.g. "3/5". */
    getProgress() { return `${currentRound}/${totalRounds}`; },

    /** Reset back to before start() (does NOT fire callbacks). */
    reset() { currentRound = 0; },
  };
}

module.exports = { createRoundManager };
