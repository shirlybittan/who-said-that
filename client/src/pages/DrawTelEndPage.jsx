import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import GameEndShell from '../components/game/GameEndShell';

export default function DrawTelEndPage() {
  const { state } = useGame();
  const { dt, isHost, roomCode } = state;

  return (
    <GameEndShell
      title="Game Over!"
      subtitle="📞 Draw Telephone"
      leaderboard={dt.leaderboard || []}
      accentColor="#FF6B6B"
      isHost={isHost}
      onPlayAgain={() => socket.emit('dt:restart', { code: roomCode })}
      playAgainLabel="🔄 Play Again"
      gameType={state.gameType}
    />
  );
}
