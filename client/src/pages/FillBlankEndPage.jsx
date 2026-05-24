import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import GameEndShell from '../components/game/GameEndShell';

export default function FillBlankEndPage() {
  const { state } = useGame();
  const { fitb, isHost, roomCode } = state;

  return (
    <GameEndShell
      title="Game Over!"
      subtitle="✏️ Fill in the Blank"
      leaderboard={fitb.leaderboard || []}
      accentColor="#F9CA24"
      isHost={isHost}
      onPlayAgain={() => socket.emit('fitb:restart', { code: roomCode })}
      playAgainLabel="🔄 Play Again"
      gameType={state.gameType}
    />
  );
}
