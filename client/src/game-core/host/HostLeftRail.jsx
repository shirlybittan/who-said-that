import React from 'react';
import TimerRing from '../../components/game/TimerRing';

export default function HostLeftRail({ timer, progress }) {
  return (
    <aside className="flex flex-col items-center gap-4 w-full lg:w-64">
      <div className="bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5 w-full flex flex-col items-center gap-4">
        <TimerRing secondsLeft={timer.secondsLeft} paused={timer.paused} size={120} total={timer.total} />
        <div className="w-full text-center">
          <p className="text-4xl font-['Fredoka_One'] text-white">
            {progress.current}<span className="text-gray-500 text-2xl">/{progress.total}</span>
          </p>
          <p className="text-xs font-['Nunito'] text-gray-400 uppercase tracking-widest mt-1">{progress.label}</p>
          <div className="mt-3 w-full bg-[#2D2D44] rounded-full h-2">
            <div
              className="bg-[#4ECDC4] h-2 rounded-full transition-all duration-500"
              style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
