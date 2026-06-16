/**
 * SubmissionTracker — shared submission counting and threshold detection.
 *
 * Replaces the manual dedup + threshold pattern that was reimplemented
 * independently for every mini-game:
 *   WST      — room.answers[]       find/push + .length >= activeCount
 *   FITB     — room.fitb.answers[]  find/push + .length >= activeCount
 *   Drawing  — room.draw.submissions{} Object.keys().length >= activeCount
 *   MLT      — room.mlt.votes{}    (vote-style, handled by VoteCollector)
 *
 * The tracker owns a Map<playerId, data> and exposes a stable API.
 * Callers sync their legacy room arrays from the onRecord / onUpdate callbacks
 * so existing read-side code continues to work without modification.
 */

/**
 * Creates a submission tracker.
 *
 * @param {object}   opts
 * @param {Function} opts.getExpectedCount  - () => number  Active player count at call-time
 * @param {Function} opts.onComplete        - () => void    Called once when threshold is crossed
 * @param {Function} [opts.onRecord]        - (playerId, data, isUpdate) => void  Side-effect hook
 *
 * @returns {{ record, update, has, get, getAll, getPlayerIds, count, isComplete, reset }}
 */
function create({ getExpectedCount, onComplete, onRecord }) {
  const store = new Map(); // playerId → data
  let completeFired = false;

  const checkComplete = () => {
    if (!completeFired && store.size >= getExpectedCount()) {
      completeFired = true;
      onComplete();
    }
  };

  return {
    /**
     * Record a submission for a player. If the player has already submitted,
     * this is a no-op (use update() to modify existing data).
     * Fires onComplete when the expected count is reached.
     *
     * @param {string} playerId
     * @param {*}      data
     * @returns {boolean} true if accepted, false if already had a submission
     */
    record(playerId, data) {
      if (store.has(playerId)) return false;
      store.set(playerId, data);
      if (onRecord) onRecord(playerId, data, false);
      checkComplete();
      return true;
    },

    /**
     * Update an existing submission. If no submission exists, this acts
     * like record().
     *
     * @param {string}   playerId
     * @param {Function} updater  - (existingData) => newData
     * @returns {boolean} true if the record existed and was updated
     */
    update(playerId, updater) {
      if (!store.has(playerId)) return false;
      const updated = updater(store.get(playerId));
      store.set(playerId, updated);
      if (onRecord) onRecord(playerId, updated, true);
      return true;
    },

    /**
     * Record or update — convenience method when the caller allows both.
     */
    recordOrUpdate(playerId, data, updater) {
      if (store.has(playerId)) {
        return this.update(playerId, updater || (() => data));
      }
      return this.record(playerId, data);
    },

    has(playerId)    { return store.has(playerId); },
    get(playerId)    { return store.get(playerId); },
    getAll()         { return [...store.values()]; },
    getPlayerIds()   { return [...store.keys()]; },
    count()          { return store.size; },
    isComplete()     { return store.size >= getExpectedCount(); },

    /**
     * Reset for a new round. onComplete can fire again after reset.
     */
    reset() {
      store.clear();
      completeFired = false;
    },
  };
}

module.exports = { create };
