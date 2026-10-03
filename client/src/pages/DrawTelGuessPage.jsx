import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { translations } from '../locales/translations';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import ReplayCanvas from '../components/game/ReplayCanvas';
import MiniGameWrapper from '../components/MiniGameWrapper.jsx';
import { useMiniGameLifecycle } from '../hooks/useMiniGameLifecycle.js';
import GamePageWrapper from '../components/GamePageWrapper.jsx';

export default function DrawTelGuessPage() {
  const { state, dispatch } = useGame();
  const { dt, roomCode, phaseSecondsLeft } = state;
  const guessTurn = dt.guessTurn;
  const sounds = useSounds();
  const t = translations[state.lang]?.dt || translations.en.dt;
  const [guessText, setGuessText] = useState('');

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
    initialConfirmed: dt.hasGuessed,
  });

  // Capture mutable values in a ref so they don't need to be in the timer's deps
  const autoSubmitRef = useRef({ guessText, guessTurn, roomCode, fallback: t.autoGuess });
  useEffect(() => { autoSubmitRef.current = { guessText, guessTurn, roomCode, fallback: t.autoGuess }; });

  // Reset text when a new guess prompt arrives
  useEffect(() => {
    setGuessText('');
  }, [guessTurn?.promptId]);

  // Use synchronized server timer if available, otherwise fallback
  const syncedSecondsLeft = dt.guessTurn?.secondsLeft ?? dt.guessSecondsLeft ?? 60;
  const secondsLeft = state.phaseTimer?.secondsLeft ?? syncedSecondsLeft;
  
  // Auto-submit when timer reaches zero (uses ref to avoid stale closures)
  useEffect(() => {
    if (secondsLeft > 0 || hasConfirmed) return;
    const { guessText: text, guessTurn: turn, roomCode: code, fallback } = autoSubmitRef.current;
    if (turn) {
      let textToSubmit = text.trim();
      if (!textToSubmit) textToSubmit = fallback;
      sounds.answer?.();
      socket.emit('dt:submit_guess', { code, promptId: turn.promptId, guessText: textToSubmit });
      dispatch({ type: 'DT_MARK_GUESSED' });
    }
    markConfirmed();
  }, [secondsLeft, hasConfirmed, sounds, dispatch, markConfirmed]);

  if (!guessTurn) {
    return (
      <GamePageWrapper>
        <motion.div
          className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p className="text-2xl font-['Fredoka_One'] text-[#FF6B6B] mb-2">{t.getReady}</p>
          <p className="text-gray-400 font-['Nunito'] text-sm">{t.finishingDrawing}</p>
        </motion.div>
      </GamePageWrapper>
    );
  }

  return (
    <GamePageWrapper>
      <motion.div
        className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <div className="w-full max-w-md mt-4 mb-4">
          <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-1">{t.gameName}</p>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-['Fredoka_One'] text-[#FF6B6B]">{t.guessTitle}</h2>
          </div>
          <p className="text-sm text-gray-400 font-['Nunito'] mt-1">
            {(guessTurn.drawerCount !== 1 ? t.drewForYouMany : t.drewForYouOne).replace('{count}', guessTurn.drawerCount)}
          </p>
        </div>

        {/* Final drawing */}
        <div className="w-full max-w-md mb-6 flex justify-center">
          <div className="rounded-2xl border-4 border-[#FF6B6B] overflow-hidden" style={{ width: '100%', maxWidth: 400, aspectRatio: '4/3' }}>
            <ReplayCanvas
              strokes={guessTurn.finalStrokes || []}
              photoData={guessTurn.originalSelfieData || null}
              cssWidth="100%"
            />
          </div>
        </div>

        {/* Reminder of template format */}
        <div className="w-full max-w-md mb-4 bg-[#1A1A2E] rounded-xl border border-[#2D2D44] p-3">
          <p className="text-xs text-gray-500 font-['Nunito']">
            {t.hintA} <span className="text-[#FFE66D] font-bold">{t.hintYou}</span> {t.hintB}
          </p>
        </div>

        <div className="w-full max-w-md">
          <MiniGameWrapper
            hasConfirmed={hasConfirmed}
            onConfirm={confirm}
            onEditResponse={editResponse}
            confirmLabel={t.submitGuess}
            disableConfirm={!canSubmit}
            waitingMessage={t.waitingGuessOthers}
          >
            <input
              type="text"
              value={guessText}
              onChange={(e) => setGuessText(e.target.value.slice(0, 200))}
              placeholder={t.guessPlaceholder}
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
            {hasConfirmed && (
              <div className="mt-2 flex justify-center gap-2">
                {Array.from({ length: dt.totalGuessers }).map((_, i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-full transition-colors duration-300"
                    style={{ backgroundColor: i < dt.guessedCount ? '#FF6B6B' : '#2D2D44' }}
                  />
                ))}
              </div>
            )}
          </MiniGameWrapper>
        </div>
      </motion.div>
    </GamePageWrapper>
  );
}
