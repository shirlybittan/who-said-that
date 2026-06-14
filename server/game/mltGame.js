/**
 * mltGame.js — Most Likely To game controller.
 *
 * Built on VotingGameTemplate. Customises:
 *   - Prompt pool management (random shuffle, custom prompts)
 *   - Voter-side majority scoring: voters score if they picked the majority player
 *   - Joker mechanic: 2 jokers per player per game, doubles points when active
 *   - Win / total-vote tracking for title assignment
 *   - Title assignment at game end
 *   - pause / resume (delegated to TimerManager via room._timers.mlt)
 *
 * Usage in index.js:
 *   const { createMltGame } = require('./game/mltGame');
 *   const mltGame = createMltGame({ mergeToGlobalScores });
 *
 *   socket.on('mlt:start', (...) => { mltGame.start(io, room, code, config); });
 *   socket.on('mlt:vote',  (...) => { room.mlt._voteCollector?.castVote(...); });
 */

const { createVotingGame } = require('./templates/VotingGameTemplate');
const VoteCollector = require('./VoteCollector');

// Active players are connected, playing, and not mid-round joiners.
const getActivePlayers = (room) =>
  room.players.filter(p => p.isConnected && p.isPlaying && !p.joinedMidRound);

// ── Pure scoring helpers ──────────────────────────────────────────────────────

/**
 * Tally vote-counts and identify the majority player(s).
 * Side-effect: accumulates room.mlt.totalVotes.
 *
 * @returns {{ results, majorityPlayerIds }}
 */
function computeMltRoundResults(room) {
  const votablePlayers = getActivePlayers(room);
  const voteCounts = {};
  votablePlayers.forEach(p => { voteCounts[p.id] = 0; });

  Object.entries(room.mlt.votes || {}).forEach(([, targetId]) => {
    if (voteCounts[targetId] !== undefined) {
      voteCounts[targetId]++;
      room.mlt.totalVotes[targetId] = (room.mlt.totalVotes[targetId] || 0) + 1;
    }
  });

  const totalVotesCount = Object.keys(room.mlt.votes || {}).length;

  const results = votablePlayers.map(p => ({
    playerId: p.id,
    name:     p.name,
    color:    p.color,
    count:    voteCounts[p.id] || 0,
    pct:      totalVotesCount > 0
      ? Math.round((voteCounts[p.id] || 0) / totalVotesCount * 100)
      : 0,
  })).sort((a, b) => b.count - a.count);

  const maxVotes = results[0]?.count || 0;
  const majorityPlayerIds = maxVotes > 0
    ? results.filter(r => r.count === maxVotes).map(r => r.playerId)
    : [];

  return { results, majorityPlayerIds };
}

/**
 * Award voter-side scores and spend jokers.
 * Side-effect: mutates room.mlt.scores, room.mlt.wins, room.mlt.jokers.
 */
function applyMltScoring(room, majorityPlayerIds) {
  // Track wins for majority players
  majorityPlayerIds.forEach(id => {
    room.mlt.wins[id] = (room.mlt.wins[id] || 0) + 1;
  });

  // Award points to voters who picked the majority
  getActivePlayers(room).forEach(voter => {
    const votedFor = (room.mlt.votes || {})[voter.id];
    let points = majorityPlayerIds.includes(votedFor) ? 1 : 0;
    if (points > 0 && room.mlt.jokersThisRound[voter.id]) points *= 2;
    if (points > 0) {
      room.mlt.scores[voter.id] = (room.mlt.scores[voter.id] || 0) + points;
    }
  });

  // Spend jokers that were toggled on this round
  Object.keys(room.mlt.jokersThisRound).forEach(pid => {
    room.mlt.jokers[pid] = Math.max(0, (room.mlt.jokers[pid] ?? 2) - 1);
  });
}

/**
 * Assign personality titles to the final leaderboard (mutates in place).
 */
