import React from 'react';

/**
 * ConfirmVoteCard — shown after a player taps a choice, before the vote is locked.
 *
 * Supports two vote shape variants:
 *  - Player vote:  { name, color }  → renders a coloured avatar circle + name
 *  - Text choice:  { label, badge } → renders a badge pill (e.g. "A") + label text
 */
export default function ConfirmVoteCard({ vote, onConfirm, onChange, confirmLabel = '✓ Confirm', changeLabel = '← Change', titleLabel = 'Confirm your vote?' }) {
  if (!vote) return null;

  const isTextChoice = vote.label !== undefined && vote.name === undefined;

  return (
    <div className="w-full max-w-md flex flex-col items-center gap-4 mt-4">
      <p className="text-gray-400 font-['Nunito'] text-sm">{titleLabel}</p>
      <div className="w-full bg-[#1A1A2E] border-2 border-[#4ECDC4] rounded-2xl p-5 flex items-center gap-4">
        {isTextChoice ? (
          <>
            <span className="w-12 h-12 rounded-full flex items-center justify-center font-['Fredoka_One'] text-xl bg-[#6C5CE7] text-white flex-shrink-0">
              {vote.badge || '?'}
            </span>
            <span className="font-['Fredoka_One'] text-2xl text-[#4ECDC4] flex-1">{vote.label}</span>
          </>
        ) : (
          <>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-black font-bold text-xl border-2 border-white/20 flex-shrink-0"
              style={{ backgroundColor: vote.color }}
            >
              {vote.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-['Fredoka_One'] text-2xl text-[#4ECDC4] flex-1">{vote.name}</span>
          </>
        )}
      </div>
      <div className="flex gap-3 w-full">
        <button onClick={onChange} className="flex-1 py-3 rounded-2xl font-['Fredoka_One'] text-lg border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF6B6B] hover:text-[#FF6B6B] transition active:scale-95">
          {changeLabel}
        </button>
        <button onClick={onConfirm} className="flex-1 py-3 rounded-2xl font-['Fredoka_One'] text-lg border-2 border-[#4ECDC4] text-[#4ECDC4] bg-[#4ECDC4]/10 hover:bg-[#4ECDC4]/20 transition active:scale-95">
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

