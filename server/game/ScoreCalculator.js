/**
 * ScoreCalculator — voting-based and submission-based score calculations.
 *
 * Centralises the "count votes → award points → find winner(s)" pattern that
 * is reimplemented for every voting game (Situational, FITB, Drawing, Caption …).
 *
 * This module is pure — it takes data and returns results with no side-effects,
 * making it straightforward to unit-test independently of socket / room state.
 */

/**
 * Calculate per-player scores from a votes map.
 *
 * Supports two common MLT-style scoring modes via config:
 *   - pointsPerVote:   each vote received = N points (classic)
 *   - majorityBonus:   players who voted for the majority winner get bonus points
 *
 * @param {object}   opts
 * @param {object}   opts.votes          - { [voterId]: targetId }
 * @param {Array}    opts.players        - [{ id, name, color, ... }]  Eligible players
 * @param {object}   [opts.config]
 * @param {number}   [opts.config.pointsPerVote=100]     - Points awarded per vote received
 * @param {boolean}  [opts.config.allowSelfVote=false]   - Whether to count self-votes
 *
 * @returns {{
 *   scores:     { [playerId]: number },
 *   voteCounts: { [playerId]: number },
 *   winners:    string[],   // player IDs tied for most votes
 *   maxVotes:   number
 * }}
 */
function calculateVotingScores({ votes, players, config = {} }) {
  const {
    pointsPerVote = 100,
    allowSelfVote = false,
  } = config;

  const scores = {};
  const voteCounts = {};

  players.forEach(p => {
    scores[p.id] = 0;
    voteCounts[p.id] = 0;
  });

  Object.entries(votes).forEach(([voterId, targetId]) => {
    if (!allowSelfVote && voterId === targetId) return;
    if (voteCounts[targetId] !== undefined) {
      voteCounts[targetId]++;
    }
  });

  Object.entries(voteCounts).forEach(([playerId, count]) => {
    scores[playerId] = count * pointsPerVote;
  });

  const maxVotes = players.length > 0
    ? Math.max(...Object.values(voteCounts))
    : 0;

  const winners = maxVotes > 0
    ? Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes)
    : [];

  return { scores, voteCounts, winners, maxVotes };
}

/**
 * Build a sorted leaderboard array from a scores map and players list.
 *
 * @param {object} scoresMap - { [playerId]: number }
 * @param {Array}  players   - [{ id, name, color, ... }]
 * @returns {Array} sorted descending by score: [{ id, name, color, score }, ...]
 */
function buildLeaderboard(scoresMap, players) {
  return players
    .map(p => ({ id: p.id, name: p.name, color: p.color, score: scoresMap[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Merge a round's scores into a cumulative scores object (mutates cumulativeScores).
 *
 * @param {object} cumulativeScores - { [playerId]: number }  (modified in place)
 * @param {object} roundScores      - { [playerId]: number }
 * @returns {object} the mutated cumulativeScores reference
 */
function mergeRoundScores(cumulativeScores, roundScores) {
  Object.entries(roundScores).forEach(([id, pts]) => {
    cumulativeScores[id] = (cumulativeScores[id] || 0) + pts;
  });
  return cumulativeScores;
}

module.exports = { calculateVotingScores, buildLeaderboard, mergeRoundScores };
