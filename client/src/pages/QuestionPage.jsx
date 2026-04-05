import React, { useState, useEffect } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';

export default function QuestionPage() {
  const { state, dispatch } = useGame();
  const t = translations[state.lang].question;
  const [answer, setAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [hasVotedSkip, setHasVotedSkip] = useState(false);

  useEffect(() => {
    setTimeLeft(60);
    setHasVotedSkip(false);
  }, [state.currentQuestion]);

  useEffect(() => {
    if (state.hasAnswered) return;
    if (timeLeft <= 0) {
      if (!state.hasAnswered) {
        const defaultAnswer = "I couldn't think of anything funny in time! 🕒";
        socket.emit('submit_answer', { code: state.roomCode, text: defaultAnswer });
        dispatch({ type: 'MARK_ANSWERED', payload: { myAnswer: defaultAnswer } });
      }
      return;
    }
    const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, state.hasAnswered, state.roomCode, dispatch]);

  const submitAnswer = (e) => {
    e.preventDefault();
    if (!answer.trim()) return;

    socket.emit('submit_answer', { code: state.roomCode, text: answer.trim() });
    dispatch({ type: 'MARK_ANSWERED', payload: { myAnswer: answer.trim() } });
  };

  const handleSkip = () => {
    socket.emit('skip_question', { code: state.roomCode });
  };

  const handleVoteSkip = () => {
    if (hasVotedSkip) return;
    socket.emit('vote_skip_question', { code: state.roomCode });
    setHasVotedSkip(true);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 text-center shadow-lg">
      <div className="mb-8">
        <h3 className="text-xl font-['Fredoka_One'] text-[#FFE66D] uppercase tracking-widest mb-2">
          {t.round} {state.currentRound} {t.of} {state.totalRounds}
        </h3>
        <p className="text-xl font-bold font-['Nunito'] text-red-400 mb-2">⏳ {timeLeft}s</p>
          <h1 className="text-4xl md:text-5xl font-['Nunito'] font-bold text-white mt-4">
          "{typeof state.currentQuestion === 'string' ? state.currentQuestion : (state.currentQuestion?.[state.lang] || state.currentQuestion?.en)}"
        </h1>
      </div>

      {!state.hasAnswered ? (
        <form onSubmit={submitAnswer} className="w-full max-w-md">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={t.typeAnswerPlaceholder}
            className="w-full p-4 rounded-xl text-black bg-white focus:bg-[#FFF] font-['Nunito'] text-[16px] border-4 border-transparent focus:border-[#FFE66D] focus:outline-none resize-none h-32 mb-6"
            maxLength={150}
          />
          <button
            type="submit"
            disabled={!answer.trim()}
            className={`w-full font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] uppercase shadow-lg ${answer.trim() ? 'bg-[#FFE66D] text-black hover:bg-[#ffdd33]' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
          >
            {t.submitBtn}
          </button>
        </form>
      ) : (
        <div className="animate-pulse bg-[#1A1A2E] p-8 rounded-2xl border-2 border-[#2D2D44] w-full max-w-md mt-6">
          <p className="text-2xl font-['Fredoka_One'] text-[#FF6B6B] mb-4">{t.waiting}</p>
          <p className="text-lg font-['Nunito'] text-gray-300">
            {state.answeredCount} / {state.totalPlayers || state.players.length} {t.answered}
          </p>
        </div>
      )}

      {state.isHost && !state.hasAnswered && (
        <button
          onClick={handleSkip}
          className="mt-12 text-gray-500 hover:text-white underline font-['Nunito'] transition block w-full"
        >
          {t.skipHost}
        </button>
      )}
      {!state.hasAnswered && (
        <button
          onClick={handleVoteSkip}
          disabled={hasVotedSkip}
          className={`mt-4 text-gray-400 font-['Nunito'] transition ${hasVotedSkip ? 'opacity-50 cursor-not-allowed' : 'hover:text-white underline block w-full'}`}
        >
          {hasVotedSkip ? t.votedSkip : t.voteSkip}
        </button>
      )}
    </div>
  );
}
