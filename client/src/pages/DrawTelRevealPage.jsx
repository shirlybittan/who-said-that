import React, { useState, useEffect } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion, AnimatePresence } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import ReplayCanvas from '../components/game/ReplayCanvas';

/**
 * Reveal step layout (fixed 3 steps, independent of N drawing steps):
 *  0  → Context + prompt: target chip + selfie + template text + full prompt + author
 *  1  → All drawings grid: all N drawings side-by-side with selfie background
 *  2  → Guess + Vote combined: before/after comparison + prompt + target's guess + vote + 30s countdown (auto-advances)
 */
const DT_VOTE_SECS = 30;

export default function DrawTelRevealPage() {
  const { state, dispatch } = useGame();
  const { dt, roomCode, isHost, playerId } = state;
  const reveal = dt.reveal;
  const sounds = useSounds();

  const step = reveal.step ?? 0;
  const isVoteStep = step === 2;

  // Local vote countdown — starts when entering the vote step
  const [voteSecondsLeft, setVoteSecondsLeft] = useState(reveal.voteSecondsLeft ?? DT_VOTE_SECS);
  useEffect(() => {
    if (!isVoteStep) return;
    setVoteSecondsLeft(reveal.voteSecondsLeft ?? DT_VOTE_SECS);
    const id = setInterval(() => setVoteSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVoteStep]);

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

  const drawingSteps = reveal.drawingSteps || [];

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* Progress bar */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <span className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest">📞 Draw Telephone</span>
        <span className="text-xs text-[#FF6B6B] font-['Nunito']">
          Chain {(reveal.promptIndex ?? 0) + 1} / {reveal.totalPrompts}
        </span>
      </div>

      {/* Step indicator dots */}
      <div className="flex gap-2 mb-5">
        {[0, 1, 2].map(s => (
          <div
            key={s}
            className={`rounded-full transition-all duration-300 ${step === s ? 'w-5 h-2.5 bg-[#FF6B6B]' : s < step ? 'w-2.5 h-2.5 bg-[#FF6B6B]/50' : 'w-2.5 h-2.5 bg-[#2D2D44]'}`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ── Step 0: Context + Prompt merged ── */}
        {step === 0 && (
          <motion.div
            key="ctx"
            className="w-full max-w-md space-y-4"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          >
            {/* Target chip + selfie */}
            <div className="bg-[#1A1A2E] rounded-2xl border-2 border-[#FF6B6B]/40 p-5">
              <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest text-center mb-3">Someone wrote a prompt about…</p>
              <div className="flex justify-center mb-4">
                <div
                  className="inline-block px-5 py-2 rounded-2xl text-2xl font-['Fredoka_One']"
                  style={{ backgroundColor: reveal.targetColor || '#FF6B6B', color: '#fff' }}
                >
                  {reveal.targetName || '???'}
                </div>
              </div>
              {reveal.originalSelfieData ? (
                <div className="rounded-xl overflow-hidden border-2 border-[#FF6B6B]/30 bg-[#0D0D1A]" style={{ aspectRatio: '4/3' }}>
                  <img
                    src={reveal.originalSelfieData}
                    alt={`${reveal.targetName}'s selfie`}
                    className="w-full h-full object-contain"
                    draggable={false}
                  />
                </div>
              ) : (
                <div className="rounded-xl bg-[#0D0D1A] border-2 border-[#2D2D44] flex items-center justify-center" style={{ aspectRatio: '4/3' }}>
                  <span className="text-gray-600 font-['Nunito']">No selfie</span>
                </div>
              )}
            </div>
            {/* Full prompt */}
            <div className="bg-[#1A1A2E] rounded-2xl border-2 border-[#FFE66D]/40 p-5 text-center">
              <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-2">The prompt</p>
              <p className="text-2xl font-['Fredoka_One'] text-[#FFE66D] leading-snug mb-3">
                "{reveal.finalText || ''}"
              </p>
              <div className="border-t border-[#2D2D44] pt-2">
                <p className="text-sm text-gray-400 font-['Nunito']">
                  Written by <span className="text-white font-semibold">{reveal.authorName}</span>
                  {' '}about <span style={{ color: reveal.targetColor || '#FF6B6B' }} className="font-semibold">{reveal.targetName}</span>
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Step 1: All drawings grid ── */}
        {step === 1 && (
          <motion.div
            key="drawings"
            className="w-full max-w-2xl"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          >
            <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest text-center mb-3">
              How it evolved… ({drawingSteps.length} drawing{drawingSteps.length !== 1 ? 's' : ''})
            </p>
            <div className={`grid gap-3 ${drawingSteps.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' : drawingSteps.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {drawingSteps.map((step_, i) => (
                <div key={i} className="bg-[#1A1A2E] rounded-xl border border-[#C39BD3]/30 overflow-hidden">
                  <div className="rounded-t-xl overflow-hidden" style={{ aspectRatio: '4/3' }}>
                    <ReplayCanvas
                      strokes={step_.strokes || []}
                      photoData={reveal.originalSelfieData || null}
                      cssWidth="100%"
                    />
                  </div>
                  <div className="p-1.5 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: step_.playerColor || '#C39BD3' }} />
                    <span className="text-xs text-gray-300 font-['Nunito'] truncate">{step_.playerName}</span>
                    <span className="text-xs text-gray-600 font-['Nunito'] ml-auto">#{i + 1}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Step 2: Guess + Vote combined ── */}
        {step === 2 && (
          <motion.div
            key="vote"
            className="w-full max-w-md space-y-3"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          >
            {/* Vote countdown */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest">How close was the guess?</p>
              <span
                className="text-sm font-['Nunito'] tabular-nums"
                style={{ color: voteSecondsLeft <= 10 ? '#FF6B6B' : '#9CA3AF' }}
              >
                ⏱ {voteSecondsLeft}s
              </span>
            </div>

            {/* Before / after comparison */}
            <div className="bg-[#1A1A2E] rounded-2xl border-2 border-[#C39BD3]/40 p-3">
              <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-2 text-center">Original selfie → Final drawing</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <div className="rounded-lg overflow-hidden border border-[#C39BD3]/30" style={{ aspectRatio: '4/3' }}>
                    {reveal.originalSelfieData ? (
                      <img
                        src={reveal.originalSelfieData}
                        alt="Original"
                        className="w-full h-full object-contain bg-[#0D0D1A]"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full bg-[#0D0D1A] flex items-center justify-center">
                        <span className="text-gray-600 text-xs">No selfie</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-center text-gray-500 font-['Nunito'] mt-1">Original</p>
                </div>
                <div className="flex-1">
                  <div className="rounded-lg overflow-hidden border border-[#C39BD3]/30" style={{ aspectRatio: '4/3' }}>
                    <ReplayCanvas
                      strokes={drawingSteps[drawingSteps.length - 1]?.strokes || []}
                      photoData={reveal.originalSelfieData || null}
                      cssWidth="100%"
                    />
                  </div>
                  <p className="text-xs text-center text-gray-500 font-['Nunito'] mt-1">Final drawing</p>
                </div>
              </div>
            </div>

            {/* Original prompt + guess */}
            <div className="bg-[#1A1A2E] rounded-2xl border-2 border-[#FF6B6B]/30 p-4 text-center">
              <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-1">Original prompt</p>
              <p className="text-lg font-['Fredoka_One'] text-[#FFE66D] leading-snug">"{reveal.finalText}"</p>
              <div className="mt-2 pt-2 border-t border-[#2D2D44]">
                <p className="text-xs text-gray-500 font-['Nunito'] mb-0.5">
                  <span style={{ color: reveal.targetColor || '#A8E6CF' }}>{reveal.targetName}</span> guessed…
                </p>
                <p className="text-base font-['Fredoka_One'] text-[#A8E6CF]">
                  "{reveal.guessText || '…'}"
                </p>
              </div>
            </div>

            {/* Vote buttons */}
            {!reveal.hasVoted && playerId !== reveal.targetPlayerId ? (
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
            ) : (
              <p className="text-center text-gray-400 font-['Nunito'] text-sm">
                {playerId === reveal.targetPlayerId
                  ? "It's your guess! Others are voting."
                  : 'Vote locked in ✓'}
              </p>
            )}

            {/* Vote tally */}
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
                <p className="text-xs text-gray-500 font-['Nunito'] mt-1">
                  {reveal.voteCount}/{reveal.totalVoters} voted
                </p>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* Host controls — hidden on the vote step (server auto-advances) */}
      {isHost && !isVoteStep && (
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
