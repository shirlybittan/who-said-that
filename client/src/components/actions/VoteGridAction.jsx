import React from 'react';

/**
 * VoteGridAction — displays a grid of player photos for voting.
 * Used by Prompt Matching and Photo Association modes.
 *
 * Props:
 *   photos      [{id, name, color, photoData}]  – all player photos
 *   myPlayerId  {string}                         – to disable self-vote
 *   hasVoted    {boolean}
 *   myVote      {string|null}                    – ID of voted player
 *   onVote      {fn(playerId)}
 *   voteCount   {number}
 *   totalVoters {number}
 */
export default function VoteGridAction({
  photos = [],
  myPlayerId,
  hasVoted,
  myVote,
  onVote,
  voteCount = 0,
  totalVoters = 0,
}) {
  if (hasVoted) {
    return (
      <div className="w-full flex flex-col items-center gap-4">
        <div className="w-full bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-4 text-center">
          <p className="text-[#4ECDC4] font-['Fredoka_One'] text-lg mb-1">Vote locked in! ✓</p>
          <p className="text-gray-400 font-['Nunito'] text-sm">
            Waiting for others… ({voteCount}/{totalVoters})
          </p>
        </div>
        {/* Still show grid (dimmed) so player can see what they voted for */}
        <div className="w-full grid grid-cols-2 gap-3">
          {photos.map(p => (
            <div
              key={p.id}
              className={`relative rounded-2xl overflow-hidden border-2 transition ${myVote === p.id ? 'border-[#4ECDC4] ring-2 ring-[#4ECDC4]' : 'border-[#2D2D44] opacity-50'}`}
            >
              <img src={p.photoData} alt={p.name} className="w-full aspect-square object-cover" />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 py-1 text-center">
                <span className="text-white font-['Fredoka_One'] text-sm">{p.name}</span>
                {p.id === myPlayerId && (
                  <span className="ml-1 text-[#FFE66D] text-xs">(you)</span>
                )}
              </div>
              {myVote === p.id && (
                <div className="absolute top-2 right-2 bg-[#4ECDC4] rounded-full w-6 h-6 flex items-center justify-center text-black font-bold text-xs">✓</div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full grid grid-cols-2 gap-3">
      {photos.map(p => {
        const isSelf = p.id === myPlayerId;
        return (
          <button
            key={p.id}
            onClick={() => !isSelf && onVote(p.id)}
            disabled={isSelf}
            className={`relative rounded-2xl overflow-hidden border-2 transition active:scale-95 ${
              isSelf
                ? 'border-[#2D2D44] opacity-40 cursor-not-allowed'
                : 'border-[#2D2D44] hover:border-[#FF6B6B] hover:scale-[1.02]'
            }`}
          >
            <img src={p.photoData} alt={p.name} className="w-full aspect-square object-cover" draggable={false} />
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 py-1 text-center">
              <span className="text-white font-['Fredoka_One'] text-sm">{p.name}</span>
              {isSelf && <span className="ml-1 text-[#FFE66D] text-xs">(you)</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
