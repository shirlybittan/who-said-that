import React, { useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import GamePageWrapper from '../components/GamePageWrapper.jsx';

export default function CaptionVotePage() {
  const { state, dispatch } = useGame();
  const caption = state.caption;
  const sounds = useSounds();
  const [selected, setSelected] = useState(null);

  const isFeaturedOwner = state.playerId === caption.featuredOwnerId;

  const handleSelect = (captionId) => {
    if (caption.hasVoted || captionId === caption.myOwnCaptionId) return;
    sounds.click?.();
    setSelected(captionId);
  };

  const handleConfirm = () => {
    if (!selected || caption.hasVoted) return;
    sounds.vote?.();
    socket.emit('caption:vote', { code: state.roomCode, captionId: selected });
    dispatch({ type: 'CAPTION_MARK_VOTED', payload: { captionId: selected } });
  };

  return (
    <GamePageWrapper>
      <motion.div
        className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8] mt-6 mb-1">Vote for the Best! 🏆</h1>
        <p className="text-gray-400 font-['Nunito'] text-sm text-center mb-4">
          Which caption fits {caption.featuredOwnerName}'s photo?
        </p>
        {isFeaturedOwner && (
          <p className="text-xs text-[#FD79A8] font-['Nunito'] mb-2">📸 It's your photo — but you still get to vote!</p>
        )}

        {caption.featuredPhotoData && (
          <img
            src={caption.featuredPhotoData}
            className="w-48 h-48 object-cover rounded-2xl border-2 border-[#FD79A8] mb-4"
            alt={`${caption.featuredOwnerName}'s selfie`}
          />
        )}

        {!caption.hasVoted ? (
          <>
          <div className="w-full max-w-sm flex flex-col gap-3">
            {(caption.captions || []).map((c) => {
              const isOwn = c.id === caption.myOwnCaptionId;
              const isSelected = selected === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => handleSelect(c.id)}
                  disabled={isOwn}
                  className={`w-full py-4 px-5 rounded-2xl border font-['Nunito'] text-base text-left transition-colors ${
                    isOwn
                      ? 'border-gray-700 bg-[#1A1A2E]/50 text-gray-500 cursor-not-allowed'
                      : isSelected
                      ? 'border-[#FD79A8] bg-[#FD79A8]/20 text-white'
                      : selected
                      ? 'bg-[#1A1A2E] border-gray-700 text-gray-400 opacity-60'
                      : 'bg-[#1A1A2E] border-gray-600 text-white hover:border-[#FD79A8] hover:bg-[#FD79A8]/10'
                  }`}
                >
                  {isOwn ? <span className="mr-2 text-xs text-gray-500">(yours)</span> : null}
                  {isSelected && <span className="mr-2">👆</span>}
                  {c.text}
                </button>
              );
            })}
          </div>
          {selected && (
            <button
              onClick={handleConfirm}
              className="mt-4 w-full max-w-sm py-4 rounded-2xl bg-[#FD79A8] text-white font-['Fredoka_One'] text-xl active:scale-95 transition-transform"
            >
              Confirm Vote ✓
            </button>
          )}
          </>
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
    </GamePageWrapper>
  );
}
