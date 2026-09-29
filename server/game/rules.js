// Shared game rules applied uniformly by every mini-game start handler.
//
// Previously each start handler had its own (or no) minimum and returned
// silently when it wasn't met, leaving the host screen stuck on "Connecting…".
// Now every start goes through requireMinPlayers(), which tells the host why.

const { getActivePlayers } = require('./players');

// Product decision (AUDIT.md Q7): every game needs at least 3 connected players.
const MIN_PLAYERS = 3;

/**
 * Returns true when the room has enough connected, playing players to start a
 * game. Otherwise emits `game:start_rejected` to the requesting socket and
 * returns false.
 */
function requireMinPlayers(socket, room, gameType) {
  const count = getActivePlayers(room).length;
  if (count >= MIN_PLAYERS) return true;
  socket.emit('game:start_rejected', {
    gameType,
    minPlayers: MIN_PLAYERS,
    connectedPlayers: count,
    message: `Need at least ${MIN_PLAYERS} connected players to start (currently ${count}).`,
  });
  return false;
}

/** Parse a client-supplied round count into a sane integer. */
function clampRounds(rounds, fallback = 3, max = 10) {
  const n = parseInt(rounds, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 1), max);
}

module.exports = { MIN_PLAYERS, requireMinPlayers, clampRounds };
