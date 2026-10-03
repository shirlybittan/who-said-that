// "Has everyone we're waiting for submitted?" — shared by SubmissionTracker
// and VoteCollector.
//
// Preferred: getExpectedIds() → ids of the players currently expected (see
// players.getActivePlayers). The phase is complete when every one of them has
// submitted, so a player who submitted and then left can't make the round
// advance before a still-connected player (AUDIT.md P2-02), and a player who
// leaves while pending no longer blocks it once recheck() runs (P2-01).
//
// Legacy: getExpectedCount() → compares the raw number of submissions.

function makeIsComplete({ getExpectedIds, getExpectedCount }) {
  if (typeof getExpectedIds === 'function') {
    return (store) => {
      const ids = getExpectedIds() || [];
      return ids.length > 0 && ids.every((id) => store.has(id));
    };
  }
  if (typeof getExpectedCount === 'function') {
    return (store) => store.size >= getExpectedCount();
  }
  throw new Error('threshold: getExpectedIds or getExpectedCount is required');
}

module.exports = { makeIsComplete };
