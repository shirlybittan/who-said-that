import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import { motion } from 'framer-motion';

export default function RoundEndPage() {
  const { state } = useGame();
  const t = translations[state.lang].roundEnd;

  const handleNextRound = () => {
    socket.emit('ready_next_round', { code: state.roomCode });
  };

  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 text-center"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <h1 className="text-4xl font-['Fredoka_One'] text-[#FF6B6B] mb-8">{t.title.replace('{round}', state.currentRound)}</h1>

      <div className="w-full max-w-md bg-[#1A1A2E] p-6 rounded-2xl border border-[#2D2D44] shadow-xl mb-8 text-left space-y-4 max-h-96 overflow-y-auto scrollbar-thin">
        <h3 className="text-2xl font-bold font-['Nunito'] text-[#FFE66D] sticky top-0 bg-[#1A1A2E] pb-2 z-10 flex justify-between items-center">
          <span>{t.summary}</span>
          <span className="text-sm font-normal text-gray-400">
            {state.currentRound} / {state.totalRounds}
          </span>
        </h3>

        {state.answers?.map((ans, idx) => (
          <div key={idx} className="border-b border-[#2D2D44] pb-4 last:border-b-0">
             <p className="text-gray-300 italic mb-2">"{ans.text}"</p>
             <div className="flex items-center space-x-2 mb-1">
               <span className="font-bold w-4 h-4 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: state.players.find(p => p.id === ans.playerId)?.color || 'grey' }} />
               <span className="font-['Fredoka_One']">{ans.playerName}</span>   
             </div>

             {ans.votes?.length > 0 && (
               <div className="mt-3 bg-[#2D2D44]/50 p-3 rounded-lg">
                 <p className="text-sm font-['Nunito'] text-gray-400 mb-2 font-bold uppercase tracking-wider">
                   {t.whoGuessed}
                 </p>
                 <div className="flex flex-wrap gap-2">
                   {ans.votes.filter(v => v.votedForId === ans.playerId).length > 0 ? (
                     ans.votes.filter(v => v.votedForId === ans.playerId).map((v, i) => {
                       const voter = state.players.find(p => p.id === v.voterId);
                       return (
                         <div key={i} className="flex items-center bg-[#1A1A2E] px-2 py-1 rounded border border-[#FFE66D]/30">
                           <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: voter?.color }}></span>
                           <span className="text-xs font-['Fredoka_One'] text-[#FFE66D]">{voter?.name}</span>
                         </div>
                       )
                     })
                   ) : (
                     <span className="text-xs font-['Nunito'] text-gray-500 italic">{t.noOneGuessed}</span>
                   )}
                 </div>
               </div>
             )}
          </div>
        ))}
      </div>

      {state.isHost ? (
        <button
          onClick={handleNextRound}
          className="w-full max-w-md bg-[#FFE66D] hover:bg-[#ffdd33] text-black font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] shadow-lg uppercase"
        >
          {state.currentRound < state.totalRounds ? t.nextRoundBtn : t.finalScoresBtn}
        </button>
      ) : (
        <p className="text-gray-400 font-['Nunito'] mt-2">{t.waitingHost}</p>
      )}
    </motion.div>
  );
}
