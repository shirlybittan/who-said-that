import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import GameEndShell from '../components/game/GameEndShell';
import { getGame, gameLabel } from '../games/registry';

export default function FillBlankEndPage() {
  const { state } = useGame();
  const { fitb, roomCode } = state;
  const tf = translations[state.lang]?.fitb || translations.en.fitb;
  return (
    <GameEndShell
      title={tf.gameOver}
      subtitle={gameLabel('fill-in-the-blank', state.lang)}
      leaderboard={fitb.leaderboard || []}
      accentColor={getGame('fill-in-the-blank').accent}
      onPlayAgain={() => socket.emit('fitb:restart', { code: roomCode })}
      gameType={state.gameType}
    />
  );
}
