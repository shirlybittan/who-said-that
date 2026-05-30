import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion, AnimatePresence } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import ReplayCanvas from '../components/game/ReplayCanvas';

/**
 * Reveal step logic (N = totalDrawingSteps):
 *  0         → template text (with [name] placeholder)
 *  1         → target player revealed
 *  2         → original selfie shown (NEW)
 *  3         → final text (name substituted)
 *  4 to 3+N  → drawing steps one by one (cumulative, on selfie background)
 *  4+N       → guess text shown
 *  5+N       → voting (correct / close / wrong)
 */
export default function DrawTelRevealPage() {
  const { state, dispatch } = useGame();
  const { dt, roomCode, isHost, playerId } = state;
  const reveal = dt.reveal;
  const sounds = useSounds();

  const N = reveal.drawingSteps?.length ?? 0;
  const step = reveal.step ?? 0;

  // Determine current drawing step index (0-based): steps 4 to 3+N
  const drawingStepIndex = step >= 4 && step <= 3 + N ? step - 4 : null;
  const currentDrawingStep = drawingStepIndex !== null ? reveal.drawingSteps?.[drawingStepIndex] : null;

  const isGuessStep = step === 4 + N;
  const isVotingStep = step === 5 + N;

  const handleNext = () => {
    sounds.click?.();
    socket.emit('dt:reveal_next', { code: roomCode });
  };

  const handleVote = (vote) => {
    if (reveal.hasVoted) return;
    sounds.vote?.();
    socket.emit('dt:vote', { code: roomCode, promptId: reveal.promptId, vote });
    dispatch({ type: 'DT_MARK_VOTED' });
  };

  const handleEndGame = () => {
    sounds.click?.();
    socket.emit('dt:end_game', { code: roomCode });
  };

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* Progress */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <span className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest">📞 Draw Telephone</span>
        <span className="text-xs text-[#FF6B6B] font-['Nunito']">
          Prompt {(reveal.promptIndex ?? 0) + 1} / {reveal.totalPrompts}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {/* Step 0: Template text */}
        {step === 0 && (
          <motion.div
            key="step0"
            className="w-full max-w-md"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          >
            <div className="bg-[#1A1A2E] rounded-2xl border-2 border-[#FF6B6B]/40 p-6 text-center">
              <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-3">Someone wrote a prompt about…</p>
              <p className="text-2xl font-['Fredoka_One'] text-white leading-snug">
                {(reveal.templateText || '').replace('[name]', '[name]')}
              </p>
            </div>
          </motion.div>
        )}

        {/* Step 1: Target player */}
        {step === 1 && (
          <motion.div
            key="step1"
            className="w-full max-w-md"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          >
            <div className="bg-[#1A1A2E] rounded-2xl border-2 border-[#FF6B6B]/40 p-6 text-center">
              <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-3">The target player was…</p>
              <div
                className="inline-block px-6 py-3 rounded-2xl text-3xl font-['Fredoka_One']"
                style={{ backgroundColor: reveal.targetColor || '#FF6B6B', color: '#fff' }}
              >
                {reveal.targetName || '???'}
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 2: Original selfie */}
        {step === 2 && (
          <motion.div
            key="step2"
            className="w-full max-w-md"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          >
            <div className="bg-[#1A1A2E] rounded-2xl border-2 border-[#FF6B6B]/40 p-4 text-center">
              <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-3">
                Here's {reveal.targetName}'s selfie…
              </p>
              {reveal.originalSelfieData ? (
                <div className="rounded-xl overflow-hidden border-2 border-[#FF6B6B]/30" style={{ aspectRatio: '4/3' }}>
                  <img
                    src={reveal.originalSelfieData}
                    alt={`${reveal.targetName}'s selfie`}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
              ) : (
                <p className="text-gray-400 font-['Nunito'] text-sm italic">No selfie available</p>
              )}
            </div>
          </motion.div>
        )}

        {/* Step 3: Final text */}
        {step === 3 && (
          <motion.div
            key="step2"
            className="w-full max-w-md"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          >
            <div className="bg-[#1A1A2E] rounded-2xl border-2 border-[#FFE66D]/40 p-6 text-center">
              <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-3">The full prompt was…</p>
              <p className="text-2xl font-['Fredoka_One'] text-[#FFE66D] leading-snug">
                {reveal.finalText || ''}
              </p>
              <p className="text-xs text-gray-500 mt-2 font-['Nunito']">
                Written by <span className="text-gray-300">{reveal.authorName}</span>
              </p>
            </div>
          </motion.div>
        )}

        {/* Steps 4 to 3+N: Drawing steps with selfie background */}
        {drawingStepIndex !== null && (
          <motion.div
            key={`draw-${drawingStepIndex}`}
            className="w-full max-w-md"
            initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
          >
            <div className="bg-[#1A1A2E] rounded-2xl border-2 border-[#C39BD3]/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest">
                  Drawing step {drawingStepIndex + 1} of {N}
                </p>
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: currentDrawingStep?.playerColor || '#C39BD3' }}
                  />
                  <span className="text-sm text-gray-300 font-['Nunito']">
                    {currentDrawingStep?.playerName || ''}
                  </span>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden border-2 border-[#C39BD3]/30" style={{ aspectRatio: '4/3' }}>
                <ReplayCanvas
                  strokes={currentDrawingStep?.strokes || []}
                  photoData={reveal.originalSelfieData || null}
                  cssWidth={400}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 3+N: Guess text */}
        {isGuessStep && (
          <motion.div
            key="guess"
            className="w-full max-w-md"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          >
            <div className="bg-[#1A1A2E] rounded-2xl border-2 border-[#A8E6CF]/40 p-6 text-center">
              <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-2">
                <span style={{ color: reveal.targetColor || '#A8E6CF' }}>{reveal.targetName}</span> guessed…
              </p>
              <p className="text-2xl font-['Fredoka_One'] text-[#A8E6CF] leading-snug">
                "{reveal.guessText || '…'}"
              </p>
            </div>
          </motion.div>
        )}

        {/* Step 5+N: Voting */}
        {isVotingStep && (
          <motion.div
            key="vote"
            className="w-full max-w-md space-y-4"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          >
            {/* Side-by-side comparison: original selfie vs final drawing */}
            {reveal.originalSelfieData && (
              <div className="bg-[#1A1A2E] rounded-2xl border-2 border-[#C39BD3]/40 p-3">
                <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-2 text-center">Before vs After</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="text-xs text-center text-gray-500 font-['Nunito'] mb-1">Original selfie</p>
                    <div className="rounded-lg overflow-hidden border border-[#C39BD3]/30" style={{ aspectRatio: '4/3' }}>
                      <img
                        src={reveal.originalSelfieData}
                        alt="Original"
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-center text-gray-500 font-['Nunito'] mb-1">Final drawing</p>
                    <div className="rounded-lg overflow-hidden border border-[#C39BD3]/30" style={{ aspectRatio: '4/3' }}>
                      <ReplayCanvas
                        strokes={reveal.drawingSteps?.[N - 1]?.strokes || []}
                        photoData={reveal.originalSelfieData}
                        cssWidth={200}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-[#1A1A2E] rounded-2xl border-2 border-[#FF6B6B]/30 p-4 text-center">
              <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-1">Original prompt</p>
              <p className="text-lg font-['Fredoka_One'] text-[#FFE66D]">{reveal.finalText}</p>
              <p className="text-sm text-gray-400 font-['Nunito'] mt-2">Guess: "{reveal.guessText}"</p>
            </div>

            {!reveal.hasVoted && playerId !== reveal.targetPlayerId ? (
              <div className="space-y-2">
                <p className="text-center text-sm text-gray-400 font-['Nunito']">How close was the guess?</p>
                <div className="flex gap-3">
                  {[
                    { vote: 'correct', label: '🎯 Correct', color: '#22C55E' },
                    { vote: 'close', label: '🤏 Close', color: '#EAB308' },
                    { vote: 'wrong', label: '❌ Wrong', color: '#EF4444' },
                  ].map(({ vote, label, color }) => (
                    <button
                      key={vote}
                      onClick={() => handleVote(vote)}
                      className="flex-1 py-3 rounded-xl font-['Fredoka_One'] text-white transition hover:opacity-80"
                      style={{ backgroundColor: color }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : reveal.hasVoted || playerId === reveal.targetPlayerId ? (
              <p className="text-center text-gray-400 font-['Nunito'] text-sm">
                {playerId === reveal.targetPlayerId ? "It's your guess! Others are voting." : 'Vote locked in ✓'}
              </p>
            ) : null}

            {/* Vote counts */}
            <div className="bg-[#1A1A2E] rounded-xl border border-[#2D2D44] p-3 flex justify-around text-center">
              <div>
                <p className="text-xl font-['Fredoka_One'] text-[#22C55E]">{reveal.correctCount ?? 0}</p>
                <p className="text-xs text-gray-500 font-['Nunito']">Correct</p>
              </div>
              <div>
                <p className="text-xl font-['Fredoka_One'] text-[#EAB308]">{reveal.closeCount ?? 0}</p>
                <p className="text-xs text-gray-500 font-['Nunito']">Close</p>
              </div>
              <div>
                <p className="text-xl font-['Fredoka_One'] text-[#EF4444]">{reveal.wrongCount ?? 0}</p>
                <p className="text-xs text-gray-500 font-['Nunito']">Wrong</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-['Nunito'] mt-1">{reveal.voteCount}/{reveal.totalVoters} voted</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Host controls */}
      {isHost && (
        <div className="w-full max-w-md mt-6 space-y-2">
          <button
            onClick={handleNext}
            className="w-full bg-[#FF6B6B] text-white font-['Fredoka_One'] text-lg py-3 rounded-xl transition hover:bg-[#ff5252]"
          >
            Next →
          </button>
          <button
            onClick={handleEndGame}
            className="w-full text-sm text-gray-500 underline font-['Nunito'] hover:text-white transition"
          >
            End Game
          </button>
        </div>
      )}
    </motion.div>
  );
}
