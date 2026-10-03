import React from 'react';
import { socket } from '../../socket';
import { useGame } from '../../store/gameStore.jsx';
import { translations } from '../../locales/translations';
import { useRoundTimer } from '../../game-core/hooks/useRoundTimerSync';
import useSingleFlight from '../../game-core/hooks/useSingleFlight';

/**
 * Host controls on a phone (for games hosted without a TV, AUDIT.md Q4):
 * Pause / Continue for any server-timed waiting phase (photos, captions,
 * votes — server/game/phaseTimer.js), the same generic controls the TV shows.
 * Rendered by the app shell, so every game gets it.
 */
export default function PhoneHostBar() {
  const { state } = useGame();
  const timer = useRoundTimer();
  const guard = useSingleFlight(1000);
  const t = translations[state.lang]?.common || translations.en.common;
  if (!state.isHost || !state.roomCode) return null;
  if (!timer.visible || state.roundTimer?.source !== 'phase_timer') return null;
  const code = state.roomCode;
  return (
    <div data-testid="phone-host-bar" className="fixed bottom-0 inset-x-0 z-40 flex justify-center gap-3 p-3 bg-[#0D0D1A]/95 border-t border-[#2D2D44]">
      <button onClick={() => socket.emit('host:toggle_pause', { code })} className="px-4 py-2.5 rounded-xl font-['Fredoka_One'] border-2 border-[#FFE66D] text-[#FFE66D] active:scale-95">
        {timer.paused ? '▶' : '⏸'}
      </button>
      <button onClick={guard(() => socket.emit('host:advance', { code }))} className="flex-1 max-w-xs px-4 py-2.5 rounded-xl font-['Fredoka_One'] bg-[#4ECDC4] text-black active:scale-95">
        ⏭ {t.continue}
      </button>
    </div>
  );
}
