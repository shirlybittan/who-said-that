// Canonical "who is expected in the current round": connected, playing, and
// not a mid-round joiner. This is the single source of truth for submission /
// vote thresholds, results and leaderboards, so the definition can't drift
// between games (AUDIT.md P1-07: some games used to count late joiners while
// the router parked them in the lobby, so rounds waited for players who could
// never answer).
//
// Mid-round joiners become active at the start of the next round via
// admitLateJoiners() (product decision: "join at the next round").
const getActivePlayers = (room) => (room && room.players ? room.players : [])
  .filter((p) => p.isConnected && p.isPlaying && !p.joinedMidRound);

const defaultSocketOf = (p) => p.phoneSocketId || p.socketId;

/**
 * Fold mid-round joiners into the game. Call at the start of every round (and
 * every game start). Each admitted player is told via `round:admitted` so their
 * client leaves the lobby and resyncs onto the current game screen.
 *
 * @returns {object[]} the players that were admitted
 */
function admitLateJoiners(io, room, socketOf = defaultSocketOf) {
  const admitted = (room?.players || []).filter((p) => p.joinedMidRound);
  admitted.forEach((p) => {
    p.joinedMidRound = false;
    const sid = socketOf(p);
    if (io && sid) io.to(sid).emit('round:admitted', { playerId: p.id });
  });
  // Refresh everyone's player list (the TV counts use joinedMidRound).
  if (io && admitted.length && room.code) io.to(room.code).emit('player_joined', { players: room.players });
  return admitted;
}

module.exports = { getActivePlayers, admitLateJoiners };
