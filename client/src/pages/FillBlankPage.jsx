import React, { useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

const VoteCoin = ({ coinIndex, cardIndex }) => (
  <motion.div
    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold select-none flex-shrink-0"
    style={{
      background: 'radial-gradient(circle at 35% 35%, #fef08a, #ca8a04)',
      border: '2px solid #facc15',
      boxShadow: '0 3px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)',
      color: '#713f12',
    }}
    initial={{ y: -64, opacity: 0, scale: 0.3, rotate: -40 }}
    animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
    transition={{
      delay: 0.4 + cardIndex * 0.22 + coinIndex * 0.12,
      type: 'spring', stiffness: 460, damping: 14, mass: 0.6,
    }}
  >★</motion.div>
);

export default function FillBlankPage() {
  const { state, dispatch } = useGame();
  const fitb = state.fitb;
  const sounds = useSounds();
  const [answerText, setAnswerText] = useState('');

  const handleSubmitAnswer = () => {
    const trimmed = answerText.trim();
    if (!trimmed || fitb.hasAnswered) return;
    sounds.answer?.();
    socket.emit('fitb:answer', { code: state.roomCode, text: trimmed });
    dispatch({ type: 'FITB_MARK_ANSWERED', payload: { myAnswer: trimmed } });
    setAnswerText('');
  };

  const handleVote = (id) => {
    if (fitb.hasVoted) return;
    sounds.vote?.();
    socket.emit('fitb:vote', { code: state.roomCode, answerId: id });
    dispatch({ type: 'FITB_MARK_VOTED', payload: { answerId: id } });
  };

  const handleSkipToVote = () => {
    sounds.click?.();
    socket.emit('fitb:skip_to_vote', { code: state.roomCode });
  };

  const handleShowResults = () => {
    sounds.click?.();
    socket.emit('fitb:show_results', { code: state.roomCode });
  };

  const handleNextRound = () => {
    sounds.click?.();
    socket.emit('fitb:next_round', { code: state.roomCode });
  };

  const handleRestart = () => {
    sounds.click?.();
    socket.emit('fitb:restart', { code: state.roomCode });
  };

  // ── Answering phase ────────────────────────────────────────────────────────
  if (fitb.phase === 'answering') {
    return (
      <motion.div
        className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <div className="w-full max-w-md mt-6 mb-4 flex items-center justify-between text-sm text-gray-500 font-['Nunito']">
          <span>Round {fitb.round} / {fitb.totalRounds}</span>
          <span className="text-[#4ECDC4]">Fill in the Blank</span>
        </div>

        <div className="w-full max-w-md bg-[#1A1A2E] rounded-2xl border-2 border-[#4ECDC4]/40 p-6 mb-6">
          <p className="text-xl font-['Fredoka_One'] text-white text-center leading-snug">
            {fitb.question || '…'}
          </p>
        </div>

        {!fitb.hasAnswered ? (
          <div className="w-full max-w-md space-y-3">
            <input
              className="w-full bg-[#1A1A2E] border-2 border-[#2D2D44] focus:border-[#4ECDC4] outline-none rounded-xl px-4 py-3 text-white font-['Nunito'] text-base placeholder-gray-500 transition"
              placeholder="Type your funniest answer…"
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value.slice(0, 120))}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitAnswer()}
              maxLength={120}
              autoFocus
            />
            <button
              onClick={handleSubmitAnswer}
              disabled={!answerText.trim()}
              className="w-full bg-[#4ECDC4] disabled:opacity-40 text-black font-['Fredoka_One'] text-lg py-3 rounded-xl transition hover:bg-[#3DBDB4]"
            >
              Submit
            </button>
          </div>
        ) : (
          <div className="w-full max-w-md bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-5 text-center">
            <p className="text-[#4ECDC4] font-['Fredoka_One'] text-xl mb-2">Answer in! ✓</p>
            <p className="text-gray-400 font-['Nunito'] text-sm">
              Waiting for others… ({fitb.answeredCount}/{fitb.totalAnswerers})
            </p>
          </div>
        )}

        {state.isHost && fitb.hasAnswered && (
          <button
            onClick={handleSkipToVote}
            className="mt-6 text-sm text-gray-400 underline font-['Nunito'] hover:text-white transition"
          >
            Skip to voting
          </button>
        )}

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
        <h1 className="text-2xl font-['Fredoka_One'] text-[#FF6B6B] mt-6 mb-2">Vote for the best!</h1>
        <p className="text-gray-400 font-['Nunito'] text-sm italic text-center mb-6">"{fitb.question}"</p>

        <motion.div
          className="w-full max-w-md space-y-3 mb-6"
          initial="hidden" animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
        >
          {fitb.answers.map((ans) => {
            const isOwn = ans.text === fitb.myAnswer;
            const selected = fitb.myVote === ans.id;
            return (
              <motion.button
                key={ans.id}
                onClick={() => !fitb.hasVoted && !isOwn && handleVote(ans.id)}
                disabled={fitb.hasVoted || isOwn}
                className={`w-full text-left rounded-2xl p-4 border-2 font-['Nunito'] transition
                  ${selected ? 'border-[#FF6B6B] bg-[#FF6B6B]/10' : 'border-[#2D2D44] bg-[#1A1A2E]'}
                  ${fitb.hasVoted || isOwn ? 'cursor-default' : 'hover:border-[#FF6B6B]/60 cursor-pointer'}
                  ${isOwn ? 'opacity-50' : ''}`}
                variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } }}
              >
                <span className="text-white">{ans.text}</span>
                {isOwn && <span className="ml-2 text-xs text-gray-500">(yours)</span>}
                {selected && <span className="ml-2 text-[#FF6B6B]">✓</span>}
              </motion.button>
            );
          })}
        </motion.div>

        {fitb.hasVoted && (
          <p className="text-gray-400 font-['Nunito'] text-sm">
            Waiting for results… ({fitb.voteCount}/{fitb.totalVoters} voted)
          </p>
        )}

        {state.isHost && (
          <button
            onClick={handleShowResults}
            className="mt-4 text-sm text-gray-400 underline font-['Nunito'] hover:text-white transition"
          >
            Show results now
          </button>
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
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FF6B6B] mb-2 mt-4">Results!</h1>
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
                  <span className="text-sm font-['Nunito'] text-gray-400">{ans.votes} {ans.votes === 1 ? 'vote' : 'votes'}</span>
                </div>
                <p className="text-white font-['Nunito'] italic">"{ans.text}"</p>
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
          <h3 className="text-lg font-['Fredoka_One'] text-[#FFE66D] mb-3">Leaderboard</h3>
          {fitb.leaderboard.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-['Nunito'] w-5 text-right">{i + 1}.</span>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="font-['Nunito']">{p.name}</span>
              </div>
              <span className="font-['Fredoka_One'] text-[#FF6B6B]">{p.score} pts</span>
            </div>
          ))}
        </div>

        {state.isHost && fitb.phase === 'results' && (
          <button
            onClick={handleNextRound}
            className="w-full max-w-md bg-[#FF6B6B] text-white font-['Fredoka_One'] text-xl py-4 rounded-2xl hover:bg-[#e05a5a] transition mb-3"
          >
            {fitb.round >= fitb.totalRounds ? 'End Game' : 'Next Round →'}
          </button>
        )}

        {state.isHost && fitb.phase === 'end' && (
          <button
            onClick={handleRestart}
            className="w-full max-w-md bg-[#4ECDC4] text-black font-['Fredoka_One'] text-xl py-4 rounded-2xl hover:bg-[#3DBDB4] transition"
          >
            Play Again
          </button>
        )}
      </motion.div>
    );
  }

  // ── fitbEnd phase (navigated to /fitb-end) but fallback ───────────────────
  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    >
      <p className="text-gray-400 font-['Nunito']">Loading…</p>
    </motion.div>
  );
}
