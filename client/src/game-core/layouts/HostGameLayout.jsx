import React from 'react';
import HostTopBar from '../host/HostTopBar';
import HostLeftRail from '../host/HostLeftRail';
import HostControlFooter from '../host/HostControlFooter';
import PlayerStatusBubbles from '../host/PlayerStatusBubbles';

export default function HostGameLayout({ frame, onPauseToggle, onChangeQuestion, onSkipMiniGame, centerContent, onOpenGamePicker, onOpenMainMenu, onCopyHostUrl }) {
  return (
    <div className="host-shell min-h-screen bg-[#0D0D1A] text-[#F7F7F7] flex flex-col">
      <HostTopBar
        roomCode={frame.roomCode}
        showQr={frame.showQr}
        joinUrl={frame.joinUrl}
        onCopyHostUrl={onCopyHostUrl}
        onChangeGame={onOpenGamePicker}
        onMainMenu={onOpenMainMenu}
      />
      <div className="host-body flex-1 p-6 overflow-auto">
        <div className="w-full max-w-6xl mx-auto flex flex-col lg:flex-row gap-6 items-start">
          <HostLeftRail timer={frame.timer} progress={frame.progress} />
          <main className="flex-1 flex flex-col gap-6">
            <PlayerStatusBubbles players={frame.playerStatuses} statusLabel={frame.statusLabel} />
            {centerContent}
          </main>
        </div>
      </div>
      <HostControlFooter
        paused={frame.paused}
        onPauseToggle={onPauseToggle}
        onChangeQuestion={onChangeQuestion}
        onSkipMiniGame={onSkipMiniGame}
      />
    </div>
  );
}
