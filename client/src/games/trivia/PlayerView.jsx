import React from 'react';
import PlayerGameLayout from '../../game-core/layouts/PlayerGameLayout';
import { usePlayerGameFrame } from '../../game-core/hooks/usePlayerGameFrame';

export default function TriviaPlayerView({ state, socket, dispatch }) {
  const { frame } = usePlayerGameFrame({ gameKey: 'trivia', state, socket, dispatch });

  return (
    <PlayerGameLayout
      frame={frame}
      selectionUI={<div className="text-gray-400 text-center">Trivia choices placeholder</div>}
      confirmUI={null}
      jokerUI={null}
    />
  );
}
