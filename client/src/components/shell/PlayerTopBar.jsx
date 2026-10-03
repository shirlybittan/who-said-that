import React from 'react';
import { useGame } from '../../store/gameStore.jsx';
import GameTimer from '../../game-core/player/GameTimer';
import SoundToggle from './SoundToggle';
import LangSwitcher from './LangSwitcher';

/**
 * The phone app shell's top bar: room code · round timer · sound/lang.
 * In normal flow (not floating), so page content can never sit under it —
 * the old fixed toggles and room badge overlapped headers and Confirm
 * buttons at 360px (AUDIT.md P2-10).
 */
export default function PlayerTopBar() {
  const { state } = useGame();
  return (
    <header
      data-testid="player-top-bar"
      className="sticky top-0 z-50 h-14 px-3 flex items-center justify-between gap-2 bg-[#0D0D1A]/95 backdrop-blur-sm border-b border-[#2D2D44]"
    >
      <div className="flex-1 min-w-0">
        {state.roomCode && (
          <div className="leading-tight" data-testid="room-code-badge">
            <p className="text-[10px] font-['Nunito'] text-gray-500 uppercase tracking-widest">Room</p>
            <p className="text-base font-['Fredoka_One'] text-[#FFE66D] tracking-widest">{state.roomCode}</p>
          </div>
        )}
      </div>
      <div className="flex-shrink-0"><GameTimer size={44} /></div>
      <div className="flex-1 flex items-center justify-end gap-2">
        <SoundToggle />
        <LangSwitcher />
      </div>
    </header>
  );
}
