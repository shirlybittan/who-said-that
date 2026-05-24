import React, { useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

export default function CaptionWritePage() {
  const { state, dispatch } = useGame();
  const caption = state.caption;
  const sounds = useSounds();
  const [text, setText] = useState('');
  const MAX_LEN = 140;

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || caption.hasWrittenCaption) return;
    sounds.answer?.();
    socket.emit('caption:submit_caption', { code: state.roomCode, text: trimmed });
    dispatch({ type: 'CAPTION_MARK_CAPTION_WRITTEN' });
  };

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

      {!caption.hasWrittenCaption ? (
        <div className="w-full max-w-sm flex flex-col gap-3">
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
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="w-full py-3 rounded-2xl font-['Fredoka_One'] text-xl transition-colors disabled:opacity-40 bg-[#FD79A8] text-white"
          >
            Submit Caption 🚀
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 mt-4">
          <div className="text-5xl">✅</div>
          <p className="text-[#FD79A8] font-['Fredoka_One'] text-lg">Caption submitted!</p>
          <p className="text-gray-500 font-['Nunito'] text-sm">
            {caption.captionSubmittedCount} / {caption.totalWriters} captions in
          </p>
          <p className="text-gray-500 font-['Nunito'] text-xs">Waiting for everyone…</p>
        </div>
      )}
    </motion.div>
  );
}
