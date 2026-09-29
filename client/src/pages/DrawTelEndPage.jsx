import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import GameEndShell from '../components/game/GameEndShell';
import { gameLabel } from '../games/registry';
import GamePageWrapper from '../components/GamePageWrapper.jsx';

export default function DrawTelEndPage() {
  const { state } = useGame();
  const { dt, isHost, roomCode } = state;

  return (
    <GamePageWrapper>
      <GameEndShell
        subtitle={gameLabel('draw-telephone', state.lang)}
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
