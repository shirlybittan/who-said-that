import React, { useState } from 'react';
import { useGame } from '../../store/gameStore.jsx';
import { translations } from '../../locales/translations';

/**
 * ConfirmVoteCard — the canonical "confirm your pick" step, shown after a
 * player taps a choice and before the vote is locked.
 *
 * Change rule (AUDIT.md Q1): a pick can be changed freely until Confirm;
 * after Confirm the vote is final (the page then shows VoteLocked).
 *
 * Props:
 *  vote          – the pending choice. Player shape { name, color } renders an
 *                  avatar; text shape { label, badge } renders a badge + label.
 *  onConfirm     – lock the vote (called at most once)
 *  onChange      – drop the pending pick so another can be chosen (optional)
 *  titleLabel / confirmLabel / changeLabel – override the translated defaults
 *  disabled      – e.g. while the phase is closing
 *  accentColor   – the game's accent (default teal)
 */
export default function ConfirmVoteCard({
  vote,
  onConfirm,
  onChange,
  titleLabel,
  confirmLabel,
  changeLabel,
  disabled = false,
  accentColor = '#4ECDC4',
}) {
  const { state } = useGame();
  const t = translations[state.lang]?.common || translations.en.common;
  const [sent, setSent] = useState(false);

  const handleConfirm = () => {
    if (sent || disabled) return; // double-tap guard
    setSent(true);
    onConfirm?.();
  };

  const label = vote?.label ?? vote?.name ?? '';
  const isPlayer = vote && vote.color && !vote.badge;

  return (
    <div data-testid="confirm-vote-card" className="w-full max-w-md mt-4 rounded-2xl border-2 p-4 bg-[#1A1A2E]" style={{ borderColor: `${accentColor}80` }}>
      <p className="text-xs font-['Nunito'] text-gray-400 uppercase tracking-widest mb-2 text-center">{titleLabel || t.confirmVoteTitle}</p>
      {vote && (
        <div className="flex items-center justify-center gap-3 mb-4 min-w-0">
          {isPlayer ? (
            <span className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-black" style={{ backgroundColor: vote.color }}>
              {String(label).charAt(0).toUpperCase()}
            </span>
          ) : vote.badge ? (
            <span className="px-2.5 py-1 rounded-lg flex-shrink-0 font-['Fredoka_One'] text-black" style={{ backgroundColor: accentColor }}>{vote.badge}</span>
          ) : null}
          <span className="font-['Fredoka_One'] text-lg text-white break-words [overflow-wrap:anywhere] min-w-0">{label}</span>
        </div>
      )}
      <div className="flex gap-2">
        {onChange && (
          <button
            onClick={onChange}
            disabled={sent}
            className="flex-1 py-3 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-300 hover:border-gray-400 transition active:scale-95 disabled:opacity-40"
          >
            {changeLabel || t.change}
          </button>
        )}
        <button
          data-testid="confirm-vote-btn"
          onClick={handleConfirm}
          disabled={sent || disabled}
          className="flex-[2] py-3 rounded-xl font-['Fredoka_One'] text-lg border-2 transition active:scale-95 disabled:opacity-50"
          style={{ borderColor: accentColor, color: accentColor, backgroundColor: `${accentColor}1A` }}
        >
          {confirmLabel || t.confirm}
        </button>
      </div>
    </div>
  );
}
