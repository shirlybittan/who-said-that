import React, { useState, useEffect } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import ReplayCanvas from '../components/game/ReplayCanvas';
import MiniGameWrapper from '../components/MiniGameWrapper.jsx';
import { useMiniGameLifecycle } from '../hooks/useMiniGameLifecycle.js';

export default function DrawTelGuessPage() {
  const { state, dispatch } = useGame();
  const { dt, roomCode } = state;
  const guessTurn = dt.guessTurn;
  const sounds = useSounds();
  const [guessText, setGuessText] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(dt.guessSecondsLeft || 60);

  const canSubmit = guessText.trim().length > 0;

  const doSubmit = () => {
    if (!canSubmit || !guessTurn) return;
    sounds.answer?.();
    socket.emit('dt:submit_guess', { code: roomCode, promptId: guessTurn.promptId, guessText: guessText.trim() });
    dispatch({ type: 'DT_MARK_GUESSED' });
  };

  const { hasConfirmed, confirm, editResponse, markConfirmed } = useMiniGameLifecycle({
    onSubmit: doSubmit,
    resetKey: guessTurn?.promptId,
  });

  useEffect(() => {
    if (hasConfirmed) return;
    if (secondsLeft <= 0) {
      if (guessTurn) {
        let textToSubmit = guessText.trim();
        if (!textToSubmit) textToSubmit = "I had absolutely no idea 🤦‍♂️";
        sounds.answer?.();
        socket.emit('dt:submit_guess', { code: roomCode, promptId: guessTurn.promptId, guessText: textToSubmit });
        dispatch({ type: 'DT_MARK_GUESSED' });
      }
      markConfirmed();
      return;
    }
    const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft, hasConfirmed, guessText, guessTurn, roomCode, sounds, dispatch, markConfirmed]);

  if (!guessTurn) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      >
        <p className="text-2xl font-['Fredoka_One'] text-[#FF6B6B] mb-2">Get ready to guess!</p>
        <p className="text-gray-400 font-['Nunito'] text-sm">Drawing is being finished…</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="w-full max-w-md mt-4 mb-4">
        <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-1">📞 Draw Telephone</p>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-['Fredoka_One'] text-[#FF6B6B]">What's the original prompt?</h2>
          <span className="text-sm font-['Nunito'] tabular-nums ml-3" style={{ color: secondsLeft <= 10 ? '#FF6B6B' : '#9CA3AF' }}>
            ⏱ {secondsLeft}s
          </span>
        </div>
        <p className="text-sm text-gray-400 font-['Nunito'] mt-1">
          {guessTurn.drawerCount} player{guessTurn.drawerCount !== 1 ? 's' : ''} drew this for you. What do you think the original sentence was?
        </p>
      </div>

      {/* Final drawing */}
      <div className="w-full max-w-md mb-6 flex justify-center">
        <div className="rounded-2xl border-4 border-[#FF6B6B] overflow-hidden" style={{ width: '100%', maxWidth: 400, aspectRatio: '4/3' }}>
          <ReplayCanvas
            strokes={guessTurn.finalStrokes || []}
            photoData={guessTurn.originalSelfieData || null}
            cssWidth={400}
          />
        </div>
      </div>

      {/* Reminder of template format */}
      <div className="w-full max-w-md mb-4 bg-[#1A1A2E] rounded-xl border border-[#2D2D44] p-3">
        <p className="text-xs text-gray-500 font-['Nunito']">
          Hint: the original prompt was about <span className="text-[#FFE66D] font-bold">you</span> — it included your name somewhere.
        </p>
      </div>

      {hasConfirmed ? (
        <div className="w-full max-w-md bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-6 text-center shadow-lg">
          <p className="text-[#FF6B6B] font-['Fredoka_One'] text-2xl mb-2">Guess submitted! ✓</p>
          <p className="text-gray-400 font-['Nunito'] text-sm">
            Waiting for others… ({dt.guessedCount}/{dt.totalGuessers})
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {Array.from({ length: dt.totalGuessers }).map((_, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full transition-colors duration-300"
                style={{ backgroundColor: i < dt.guessedCount ? '#FF6B6B' : '#2D2D44' }}
              />
            ))}
          </div>
          <button
            onClick={editResponse}
            className="w-full py-3 mt-6 rounded-2xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF6B6B] hover:text-[#FF6B6B] transition active:scale-95"
          >
            ✏️ Edit Guess
          </button>
        </div>
      ) : (
        <div className="w-full max-w-md">
          <MiniGameWrapper
            hasConfirmed={hasConfirmed}
            onConfirm={confirm}
            onEditResponse={editResponse}
            confirmLabel="Submit Guess"
            disableConfirm={!canSubmit}
          >
            <input
              type="text"
              value={guessText}
              onChange={(e) => setGuessText(e.target.value.slice(0, 200))}
              placeholder="What was the original prompt?"
              className="w-full bg-[#1A1A2E] border-2 border-[#2D2D44] focus:border-[#FF6B6B] outline-none rounded-xl px-4 py-3 text-white font-['Nunito'] text-base placeholder-gray-600 transition"
              maxLength={200}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirm();
                }
              }}
            />
          </MiniGameWrapper>
        </div>
      )}
    </motion.div>
  );
}
