import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import GameEndShell from '../components/game/GameEndShell';
import { gameLabel } from '../games/registry';

export default function DrawingEndPage() {
  const { state } = useGame();
  const { draw, isHost, roomCode, lang } = state;
  const t = translations[lang].draw;

  return (
    <GameEndShell
      title={t.finalTitle}
      subtitle={gameLabel('drawing', state.lang)}
      leaderboard={draw.leaderboard || []}
      accentColor="#C39BD3"
      pts={t.pts}
      isHost={isHost}
      onPlayAgain={() => socket.emit('draw:restart', { code: roomCode })}
      playAgainLabel={`🔄 ${t.playAgain}`}
      gameType={state.gameType}
    />
  );
}
