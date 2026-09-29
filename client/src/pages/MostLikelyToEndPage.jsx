import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { translations } from '../locales/translations';
import { socket } from '../socket';
import GameEndShell from '../components/game/GameEndShell';
import { getGame } from '../games/registry';

// Most Likely To end screen on the shared GameEndShell (was a custom podium
// with confetti that looped forever — AUDIT.md P3-10).
export default function MostLikelyToEndPage() {
  const { state } = useGame();
  const t = translations[state.lang].mlt;
  const leaderboard = (state.mlt.leaderboard || []).map(e => ({ ...e, id: e.playerId || e.id }));
  return (
    <GameEndShell
      title={t.gameOverTitle}
      subtitle={t.gameOverSub}
      leaderboard={leaderboard}
      accentColor={getGame('most-likely-to').accent}
      onPlayAgain={() => socket.emit('mlt:restart', { code: state.roomCode })}
      gameType="most-likely-to"
    />
  );
}
