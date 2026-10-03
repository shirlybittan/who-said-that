import React from 'react';
import { useGame } from '../../store/gameStore.jsx';
import { translations } from '../../locales/translations';
import { pendingPlayers } from '../roundProgress';

/**
 * "Waiting for Bob, Carl" — the canonical waiting-for-others line. Built into
 * MiniGameWrapper's waiting state and VoteLocked, so games get it by default.
 */
export default function WaitingFor({ className = '' }) {
  const { state } = useGame();
  const t = translations[state.lang]?.common || translations.en.common;
  const pending = pendingPlayers(state.players, state.roundProgress?.doneIds, { excludeId: state.playerId });
  if (pending.length === 0) return null;
  return (
    <div data-testid="waiting-for" className={`flex flex-col items-center gap-2 ${className}`}>
      <p className="text-xs font-['Nunito'] text-gray-400 uppercase tracking-widest">{t.waitingFor}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {pending.map(p => (
          <span key={p.id} className="flex items-center gap-1.5 bg-[#1A1A2E] border border-[#2D2D44] rounded-full ps-1 pe-3 py-1">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-black" style={{ backgroundColor: p.color }}>
              {p.name?.charAt(0).toUpperCase()}
            </span>
            <span className="text-sm font-['Nunito'] text-gray-200 max-w-[8rem] truncate">{p.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
