import React from 'react';

/**
 * ConfirmVoteCard — shown after a player taps a choice, before the vote is locked.
 *
 * Supports two vote shape variants:
 *  - Player vote:  { name, color }  → renders a coloured avatar circle + name
 *  - Text choice:  { label, badge } → renders a badge pill (e.g. "A") + label text
 */
export default function ConfirmVoteCard({ onConfirm, confirmLabel = '✓ Confirm' }) {
  return (
    <div className="w-full max-w-md mt-4">
      <button onClick={onConfirm} className="w-full py-4 rounded-2xl font-['Fredoka_One'] text-xl border-2 border-[#4ECDC4] text-[#4ECDC4] bg-[#4ECDC4]/10 hover:bg-[#4ECDC4]/20 transition active:scale-95">
        {confirmLabel}
      </button>
    </div>
  );
}

