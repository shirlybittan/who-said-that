import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { useSounds } from '../hooks/useSounds';
import GameEndShell from '../components/game/GameEndShell';

export default function GameEndPage() {
  const { state } = useGame();
  const sounds = useSounds();

  const leaderboard = state.players
    .filter(p => p.isPlaying)
    .sort((a, b) => (state.scores[b.id] || 0) - (state.scores[a.id] || 0))
    .map(p => ({ id: p.id, name: p.name, color: p.color, score: state.scores[p.id] || 0 }));

  const handlePlayAgain = () => {
    sounds.click();
    socket.emit('change_game', { code: state.roomCode, newGameType: state.gameType || 'who-said-that' });
  };

  return (
    <GameEndShell
      title="Game Over! 🎉"
      leaderboard={leaderboard}
      isHost={true}
      onPlayAgain={handlePlayAgain}
      gameType={state.gameType}
    />
  );
}
