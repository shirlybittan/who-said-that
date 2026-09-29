import React from 'react';
import { useGame } from '../../store/gameStore.jsx';
import { translations } from '../../locales/translations';
import WaitingFor from '../../game-core/player/WaitingFor';

/**
 * Canonical "vote locked in" state shown after a player confirms a vote:
 * label, progress bar and who is still missing (WaitingFor).
 *
 * Props:
 *  voteCount     – number of votes received so far
 *  totalVoters   – total number of players who need to vote
 *  label         – primary message (default: translated "Vote locked in! 🔒")
 *  accentColor   – colour for the progress bar and label (default teal)
 */
export default function VoteLocked({
  voteCount = 0,
  totalVoters = 0,
  label,
  accentColor = '#4ECDC4',
}) {
  const { state } = useGame();
  const t = translations[state.lang]?.common || translations.en.common;
  const pct = totalVoters > 0 ? Math.min(100, (voteCount / totalVoters) * 100) : 0;

  return (
    <div data-testid="vote-locked" className="flex flex-col items-center gap-3 mt-4 w-full max-w-sm">
      <p className="font-['Fredoka_One'] text-lg" style={{ color: accentColor }}>
        {label || t.voteLocked}
      </p>
      {totalVoters > 0 && (
        <>
          <p className="font-['Nunito'] text-sm text-gray-400">
            {t.waitingOthers} ({voteCount}/{totalVoters})
          </p>
          <div className="w-full bg-[#2D2D44] rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: accentColor }}
            />
          </div>
        </>
      )}
      <WaitingFor />
    </div>
  );
}
