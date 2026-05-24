import React from 'react';

/**
 * "Vote locked in" waiting widget shown after a player casts their vote.
 *
 * Props:
 *  voteCount     – number of votes received so far
 *  totalVoters   – total number of players who need to vote
 *  label         – primary message (default 'Vote locked in! ✓')
 *  accentColor   – colour for the progress bar and label (default teal)
 */
export default function VoteLocked({
  voteCount = 0,
  totalVoters = 0,
  label = 'Vote locked in! ✓',
  accentColor = '#4ECDC4',
}) {
  const pct = totalVoters > 0 ? (voteCount / totalVoters) * 100 : 0;

  return (
    <div className="flex flex-col items-center gap-3 mt-4 w-full max-w-sm">
      <p className="font-['Fredoka_One'] text-lg" style={{ color: accentColor }}>
        {label}
      </p>
      {totalVoters > 0 && (
        <>
          <p className="font-['Nunito'] text-sm text-gray-400">
            Waiting for others… ({voteCount}/{totalVoters})
          </p>
          <div className="w-full bg-[#2D2D44] rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: accentColor }}
            />
          </div>
        </>
      )}
    </div>
  );
}
