import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import VoteCoin from '../components/game/VoteCoin';
import MiniGameWrapper from '../components/MiniGameWrapper.jsx';
import { useMiniGameLifecycle } from '../hooks/useMiniGameLifecycle.js';
import ConfirmVoteCard from '../game-core/player/ConfirmVoteCard';
import VoteLocked from '../components/game/VoteLocked';
import useAutoConfirmPending from '../game-core/hooks/useAutoConfirmPending';
import useSingleFlight from '../game-core/hooks/useSingleFlight';

export default function FillBlankPage() {
  const { state, dispatch } = useGame();
  const fitb = state.fitb;
  const sounds = useSounds();
  const [answerText, setAnswerText] = useState('');
  const [pendingVote, setPendingVote] = useState(null);

  // Server-driven answer timer (from fitb.answerTimeLeft in store)
  const answerTimeLeft = fitb.answerTimeLeft ?? 30;

  const tQuestion = translations[state.lang]?.question || translations.en.question;
  const tf = translations[state.lang]?.fitb || translations.en.fitb;
  const tc = translations[state.lang]?.common || translations.en.common;
  const guard = useSingleFlight(1000);

  const doSubmitAnswer = () => {
    const textToSubmit = answerText.trim() || tQuestion.fallbackAnswer;
    sounds.answer?.();
    socket.emit('fitb:answer', { code: state.roomCode, text: textToSubmit });
    dispatch({ type: 'FITB_MARK_ANSWERED', payload: { myAnswer: textToSubmit } });
  };

  const { hasConfirmed, confirm, editResponse, markConfirmed } = useMiniGameLifecycle({
    onSubmit: doSubmitAnswer,
    resetKey: fitb.question,
    initialConfirmed: fitb.hasAnswered,
  });

  const autoSubmitRef = useRef({ answerText });
  useEffect(() => { autoSubmitRef.current = { answerText }; });

  // Clear the input when a new question arrives
  useEffect(() => { setAnswerText(''); }, [fitb.question]);

  // Guard: don't auto-submit until the timer has actually started ticking.
  // Use fitb.timeLimit so this works for any configured duration, not just 30s.
  const timerWasActiveRef = useRef(false);
  useEffect(() => {
    const limit = fitb.timeLimit || 30;
    if (answerTimeLeft > 0 && answerTimeLeft < limit) timerWasActiveRef.current = true;
  }, [answerTimeLeft, fitb.timeLimit]);

  // On each new question, immediately register the localized fallback as the initial draft
  // so the server always has something to submit if the timer expires.
  useEffect(() => {
    if (!state.roomCode || fitb.phase !== 'answering') return;
    socket.emit('fitb:draft', { code: state.roomCode, text: tQuestion.fallbackAnswer });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitb.question, state.roomCode]);

  // Send draft to server on every keystroke (debounced) so the server has the latest
  // text on timer expiry. Also runs during editing after first submit (hasAnswered=true)
  // so the server stores the updated draft in case of expiry mid-edit.
  useEffect(() => {
    if (hasConfirmed) return;          // confirmed — nothing to draft
    if (fitb.phase !== 'answering') return;
    const timeout = setTimeout(() => {
      socket.emit('fitb:draft', { code: state.roomCode, text: answerText || tQuestion.fallbackAnswer });
    }, 300);
    return () => clearTimeout(timeout);
  }, [answerText, hasConfirmed, fitb.phase, state.roomCode, tQuestion.fallbackAnswer]);

  // Auto-submit when server timer hits 0.
  // Guard: if already submitted (fitb.hasAnswered), skip — editing is the player's choice.
  useEffect(() => {
    if (fitb.hasAnswered) return;     // already submitted — don't overwrite an edit
    if (hasConfirmed) return;
    if (fitb.phase !== 'answering') return;
    if (!timerWasActiveRef.current) return;
    if (answerTimeLeft <= 0) {
      const textToSubmit = autoSubmitRef.current.answerText.trim() || tQuestion.fallbackAnswer;
      socket.emit('fitb:answer', { code: state.roomCode, text: textToSubmit });
      dispatch({ type: 'FITB_MARK_ANSWERED', payload: { myAnswer: textToSubmit } });
      markConfirmed();
    }
  }, [answerTimeLeft, fitb.hasAnswered, hasConfirmed, fitb.phase, state.roomCode, dispatch, markConfirmed, tQuestion.fallbackAnswer]);

  const handleVote = (id) => {
    if (fitb.hasVoted) return;
    sounds.vote?.();
    socket.emit('fitb:vote', { code: state.roomCode, answerId: id });
    dispatch({ type: 'FITB_MARK_VOTED', payload: { answerId: id } });
  };

  const handleVoteConfirm = () => {
    if (pendingVote !== null) {
      handleVote(pendingVote);
      setPendingVote(null);
    }
  };
  useAutoConfirmPending({ pending: pendingVote, hasVoted: fitb.hasVoted, onConfirm: handleVoteConfirm });

  // Host advance on the phone (the TV has its own controls; skipping a timed
  // vote is the shared PhoneHostBar's "Continue").
  const handleNextRound = () => {
    sounds.click?.();
    socket.emit('fitb:next_round', { code: state.roomCode });
  };

  // ── Answering phase ────────────────────────────────────────────────────────
  if (fitb.phase === 'answering') {
    return (
      <motion.div
        className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <div className="w-full max-w-md mt-2 mb-4 flex items-center justify-between text-sm text-gray-500 font-['Nunito']">
          <span>{tc.round.replace('{current}', fitb.round).replace('{total}', fitb.totalRounds)}</span>
          <span className="text-[#4ECDC4]">{tf.title}</span>
        </div>

        <div className="w-full max-w-md bg-[#1A1A2E] rounded-2xl border-2 border-[#4ECDC4]/40 p-6 mb-6">
          <p className="text-xl font-['Fredoka_One'] text-white text-center leading-snug [overflow-wrap:anywhere]">
            {fitb.question || '…'}
          </p>
        </div>

        <div className="w-full max-w-md">
          <MiniGameWrapper
            hasConfirmed={hasConfirmed}
            onConfirm={confirm}
            onEditResponse={editResponse}
            confirmLabel={fitb.hasAnswered ? tQuestion.updateBtn : tc.submit}
            editLabel={tQuestion.editBtn}
            value={answerText}
            isHost={state.isHost}
          >
            <input
              className="w-full bg-[#1A1A2E] border-2 border-[#2D2D44] focus:border-[#4ECDC4] outline-none rounded-xl px-4 py-3 text-white font-['Nunito'] text-base placeholder-gray-500 transition"
              placeholder={tf.placeholder}
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value.slice(0, 120))}
              onKeyDown={(e) => e.key === 'Enter' && answerText.trim() && confirm()}
              maxLength={120}
              autoFocus={!hasConfirmed}
            />
          </MiniGameWrapper>
        </div>

        {/* Progress dots */}
        <div className="mt-6 flex gap-2">
          {Array.from({ length: fitb.totalAnswerers || 0 }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${i < fitb.answeredCount ? 'bg-[#4ECDC4]' : 'bg-[#2D2D44]'}`}
            />
          ))}
        </div>
      </motion.div>
    );
  }

  // ── Voting phase ───────────────────────────────────────────────────────────
  if (fitb.phase === 'voting') {
    return (
      <motion.div
        className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <h1 className="text-2xl font-['Fredoka_One'] text-[#FF6B6B] mt-2 mb-2">{tf.votePrompt}</h1>
        <p className="text-gray-400 font-['Nunito'] text-sm italic text-center mb-6">"{fitb.question}"</p>

        <motion.div
          className="w-full max-w-md space-y-3 mb-6"
          initial="hidden" animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
        >
          {fitb.answers.map((ans) => {
            const isOwn = fitb.myAnswerIndex >= 0 && ans.id === fitb.myAnswerIndex;
            const isSelected = pendingVote === ans.id || fitb.myVote === ans.id;

            return (
              <motion.button
                key={ans.id}
                onClick={() => !fitb.hasVoted && !isOwn && setPendingVote(ans.id)}
                disabled={fitb.hasVoted || isOwn}
                className={`w-full text-start rounded-2xl p-4 border-2 font-['Nunito'] transition
                  ${isSelected ? 'border-[#4ECDC4] bg-[#4ECDC4]/10' : 'border-[#2D2D44] bg-[#1A1A2E]'}
                  ${fitb.hasVoted || isOwn ? 'cursor-default opacity-50' : 'hover:border-[#4ECDC4]/60 cursor-pointer'}
                  ${isOwn ? 'opacity-40' : ''}`}
                variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } }}
              >
                <span className="text-white [overflow-wrap:anywhere]">{ans.text}</span>
                {isOwn && <span className="ms-2 text-xs text-gray-500">{tc.yours}</span>}
                {isSelected && <span className="ms-2 text-[#4ECDC4]">✓</span>}
              </motion.button>
            );
          })}
        </motion.div>

        {pendingVote !== null && !fitb.hasVoted && (() => {
          const selectedAns = fitb.answers.find(a => a.id === pendingVote);
          const selectedIndex = fitb.answers.findIndex(a => a.id === pendingVote);
          return (
            <ConfirmVoteCard
              vote={{
                label: selectedAns?.text || '',
                badge: String.fromCharCode(65 + selectedIndex)
              }}
              onConfirm={handleVoteConfirm}
              onChange={() => setPendingVote(null)}
            />
          );
        })()}

        {fitb.hasVoted && (
          <VoteLocked voteCount={fitb.voteCount} totalVoters={fitb.totalVoters} />
        )}


      </motion.div>
    );
  }

  // ── Results phase ──────────────────────────────────────────────────────────
  if (fitb.phase === 'results' || fitb.phase === 'end') {
    const sorted = [...fitb.answers].sort((a, b) => b.votes - a.votes);
    const maxVotes = sorted[0]?.votes ?? 0;

    return (
      <motion.div
        className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FF6B6B] mb-2 mt-2">{tf.results}</h1>
        <p className="text-gray-400 font-['Nunito'] italic text-center mb-6">"{fitb.question}"</p>

        <motion.div
          className="w-full max-w-md space-y-3 mb-6"
          initial="hidden" animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } } }}
        >
          {sorted.map((ans, ansIdx) => {
            const isWinner = ans.votes === maxVotes && maxVotes > 0;
            return (
              <motion.div
                key={ans.playerId || ansIdx}
                className={`rounded-2xl p-4 border-2 ${isWinner ? 'border-[#FFE66D] bg-[#FFE66D]/10' : 'border-[#2D2D44] bg-[#1A1A2E]'}`}
                variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: ans.playerColor || '#aaa' }} />
                    <span className="font-['Fredoka_One'] text-sm">{ans.playerName || 'Player'}</span>
                    {isWinner && <span className="text-lg">⭐</span>}
                  </div>
                  <span className="text-sm font-['Nunito'] text-gray-400">{ans.votes} {ans.votes === 1 ? tc.vote : tc.votes}</span>
                </div>
                <p className="text-white font-['Nunito'] italic [overflow-wrap:anywhere]">"{ans.text}"</p>
                {ans.votes > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Array.from({ length: Math.min(ans.votes, 10) }).map((_, j) => (
                      <VoteCoin key={j} coinIndex={j} cardIndex={ansIdx} />
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>

        {/* Leaderboard */}
        <div className="w-full max-w-md bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-4 mb-6">
          <h3 className="text-lg font-['Fredoka_One'] text-[#FFE66D] mb-3">{tc.leaderboard}</h3>
          {fitb.leaderboard.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-['Nunito'] w-5 text-end">{i + 1}.</span>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="font-['Nunito']">{p.name}</span>
              </div>
              <span className="font-['Fredoka_One'] text-[#FF6B6B]">{p.score} {tc.pts}</span>
            </div>
          ))}
        </div>

        {fitb.phase === 'results' && (state.isHost ? (
          <button data-testid="fitb-next-round" onClick={guard(handleNextRound)} className="w-full max-w-md py-4 rounded-2xl font-['Fredoka_One'] text-xl bg-[#FFE66D] text-black active:scale-95 transition">
            {fitb.round >= fitb.totalRounds ? tc.finish : tc.nextRound}
          </button>
        ) : (
          <p className="text-gray-400 font-['Nunito'] animate-pulse">{tc.waitingHost}</p>
        ))}




      </motion.div>
    );
  }

  // ── fitbEnd phase (navigated to /fitb-end) but fallback ───────────────────
  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    >
      <p className="text-gray-400 font-['Nunito']">{tc.loading}</p>
    </motion.div>
  );
}
