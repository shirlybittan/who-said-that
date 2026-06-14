/**
 * totGame.js — This or That game controller.
 *
 * Extracts the ToT helpers that previously lived in server/index.js:
 *   - startTotTimer    → totGame.startTimer
 *   - closeTotRound    → totGame.closeRound
 *   - assignTotTitles  → exported standalone
 *   - sendTotEnd       → totGame.sendEnd
 *
 * ToT differs from voting games that use VotingGameTemplate:
 *   - Players vote A or B (not for another player)
 *   - Two separate vote buckets (votesA / votesB)
 *   - Scoring: majority side players get +1; ties score nobody
 *   - RoundManager is not used here because ToT shares `room.currentRound`
 *     with the mixed-game outer loop; the handler in index.js owns round
 *     progression to keep the mixed-game flow intact.
 *
 * Usage in index.js:
 *   const { createTotGame, assignTotTitles } = require('./game/totGame');
 *   const totGame = createTotGame({ mergeToGlobalScores });
 *
 *   totGame.startTimer(io, room, code, seconds);
 *   totGame.closeRound(io, room, code);
 *   totGame.sendEnd(io, room, code);
 */

const TimerManager = require('./TimerManager');

/**
 * Assign personality titles to the ToT final leaderboard (mutates in place).
 *
 * @param {Array} leaderboard - [{ playerId, name, color, score }]
 * @returns {Array} the same array with .title added to each entry
 */
function assignTotTitles(leaderboard) {
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

  tryAssign([...leaderboard].sort((a, b) => b.score - a.score), 'score', 1, '🎯 Crowd Reader');
  tryAssign([...leaderboard].sort((a, b) => a.score - b.score), 'score', 0, '🤔 Lone Wolf');
  leaderboard.forEach(p => { if (!p.title) p.title = '⚡ Wildcard'; });
  return leaderboard;
}

/**
 * Creates the ToT game controller. Call once at server startup.
 *
 * @param {object}   deps
 * @param {Function} deps.mergeToGlobalScores - (io, room, scores) => void
 * @returns {object} totGame
 */
function createTotGame({ mergeToGlobalScores }) {
  const totGame = {
    /**
     * Start (or restart) the countdown timer for the current ToT round.
     *
     * @param {object} io
     * @param {object} room
     * @param {string} code
     * @param {number} seconds
     */
    startTimer(io, room, code, seconds) {
      room._timers = room._timers || {};
      if (room._timers.tot) room._timers.tot.cancel();
      room.tot.secondsLeft = seconds;
      room.tot.paused = false;
      room._timers.tot = TimerManager.create({
        io,
        code,
        seconds,
        tickEvent: 'tot:timer',
        isActive: () => room.phase === 'tot' && room.tot.roundState === 'voting',
        onTick:   (s) => { room.tot.secondsLeft = s; },
        onPause:  () => { room.tot.paused = true; },
        onResume: () => { room.tot.paused = false; },
        onExpire: () => totGame.closeRound(io, room, code),
      });
    },

    /**
     * Close the current voting round: tally votes, award points, emit tot:results.
     * Idempotent — guarded by roundState check.
     *
     * @param {object} io
     * @param {object} room
     * @param {string} code
     */
    closeRound(io, room, code) {
      if (room._timers?.tot) { room._timers.tot.cancel(); room._timers.tot = null; }
      if (room.tot.roundState === 'results') return; // guard against double-fire
      room.tot.roundState = 'results';

      const connectedPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
      const countA = Object.keys(room.tot.votesA || {}).length;
      const countB = Object.keys(room.tot.votesB || {}).length;
      const total  = countA + countB;

      const pctA = total === 0 ? 0 : Math.round((countA / total) * 100);
      const pctB = total === 0 ? 0 : 100 - pctA;

      const tieRound      = countA === countB;
      const majorityChoice = tieRound ? null : (countA > countB ? 'a' : 'b');

      if (!tieRound) {
        const winners = majorityChoice === 'a' ? room.tot.votesA : room.tot.votesB;
        Object.keys(winners).forEach(pid => {
          room.tot.scores[pid] = (room.tot.scores[pid] || 0) + 1;
        });
      }

      const voteDetails = connectedPlayers.map(p => ({
        playerId: p.id,
        name:     p.name,
        color:    p.color,
        choice:   room.tot.votesA[p.id] ? 'a' : room.tot.votesB[p.id] ? 'b' : null,
      }));

      io.to(code).emit('tot:results', {
        a:              room.tot.a,
        b:              room.tot.b,
        countA,
        countB,
        pctA,
        pctB,
        majorityChoice: tieRound ? null : majorityChoice,
        voteDetails,
        scores:         { ...room.tot.scores },
        players:        connectedPlayers.map(p => ({ id: p.id, name: p.name, color: p.color })),
        round:          room.currentRound,
        totalRounds:    room.totalRounds,
      });
    },

    /**
     * End the standalone This-or-That game (gameType === 'this-or-that').
     * For mixed-game endings, the outer loop handles game_ended directly.
     *
     * @param {object} io
     * @param {object} room
     * @param {string} code
     */
    sendEnd(io, room, code) {
      const connectedPlayers = room.players.filter(p => p.isConnected && p.isPlaying);
      let leaderboard = connectedPlayers.map(p => ({
        playerId: p.id,
        name:     p.name,
        color:    p.color,
        score:    room.tot.scores[p.id] || 0,
      })).sort((a, b) => b.score - a.score);

      leaderboard = assignTotTitles(leaderboard);
      room.phase = 'totEnd';
      io.to(code).emit('tot:end', { leaderboard });
      mergeToGlobalScores(io, room, room.tot.scores);
    },
  };

  return totGame;
}

module.exports = { createTotGame, assignTotTitles };
