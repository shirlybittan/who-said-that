import React from 'react';
import TimerRing from '../../components/game/TimerRing';
import PlayerPromptHeader from '../player/PlayerPromptHeader';
import PlayerActionStage from '../player/PlayerActionStage';

export default function PlayerGameLayout({ frame, selectionUI, confirmUI, jokerUI }) {
  return (
    <div className="player-shell flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-8">
      <PlayerPromptHeader gameName={frame.gameName} roundLabel={frame.roundLabel} prompt={frame.prompt} />
      <div className="w-full max-w-lg flex justify-center mb-6">
        <TimerRing secondsLeft={frame.timer.secondsLeft} paused={frame.timer.paused} size={112} total={frame.timer.total} />
      </div>
      <PlayerActionStage>{selectionUI}</PlayerActionStage>
      {confirmUI}
      <div className="w-full mt-5 flex justify-center">{jokerUI}</div>
    </div>
  );
}
