import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import GamePageWrapper from '../components/GamePageWrapper.jsx';
import MiniGameWrapper from '../components/MiniGameWrapper.jsx';
import { useMiniGameLifecycle } from '../hooks/useMiniGameLifecycle.js';

export default function CaptionWritePage() {
  const { state, dispatch } = useGame();
  const caption = state.caption;
  const sounds = useSounds();
  const [text, setText] = useState(caption.myCaption || '');
  const MAX_LEN = 140;

  const writingSecondsLeft = caption.writingSecondsLeft ?? 60;
  const writingTimerActive = caption.writingTimerActive ?? false;

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

  const { hasConfirmed, confirm, editResponse, markConfirmed } = useMiniGameLifecycle({
    onSubmit: doSubmit,
    resetKey: caption.round,
    initialConfirmed: caption.hasWrittenCaption,
  });

  // Keep latest text accessible to the timer effect without stale closures
  const autoSubmitRef = useRef({ text });
  useEffect(() => { autoSubmitRef.current = { text }; });

  // Track whether the timer ever became active (guard against firing before the game starts)
  const timerWasActiveRef = useRef(false);
  useEffect(() => {
    if (writingTimerActive) timerWasActiveRef.current = true;
  }, [writingTimerActive]);

  // Auto-submit when the server writing timer hits 0
  useEffect(() => {
    if (hasConfirmed) return;
    if (caption.phase !== 'writing') return;
    if (!timerWasActiveRef.current) return;
    if (writingSecondsLeft <= 0 && writingTimerActive === false) {
      const trimmed = autoSubmitRef.current.text.trim();
      const textToSubmit = trimmed || "I couldn't think of anything funny in time! 🕒";
      socket.emit('caption:submit_caption', { code: state.roomCode, text: textToSubmit });
      if (!caption.hasWrittenCaption) {
        dispatch({ type: 'CAPTION_MARK_CAPTION_WRITTEN' });
      }
      markConfirmed();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writingSecondsLeft, writingTimerActive, hasConfirmed, caption.phase]);

  return (
    <GamePageWrapper>
      <motion.div
        className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8] mt-6 mb-1">Write a Caption! ✍️</h1>
        <div className="flex items-center gap-4 mb-1">
          <p className="text-gray-400 font-['Nunito'] text-sm text-center">
            Round {caption.round} of {caption.totalRounds}
          </p>
          {writingTimerActive && !hasConfirmed && (
            <p className={`text-sm font-bold font-['Nunito'] tabular-nums ${writingSecondsLeft <= 5 ? 'text-red-400 animate-pulse' : writingSecondsLeft <= 15 ? 'text-orange-400' : 'text-gray-400'}`}>
              ⏳ {writingSecondsLeft}s
            </p>
          )}
        </div>

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
    </GamePageWrapper>
  );
}
