import React, { useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import MiniGameWrapper from '../components/MiniGameWrapper.jsx';
import { useMiniGameLifecycle } from '../hooks/useMiniGameLifecycle.js';

export default function CaptionWritePage() {
  const { state, dispatch } = useGame();
  const caption = state.caption;
  const sounds = useSounds();
  const [text, setText] = useState(caption.myCaption || '');
  const MAX_LEN = 140;

  const doSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sounds.answer?.();
    socket.emit('caption:submit_caption', { code: state.roomCode, text: trimmed });
    // Only mark as written on initial submission; updates don't change the flag
    if (!caption.hasWrittenCaption) {
      dispatch({ type: 'CAPTION_MARK_CAPTION_WRITTEN' });
    }
  };

  const { hasConfirmed, confirm, editResponse } = useMiniGameLifecycle({
    onSubmit: doSubmit,
    resetKey: caption.round,
  });

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8] mt-6 mb-1">Write a Caption! ✍️</h1>
      <p className="text-gray-400 font-['Nunito'] text-sm text-center mb-4">
        Round {caption.round} of {caption.totalRounds}
      </p>

      {caption.featuredPhotoData && (
        <img
          src={caption.featuredPhotoData}
          className="w-56 h-56 object-cover rounded-2xl border-2 border-[#FD79A8] mb-3"
          alt={`${caption.featuredOwnerName}'s selfie`}
        />
      )}

      <div className="w-full max-w-xs bg-[#FFE66D]/10 rounded-2xl px-4 py-3 mb-4 text-center">
        <p className="text-[#FFE66D] font-['Nunito'] text-sm font-semibold">{caption.prompt}</p>
      </div>

      <MiniGameWrapper
        hasConfirmed={hasConfirmed}
        onConfirm={confirm}
        onEditResponse={editResponse}
        confirmLabel={caption.hasWrittenCaption ? '↑ Update Caption' : 'Submit Caption 🚀'}
        disableConfirm={!text.trim()}
        isHost={state.isHost}
        waitingMessage={`Caption submitted! (${caption.captionSubmittedCount} / ${caption.totalWriters} in)`}
      >
        <div className="w-full max-w-sm flex flex-col gap-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, MAX_LEN))}
            placeholder="Write something hilarious…"
            rows={3}
            className="w-full rounded-2xl bg-[#1A1A2E] border border-gray-600 text-white font-['Nunito'] p-3 resize-none focus:outline-none focus:border-[#FD79A8]"
          />
          <div className="flex justify-between text-xs text-gray-500 font-['Nunito'] px-1">
            <span>{text.trim().length === 0 ? 'Min 1 character' : ''}</span>
            <span>{text.length}/{MAX_LEN}</span>
          </div>
        </div>
      </MiniGameWrapper>
    </motion.div>
  );
}
