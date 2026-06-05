import React from 'react';
import HostGameLayout from '../../game-core/layouts/HostGameLayout';
import { useHostGameFrame } from '../../game-core/hooks/useHostGameFrame';

export default function TriviaHostView({ state, socket }) {
  const { frame, actions } = useHostGameFrame({ gameKey: 'trivia', state, socket });

  return (
    <HostGameLayout
      frame={frame}
      onPauseToggle={actions.togglePause}
      onChangeQuestion={actions.changeQuestion}
      onSkipQuestion={actions.skipQuestion}
      onSkipMiniGame={actions.skipMiniGame}
      centerContent={<div className="bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-6 text-gray-400">Trivia host center placeholder</div>}
    />
  );
}