function assignMltTitles(leaderboard) {
  const titled = new Set();

  const tryAssign = (sorted, key, minVal, title) => {
    for (const entry of sorted) {
      if (!titled.has(entry.playerId) && entry[key] >= minVal) {
        entry.title = title;
        titled.add(entry.playerId);
        break;
      }
    }
  };

  tryAssign([...leaderboard].sort((a, b) => b.score - a.score),      'score',      1, '🔮 Top Predictor');
  tryAssign([...leaderboard].sort((a, b) => a.score - b.score),      'score',      0, '😬 Worst Predictor');
  tryAssign([...leaderboard].sort((a, b) => b.wins - a.wins),        'wins',       1, '👑 Fan Favorite');
  tryAssign([...leaderboard].sort((a, b) => b.totalVotes - a.totalVotes), 'totalVotes', 1, '🎯 Hot Topic');
  tryAssign([...leaderboard].sort((a, b) => a.totalVotes - b.totalVotes), 'totalVotes', 0, '🕵️ Under the Radar');

  leaderboard.forEach(p => { if (!p.title) p.title = '⚡ Dark Horse'; });
  return leaderboard;
}

// ── Game factory ──────────────────────────────────────────────────────────────

/**
 * Creates the MLT game controller. Call once at server startup.
 *
 * @param {object}   deps
 * @param {Function} deps.mergeToGlobalScores - (io, room, scores) => void
 * @returns {object} mltGame — the controller returned by createVotingGame
 */
function createMltGame({ mergeToGlobalScores }) {
  // Late binding: mltGame.startVoting is called inside onRoundStart callback.
  // By the time any callback fires (a socket event triggers it), the assignment
  // below has already completed, so the reference is safe.
  let mltGame;

  mltGame = createVotingGame({
    gameKey: 'mlt',
    votingSeconds: 30,
    getActivePlayers,
    // Prompt is stored as room.mlt.prompts[round - 1] by the mlt:start handler.
    getPrompt: (room, round) => room.mlt.prompts[round - 1],
    // VoteCollector: allow self-vote (MLT players can vote for themselves)
    scoreConfig: { allowSelfVote: true },

    // ── Round lifecycle ────────────────────────────────────────────────────
    onRoundStart(io, room, code, round) {
      room.mlt.roundState = 'voting';
      room.mlt.jokersThisRound = {};
      room.players.forEach(p => { p.joinedMidRound = false; });

      const players = getActivePlayers(room);

      io.to(code).emit('mlt:prompt', {
        prompt:      room.mlt.prompt,   // set by template before calling this
        round,
        totalRounds: room.mlt.totalRounds,
        players:     players.map(p => ({ id: p.id, name: p.name, color: p.color })),
        gameName:    room.gameName,
        // jokersLeft is only broadcast on round 1; subsequent updates come
        // via individual mlt:joker_state events when a joker is spent.
        ...(round === 1 ? { jokersLeft: 2 } : {}),
      });

      // Start countdown timer (emits mlt:timer ticks + mlt:voting_started).
      mltGame.startVoting(io, room, code);
    },

    // ── Custom results (voter-side majority scoring) ───────────────────────
    onResults(io, room, code) {
      room.mlt.roundState = 'results';

      const { results, majorityPlayerIds } = computeMltRoundResults(room);
      applyMltScoring(room, majorityPlayerIds);

      io.to(code).emit('mlt:results', {
        results,
        majorityPlayerIds,
        jokersUsed:  Object.keys(room.mlt.jokersThisRound),
        scores:      { ...room.mlt.scores },
        players:     getActivePlayers(room).map(p => ({ id: p.id, name: p.name, color: p.color })),
      });
    },

    // ── Game end ───────────────────────────────────────────────────────────
    onEnd(io, room, code) {
      room.mlt.roundState = 'end';
      room.phase = 'mltEnd';

      const connectedPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
      let leaderboard = connectedPlayers.map(p => ({
        playerId:   p.id,
        name:       p.name,
        color:      p.color,
        score:      room.mlt.scores[p.id] || 0,
        totalVotes: room.mlt.totalVotes[p.id] || 0,
        wins:       room.mlt.wins[p.id] || 0,
        title:      null,
      })).sort((a, b) => b.score - a.score);

      leaderboard = assignMltTitles(leaderboard);

      io.to(code).emit('mlt:end', { leaderboard });
      mergeToGlobalScores(io, room, room.mlt.scores);
    },
  });

  return mltGame;
}

module.exports = { createMltGame, assignMltTitles };
