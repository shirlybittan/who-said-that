import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import GameEndShell from '../components/game/GameEndShell';
import GamePageWrapper from '../components/GamePageWrapper.jsx';

export default function DrawTelEndPage() {
  const { state } = useGame();
  const { dt, isHost, roomCode } = state;

  return (
    <GamePageWrapper>
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
    </GamePageWrapper>
  );
}
