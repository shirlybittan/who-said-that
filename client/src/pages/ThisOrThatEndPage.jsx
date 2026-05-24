import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import GameEndShell from '../components/game/GameEndShell';

export default function ThisOrThatEndPage() {
  const { state } = useGame();
  const t = translations[state.lang].tot;
  const { tot, roomCode } = state;

  return (
    <GameEndShell
      title={t.gameOverTitle}
      subtitle={t.gameOverSub}
      leaderboard={tot.leaderboard || []}
      accentColor="#FFE66D"
      pts={t.pts}
      isHost={state.isHost}
      onPlayAgain={() => socket.emit('change_game', { code: roomCode, newGameType: 'this-or-that' })}
      playAgainLabel={t.playAgain}
      gameType={state.gameType}
    />
  );
}
