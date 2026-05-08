import React from 'react';

/**
 * VoteCaptionAction — shows a selfie photo above a list of captions to vote on.
 * Used by Selfie Captioning mode.
 *
 * Props:
 *   photoData     {string}   – base64 featured selfie
 *   ownerName     {string}   – whose selfie it is
 *   captions      [{id, playerId, playerName, playerColor, text}]
 *   myPlayerId    {string}
 *   hasVoted      {boolean}
 *   myVote        {string|null}  – captionId
 *   onVote        {fn(captionId)}
 *   voteCount     {number}
 *   totalVoters   {number}
 */
export default function VoteCaptionAction({
  photoData,
  ownerName,
  captions = [],
  myPlayerId,
  hasVoted,
  myVote,
  onVote,
  voteCount = 0,
  totalVoters = 0,
}) {
  return (
    <div className="w-full flex flex-col items-center gap-4">
      {/* Featured selfie */}
      {photoData && (
        <div className="w-full rounded-2xl overflow-hidden border-2 border-[#2D2D44]" style={{ maxHeight: 220 }}>
          <img src={photoData} alt={`${ownerName}'s selfie`} className="w-full h-full object-cover" />
        </div>
      )}

      {hasVoted ? (
        <div className="w-full bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-4 text-center">
          <p className="text-[#4ECDC4] font-['Fredoka_One'] text-lg mb-1">Vote locked in! ✓</p>
          <p className="text-gray-400 font-['Nunito'] text-sm">
            Waiting for others… ({voteCount}/{totalVoters})
          </p>
        </div>
      ) : null}

      {/* Caption options */}
      <div className="w-full flex flex-col gap-2">
        {captions.map(c => {
          const isOwn = c.playerId === myPlayerId;
          const isVoted = myVote === c.id;
          return (
            <button
              key={c.id}
              onClick={() => !isOwn && !hasVoted && onVote(c.id)}
              disabled={isOwn || hasVoted}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 font-['Nunito'] text-sm transition ${
                isOwn
                  ? 'border-[#2D2D44] bg-[#1A1A2E] text-gray-500 cursor-not-allowed'
                  : isVoted
                  ? 'border-[#4ECDC4] bg-[#4ECDC4]/10 text-white'
                  : hasVoted
                  ? 'border-[#2D2D44] bg-[#1A1A2E] text-gray-400'
                  : 'border-[#2D2D44] bg-[#1A1A2E] text-white hover:border-[#FF6B6B] hover:bg-[#FF6B6B]/10 active:scale-[0.98]'
              }`}
            >
              <span>{c.text}</span>
              {isOwn && <span className="ml-2 text-xs text-gray-500">(yours)</span>}
              {isVoted && <span className="float-right text-[#4ECDC4]">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
