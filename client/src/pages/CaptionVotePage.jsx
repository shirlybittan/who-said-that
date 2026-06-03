import React, { useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

export default function CaptionVotePage() {
  const { state, dispatch } = useGame();
  const caption = state.caption;
  const sounds = useSounds();
  const [pendingVote, setPendingVote] = useState(null);

  const handleSelectVote = (captionId) => {
    if (caption.hasVoted) return;
    if (captionId === caption.myOwnCaptionId) return; // can't vote for own caption
    sounds.click?.();
    setPendingVote(captionId);
  };

  const handleConfirmVote = () => {
    if (!pendingVote || caption.hasVoted) return;
    sounds.vote?.();
    socket.emit('caption:vote', { code: state.roomCode, captionId: pendingVote });
    dispatch({ type: 'CAPTION_MARK_VOTED', payload: { captionId: pendingVote } });
    setPendingVote(null);
  };

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8] mt-6 mb-1">Vote for the Best! 🏆</h1>
      <p className="text-gray-400 font-['Nunito'] text-sm text-center mb-4">
        Which caption fits {caption.featuredOwnerName}'s photo?
      </p>

      {caption.featuredPhotoData && (
        <img
          src={caption.featuredPhotoData}
          className="w-48 h-48 object-cover rounded-2xl border-2 border-[#FD79A8] mb-4"
          alt={`${caption.featuredOwnerName}'s selfie`}
        />
      )}

      {!caption.hasVoted ? (
        <div className="w-full max-w-sm flex flex-col gap-3">
          {(caption.captions || []).map((c) => {
            const isOwn = c.id === caption.myOwnCaptionId;
            return (
              <button
                key={c.id}
                onClick={() => handleSelectVote(c.id)}
                disabled={isOwn}
                className={`w-full py-4 px-5 rounded-2xl border font-['Nunito'] text-base text-left transition-colors ${
                  pendingVote === c.id
                    ? 'border-[#4ECDC4] bg-[#4ECDC4]/15 text-white'
                    : ''
                } ${
                  isOwn
                    ? 'border-gray-700 bg-[#1A1A2E]/50 text-gray-500 cursor-not-allowed'
                    : 'bg-[#1A1A2E] border-gray-600 text-white hover:border-[#FD79A8] hover:bg-[#FD79A8]/10'
                }`}
              >
                {isOwn ? <span className="mr-2 text-xs text-gray-500">(yours)</span> : null}
                {c.text}
              </button>
            );
          })}
          {pendingVote && (
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setPendingVote(null)}
                className="flex-1 py-2 rounded-xl border border-gray-600 text-gray-300 hover:text-white hover:border-gray-300 transition"
              >
                ← Change
              </button>
              <button
                onClick={handleConfirmVote}
                className="flex-1 py-2 rounded-xl border border-[#4ECDC4] text-[#4ECDC4] bg-[#4ECDC4]/10 hover:bg-[#4ECDC4]/20 transition"
              >
                Confirm Vote ✓
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full max-w-sm flex flex-col gap-3">
          {(caption.captions || []).map((c) => (
            <div
              key={c.id}
              className={`w-full py-4 px-5 rounded-2xl border font-['Nunito'] text-base text-left transition-colors ${
                c.id === caption.myVote
                  ? 'border-[#FD79A8] bg-[#FD79A8]/20 text-white'
                  : 'border-gray-700 bg-[#1A1A2E]/50 text-gray-500'
              }`}
            >
              {c.id === caption.myVote && <span className="mr-2">✅</span>}
              {c.text}
            </div>
          ))}
          <p className="text-gray-500 font-['Nunito'] text-sm text-center mt-2">
            {caption.voteCount} / {caption.totalVoters} votes in
          </p>
        </div>
      )}
    </motion.div>
  );
}
