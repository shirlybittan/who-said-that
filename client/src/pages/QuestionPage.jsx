import React, { useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';

export default function QuestionPage() {
  const { state, dispatch } = useGame();
  const [answer, setAnswer] = useState('');

  const submitAnswer = (e) => {
    e.preventDefault();
    if (!answer.trim()) return;

    socket.emit('submit_answer', { code: state.roomCode, text: answer.trim() });
    dispatch({ type: 'MARK_ANSWERED' });
  };

  const handleSkip = () => {
    socket.emit('skip_question', { code: state.roomCode });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 text-center shadow-lg">
      <div className="mb-8">
        <h3 className="text-xl font-['Fredoka_One'] text-[#FFE66D] uppercase tracking-widest mb-2">
          Round {state.currentRound} of {state.totalRounds}
        </h3>
        <h1 className="text-4xl md:text-5xl font-['Nunito'] font-bold text-white mt-4">
          "{state.currentQuestion}"
        </h1>
      </div>

      {!state.hasAnswered ? (
        <form onSubmit={submitAnswer} className="w-full max-w-md">
          <textarea 
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here..."
            className="w-full p-4 rounded-xl text-black bg-white focus:bg-[#FFF] font-['Nunito'] text-[16px] border-4 border-transparent focus:border-[#FFE66D] focus:outline-none resize-none h-32 mb-6"
            maxLength={150}
          />
          <button 
            type="submit"
            disabled={!answer.trim()}
            className={`w-full font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] uppercase shadow-lg ${answer.trim() ? 'bg-[#FFE66D] text-black hover:bg-[#ffdd33]' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
          >
            Submit Answer
          </button>
        </form>
      ) : (
        <div className="animate-pulse bg-[#1A1A2E] p-8 rounded-2xl border-2 border-[#2D2D44] w-full max-w-md mt-6">
          <p className="text-2xl font-['Fredoka_One'] text-[#FF6B6B] mb-4">Waiting for others...</p>
          <p className="text-lg font-['Nunito'] text-gray-300">
            {state.answeredCount} / {state.totalPlayers || state.players.length} answered
          </p>
        </div>
      )}

      {state.isHost && !state.hasAnswered && (
        <button 
          onClick={handleSkip}
          className="mt-12 text-gray-500 hover:text-white underline font-['Nunito'] transition"
        >
          Skip this question (Host)
        </button>
      )}
    </div>
  );
}
