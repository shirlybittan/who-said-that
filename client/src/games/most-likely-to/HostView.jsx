import React from 'react';
import HostGameLayout from '../../game-core/layouts/HostGameLayout';
import { useHostGameFrame } from '../../game-core/hooks/useHostGameFrame';

function MostLikelyToHostCenter({ prompt, roundLabel }) {
  return (
    <div className="w-full bg-[#1A1A2E] border-2 border-[#4ECDC4] rounded-3xl p-10 text-center" style={{ boxShadow: '0 0 40px #4ECDC420' }}>
      <p className="text-xs font-['Nunito'] text-[#4ECDC4] uppercase tracking-widest mb-4">{roundLabel}</p>
      <h1 className="text-4xl md:text-5xl font-['Fredoka_One'] text-[#FFE66D] leading-tight">{prompt}</h1>
    </div>
  );
}

export default function MostLikelyToHostView({ state, socket, onOpenGamePicker, onOpenMainMenu, onSkipMiniGame }) {
  const { frame, actions } = useHostGameFrame({ gameKey: 'most-likely-to', state, socket });

  const handleCopyHostUrl = () => {
    if (!frame.roomCode) return;
    const hostUrl = `${window.location.origin}/host?room=${frame.roomCode}`;
    navigator.clipboard.writeText(hostUrl).catch(() => {});
  };

  return (
    <HostGameLayout
      frame={frame}
      onPauseToggle={actions.togglePause}
      onChangeQuestion={actions.changeQuestion}
      onSkipMiniGame={onSkipMiniGame || actions.skipMiniGame}
      onOpenGamePicker={onOpenGamePicker}
      onOpenMainMenu={onOpenMainMenu}
      onCopyHostUrl={handleCopyHostUrl}
      centerContent={<MostLikelyToHostCenter prompt={frame.prompt} roundLabel={frame.roundLabel} />}
    />
  );
}
