/**
 * PhaseManager — unified phase transition API.
 *
 * Every mini-game moves through an ordered list of named phases.
 * This standardises how phases advance, resets, and are queried so that
 * individual game files don't need to track phase index bookkeeping.
 *
 * Usage:
 *   const pm = createPhaseManager({
 *     phases: ['voting', 'results'],
 *     onPhaseChange: (prev, next) => { room.mlt.phase = next; }
 *   });
 *   pm.current();  // 'voting'
 *   pm.advance();  // moves to 'results', fires onPhaseChange
 *   pm.isPhase('results'); // true
 */

/**
 * @param {object}   opts
 * @param {string[]} opts.phases          - Ordered list of phase names (non-empty)
 * @param {Function} [opts.onPhaseChange] - (prev: string, next: string) => void
 *
 * @returns {{ current, advance, canAdvance, reset, isPhase }}
 */
function createPhaseManager({ phases, onPhaseChange }) {
  if (!phases || phases.length === 0) throw new Error('PhaseManager requires at least one phase');

  let currentIndex = 0;

  return {
    /** Returns the name of the current phase. */
    current() {
      return phases[currentIndex];
    },

    /**
     * Advance to the next phase.
     * Fires onPhaseChange(prev, next) before returning.
     * @returns {boolean} true if advanced, false if already at last phase
     */
    advance() {
      if (currentIndex >= phases.length - 1) return false;
      const prev = phases[currentIndex];
      currentIndex++;
      const next = phases[currentIndex];
      if (onPhaseChange) onPhaseChange(prev, next);
      return true;
    },

    /** Returns true if there is a next phase to advance to. */
    canAdvance() {
      return currentIndex < phases.length - 1;
    },

    /** Reset back to the first phase (does NOT fire onPhaseChange). */
    reset() {
      currentIndex = 0;
    },

    /** Returns true if the current phase matches phaseName. */
    isPhase(phaseName) {
      return phases[currentIndex] === phaseName;
    },

    /** Jump directly to a named phase (fires onPhaseChange if different). */
    goTo(phaseName) {
      const idx = phases.indexOf(phaseName);
      if (idx === -1) throw new Error(`Unknown phase: ${phaseName}`);
      if (idx === currentIndex) return;
      const prev = phases[currentIndex];
      currentIndex = idx;
      if (onPhaseChange) onPhaseChange(prev, phaseName);
    },
  };
}

module.exports = { createPhaseManager };
