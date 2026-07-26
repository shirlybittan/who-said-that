// Canonical "who is active in this round" filter: connected AND playing.
// Used across snapshots, vote/submission counts, results and leaderboards — the
// single source of truth so the definition can't drift between call sites.
//
// NOTE: this intentionally does NOT exclude mid-round joiners. Some round-
// threshold code additionally filters `!p.joinedMidRound` (a deliberately
// narrower set — a player who joined mid-round shouldn't gate the current
// round); those call sites keep their own filter and are left untouched.
const getActivePlayers = (room) => (room && room.players ? room.players : []).filter((p) => p.isConnected && p.isPlaying);

module.exports = { getActivePlayers };
