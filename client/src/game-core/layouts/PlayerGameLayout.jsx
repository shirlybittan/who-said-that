import React from 'react';
import PlayerPromptHeader from '../player/PlayerPromptHeader';
import PlayerActionStage from '../player/PlayerActionStage';

export default function PlayerGameLayout({ frame, selectionUI, confirmUI, jokerUI }) {
  return (
    <div className="player-shell flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] px-6 pt-4 pb-8">
      <PlayerPromptHeader gameName={frame.gameName} roundLabel={frame.roundLabel} promptLabel={frame.promptLabel} prompt={frame.prompt} />
      {/* The round timer is rendered once by the app shell (PlayerTopBar). */}
      <PlayerActionStage>{selectionUI}</PlayerActionStage>
      {confirmUI}
      <div className="w-full mt-5 flex justify-center">{jokerUI}</div>
    </div>
  );
}
