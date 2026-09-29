// Caption / Photo Vote send { id, pts, name } leaderboards; GameEndShell's
// Leaderboard wants { id, name, color, score }. Every playing player is listed,
// 0-point players included (they used to be dropped — AUDIT.md P3-12).
export function pointsLeaderboard(leaderboard, scores, players) {
  const rows = (leaderboard && leaderboard.length)
    ? leaderboard.map(e => ({ id: e.id, score: e.pts ?? e.score ?? 0, name: e.name }))
    : Object.entries(scores || {}).map(([id, pts]) => ({ id, score: pts }));
  const seen = new Set(rows.map(r => r.id));
  (players || []).filter(p => p.isPlaying && !seen.has(p.id)).forEach(p => rows.push({ id: p.id, score: 0 }));
  return rows
    .map(r => {
      const p = (players || []).find(pl => pl.id === r.id);
      return { id: r.id, name: p?.name || r.name || '?', color: p?.color || '#888', score: r.score };
    })
    .sort((a, b) => b.score - a.score);
}
