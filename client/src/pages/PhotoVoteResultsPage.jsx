import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';

export default function PhotoVoteResultsPage() {
  const { state } = useGame();
  const pv = state.photoVote;
  const isHost = state.isHost;
  const isEnded = pv.phase === 'ended';

  const modeColor = pv.subType === 'photoassoc' ? '#A29BFE' : '#FDCB6E';

  const handleNext = () => {
    if (isEnded) {
      socket.emit('photovote:restart', { code: state.roomCode });
    } else {
      socket.emit('photovote:next_round', { code: state.roomCode });
    }
  };

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <h1 className="text-3xl font-['Fredoka_One'] mt-6 mb-1" style={{ color: modeColor }}>
        {isEnded ? '🏆 Final Results!' : `Round ${pv.round} Results`}
      </h1>

      {pv.prompt && (
        <div className="w-full max-w-xs bg-[#FFE66D]/10 rounded-2xl px-4 py-2 mb-4 text-center">
          <p className="text-[#FFE66D] font-['Nunito'] text-sm font-semibold">{pv.prompt}</p>
        </div>
      )}

      <div className="w-full max-w-sm flex flex-col gap-3 mb-6">
        {(pv.voteResults || []).map((r, i) => (
          <motion.div
            key={r.playerId}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`flex items-center gap-3 rounded-2xl p-3 border ${
              r.isWinner ? 'border-yellow-400 bg-yellow-400/10' : 'border-gray-700 bg-[#1A1A2E]'
            }`}
          >
            <span className="text-2xl">{r.isWinner ? '🥇' : i === 1 ? '🥈' : '📸'}</span>
            {r.photoData ? (
              <img src={r.photoData} className="w-12 h-12 rounded-xl object-cover" alt={r.playerName} />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gray-700 flex items-center justify-center text-2xl">🤷</div>
            )}
            <div className="flex-1">
              <p className="font-['Fredoka_One'] text-white">{r.playerName}</p>
              <p className="text-xs text-gray-400 font-['Nunito']">{r.voteCount} vote{r.voteCount !== 1 ? 's' : ''}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {isEnded && (
        <div className="w-full max-w-sm mb-4">
          <h2 className="text-xl font-['Fredoka_One'] text-[#FFE66D] mb-3 text-center">Scoreboard</h2>
          {Object.entries(pv.scores || {})
            .sort(([, a], [, b]) => b - a)
            .map(([id, pts], i) => {
              const p = state.players.find(pl => pl.id === id);
              return (
                <div key={id} className="flex justify-between items-center bg-[#1A1A2E] rounded-xl px-4 py-2 mb-2">
                  <span className="font-['Nunito'] text-white">{i + 1}. {p?.name || id}</span>
                  <span className="font-['Fredoka_One']" style={{ color: modeColor }}>{pts} pts</span>
                </div>
              );
            })}
        </div>
      )}

      {isHost && (
        <button
          onClick={handleNext}
          style={{ backgroundColor: modeColor }}
          className="w-full max-w-sm py-4 rounded-2xl font-['Fredoka_One'] text-xl text-white mt-2"
        >
          {isEnded ? 'Back to Lobby 🏠' : `Next Round (${pv.round + 1}/${pv.totalRounds}) ▶️`}
        </button>
      )}
      {!isHost && (
        <p className="text-gray-500 font-['Nunito'] text-sm mt-4">Waiting for host…</p>
      )}
    </motion.div>
  );
}
