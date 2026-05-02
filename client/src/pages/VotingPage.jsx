import React, { useState, useEffect } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import { motion } from 'framer-motion';

export default function VotingPage() {
  const { state, dispatch } = useGame();
  const [timeLeft, setTimeLeft] = useState(15);
  const t = translations[state.lang].voting;
  
  const currentAnswer = state.answers[state.currentAnswerIndex];
  const isRevealed = currentAnswer && !!currentAnswer.playerName;
  const isMyAnswer = currentAnswer && currentAnswer.text === state.myAnswer;

  useEffect(() => {
    setTimeLeft(15);
  }, [state.currentAnswerIndex]);

  useEffect(() => {
    if (!state.isPlaying) return;   // cast screen never auto-votes
    if (state.hasVoted || isRevealed || state.allVotesIn || isMyAnswer) return;
    if (timeLeft <= 0) {
       const eligiblePlayers = state.players.filter(p => p.isConnected && p.id !== state.playerId);
       if (eligiblePlayers.length > 0) {
         const randomPlayer = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
         socket.emit('submit_vote', { code: state.roomCode, votedPlayerId: randomPlayer.id });
         dispatch({ type: 'MARK_VOTED' });
       }
       return;
    }
    const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, state.hasVoted, isRevealed, state.allVotesIn, isMyAnswer, state.players, state.playerId, state.roomCode, dispatch]);

  const handleVote = (votedPlayerId) => {
    if (state.hasVoted) return;
    socket.emit('submit_vote', { code: state.roomCode, votedPlayerId });
    dispatch({ type: 'MARK_VOTED' });
  };

  const handleRevealAnswer = () => {
    socket.emit('reveal_answer', { code: state.roomCode });
  };

  const handleNextAnswer = () => {
    socket.emit('next_answer_request', { code: state.roomCode });
  };

  if (!currentAnswer) return <div className="text-white p-6">{t.loading}</div>;

  return (
    <motion.div
      className="flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-24"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="flex justify-between w-full max-w-md items-center py-4 mb-4">
         <p className="text-xl font-['Fredoka_One'] text-[#FFE66D] uppercase tracking-widest text-center w-full relative">
           {t.answerNum.replace('{current}', state.currentAnswerIndex + 1).replace('{total}', state.answers.length)}
           {!state.hasVoted && !isRevealed && !isMyAnswer && !state.allVotesIn && (
             <span className="absolute right-0 text-red-500 text-lg top-0">⏳ {timeLeft}s</span>
           )}
         </p>
      </div>

      <div className={`bg-[#1A1A2E] w-full max-w-md border border-[#2D2D44] p-8 rounded-3xl shadow-2xl mb-8 flex flex-col justify-center items-center h-48 transition-all duration-700
         ${isRevealed ? "rotate-y-180 bg-[#2D2D44] border-[#FF6B6B]" : ""}`}
         style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
      >
          {!isRevealed ? (
             <h1 className="text-3xl md:text-4xl font-['Nunito'] font-extrabold text-white text-center italic transition-opacity">
               "{currentAnswer.text}"
             </h1>
          ) : (
            <div className="flex flex-col items-center rotate-y-180 transform scale-x-[1] w-full">
              <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest mb-1">{t.writtenBy}</p>
              <h1 className="text-4xl font-['Fredoka_One']" style={{ color: state.players.find(p => p.id === currentAnswer.playerId)?.color || '#FF6B6B' }}>
                {currentAnswer.playerName}
              </h1>
            </div>
          )}
      </div>

      {isRevealed && (
        <div className="w-full max-w-md bg-[#1A1A2E] p-4 flex flex-col items-center justify-center rounded-xl border border-[#2D2D44] mb-8 text-center animate-pulse">
           <p className="text-lg font-['Nunito'] text-white">
             {currentAnswer.votes?.length > 0 ? (
               <span className="text-[#FFE66D] font-['Fredoka_One']">
                  {t.standings}
               </span>
             ) : (
                 <span className="text-gray-400">{t.nobodyVoted}</span>
             )}
           </p>
        </div>
      )}

      {/* Voting Section */}
      {/* Voting buttons — hidden for cast-screen host */}
      <motion.div
        className="w-full max-w-md grid grid-cols-2 gap-4 auto-rows-fr"
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }}
      >
        {state.isPlaying && !state.hasVoted && !isRevealed && !isMyAnswer && state.players.filter(p => p.isConnected && p.isPlaying && p.id !== state.playerId).map(p => (
           <motion.button
             key={p.id}
             onClick={() => handleVote(p.id)}
             variants={{ hidden: { opacity: 0, scale: 0.85 }, show: { opacity: 1, scale: 1, transition: { duration: 0.25 } } }}
             className="flex flex-col items-center space-y-2 bg-[#1A1A2E] hover:bg-[#2D2D44] rounded-2xl py-6 px-4 transition-all duration-200 border-2 border-transparent hover:border-[#FFE66D]"
           >
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-black font-bold shadow-sm text-xl border-2 border-white" style={{ backgroundColor: p.color }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-['Fredoka_One'] text-lg overflow-hidden text-ellipsis whitespace-nowrap w-full text-center">{p.name}</span>
           </motion.button>
        ))}
      </motion.div>

      {!state.hasVoted && !isRevealed && isMyAnswer && !state.allVotesIn && (
        <div className="mt-8 text-center flex flex-col items-center">
           <h3 className="text-2xl font-['Fredoka_One'] text-[#FFE66D] mb-2 animate-pulse">{t.yourAnswer}</h3>
           <p className="text-gray-300 font-['Nunito'] text-lg mt-2">{t.letsSee}</p>
           <p className="text-gray-400 font-['Nunito'] mt-4">{t.waitingVotes.replace('{current}', state.votedCount).replace('{total}', state.totalPlayers || state.players.length - 1)}</p>
        </div>
      )}

      {state.hasVoted && !isRevealed && !state.allVotesIn && (
         <div className="mt-8 text-center animate-bounce">
           <h3 className="text-2xl font-['Fredoka_One'] text-[#FFE66D] mb-2">{t.voteLocked}</h3>
           <p className="text-gray-300 font-['Nunito']">{t.waitingVotes.replace('{current}', state.votedCount).replace('{total}', state.totalPlayers || state.players.length - 1)}</p>
         </div>
      )}

      {state.allVotesIn && !isRevealed && (
         <div className="mt-8 text-center flex flex-col items-center">
           <h3 className="text-2xl font-['Fredoka_One'] text-[#FFE66D] mb-2 animate-pulse">{t.allVotes}</h3>
           {state.isHost ? (
             <button 
               onClick={handleNextAnswer}
               className="bg-[#FFE66D] text-black px-6 py-3 rounded-full font-bold text-xl hover:bg-yellow-400 transform hover:scale-105 transition mt-4"       
             >
               {state.currentAnswerIndex < state.answers.length - 1 ? t.nextAnswer : t.endRound}
             </button>
           ) : (
             <p className="text-gray-300 font-['Nunito'] mt-2">{t.waitingHost}</p>
           )}
         </div>
      )}

      {isRevealed && (
        <div className="mt-8 w-full max-w-md bg-[#1A1A2E] p-4 flex flex-col items-center justify-center rounded-xl border border-[#2D2D44] shadow-lg">
          <h3 className="text-xl font-['Fredoka_One'] text-gray-300 mb-4 border-b border-[#2D2D44] w-full text-center pb-2">{t.standings}</h3>
          <div className="w-full space-y-2 mb-4">
            {[...state.players]
              .sort((a, b) => (state.scores?.[b.id] || 0) - (state.scores?.[a.id] || 0))
              .map((p, idx) => (
                <motion.div
                  key={p.id}
                  className="flex justify-between items-center bg-[#2D2D44] p-2 rounded-lg"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.06, duration: 0.3 }}
                >
                  <div className="flex items-center space-x-2">
                    <span className="w-4 h-4 rounded-full inline-block" style={{ backgroundColor: p.color }}></span>
                    <span className="font-['Fredoka_One'] text-sm">{p.name}</span>
                  </div>
                  <span className="font-bold text-[#FFE66D]">{state.scores?.[p.id] || 0} pts</span>
                </motion.div>
            ))}
          </div>
          {state.isHost ? (
            <button 
               onClick={handleNextAnswer}
               className="w-full bg-[#FFE66D] text-black px-6 py-3 rounded-full font-bold text-lg hover:bg-yellow-400 transform hover:scale-105 transition"
             >
               {state.currentAnswerIndex < state.answers.length - 1 ? t.nextAnswer : t.endRound}
             </button>
          ) : (
            <p className="text-gray-400 text-sm mt-2">{t.waitingHost}</p>
          )}
        </div>
      )}
    </motion.div>
  );
}
