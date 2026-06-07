/**
 * VoteCollector — shared vote deduplication and threshold detection.
 *
 * Replaces the structurally identical guard + threshold pattern that was
 * reimplemented for every voting event:
 *   sit:vote, draw:vote, fitb:vote, selfie:vote, caption:vote,
 *   photovote:vote, mlt:vote, tot:vote
 *
 * Every handler had the same three steps:
 *   1. if (votes[voterId]) return            — duplicate guard
 *   2. votes[voterId] = targetId             — record
 *   3. if (count >= expected) onComplete()   — threshold check
 *
 * VoteCollector owns a Map<voterId, targetId> and does all three.
 */

/**
 * Creates a vote collector for a single voting phase.
 *
 * @param {object}   opts
 * @param {Function} opts.getExpectedCount   - () => number  Expected voter count at call-time
 * @param {Function} opts.onComplete         - () => void    Called once when threshold is reached
 * @param {boolean}  [opts.allowSelfVote]    - default false — if false, castVote(id, id) returns false
 * @param {boolean}  [opts.allowAuthorVote]  - WST-specific: when true, the author IS allowed to
 *                                             cast a fake vote on their own answer. The vote is
 *                                             recorded with isAuthorFakeVote = true. Caller passes
 *                                             authorId to castVote.
 *
 * @returns {{ castVote, hasVoted, getVotes, getVoterIds, count, isComplete, reset }}
 */
function create({ getExpectedCount, onComplete, allowSelfVote = false, allowAuthorVote = false }) {
  const votes = new Map(); // voterId → { targetId, isAuthorFakeVote }
  let completeFired = false;

  const checkComplete = () => {
    if (!completeFired && votes.size >= getExpectedCount()) {
      completeFired = true;
      onComplete();
    }
  };

  return {
    /**
     * Cast a vote.
     *
     * @param {string} voterId
     * @param {string} targetId
     * @param {string} [authorId]  - For WST: the author of the answer being voted on.
     *                               If voterId === authorId and allowAuthorVote is true,
     *                               the vote is recorded as a fake author vote.
     *
     * @returns {boolean} true if accepted, false if rejected (duplicate, self-vote guard)
     */
    castVote(voterId, targetId, authorId) {
      if (votes.has(voterId)) return false;            // already voted

      const isSelfVote = voterId === targetId;
      const isAuthorFakeVote = authorId !== undefined && voterId === authorId;

      // Self-vote guard — skip if authorVote is the reason (handled separately below)
      if (isSelfVote && !allowSelfVote && !isAuthorFakeVote) return false;

      votes.set(voterId, { targetId, isAuthorFakeVote: isAuthorFakeVote || false });
      checkComplete();
      return true;
    },

    hasVoted(voterId) { return votes.has(voterId); },

    /**
     * Returns all votes as an array of { voterId, targetId, isAuthorFakeVote }.
     */
    getVotes() {
      return [...votes.entries()].map(([voterId, v]) => ({
        voterId,
        targetId: v.targetId,
        isAuthorFakeVote: v.isAuthorFakeVote,
      }));
    },

    /**
     * Returns the raw votes map as a plain object { voterId: targetId }.
     * Useful for games that only need the target mapping (MLT, ToT, Situational).
     */
    getVotesMap() {
      const obj = {};
      for (const [voterId, v] of votes) obj[voterId] = v.targetId;
      return obj;
    },

    getVoterIds()  { return [...votes.keys()]; },
    count()        { return votes.size; },
    isComplete()   { return votes.size >= getExpectedCount(); },

    /**
     * Reset for a new round/answer. onComplete can fire again after reset.
     */
    reset() {
      votes.clear();
      completeFired = false;
    },
  };
}

module.exports = { create };
