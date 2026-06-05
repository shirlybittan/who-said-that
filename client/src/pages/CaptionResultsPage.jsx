import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import GamePageWrapper from '../components/GamePageWrapper.jsx';

export default function CaptionResultsPage() {
  const { state } = useGame();
  const caption = state.caption;
  const isHost = state.isHost;
  const isEnded = caption.phase === 'ended';

  const handleNext = () => {
    if (isEnded) {
      socket.emit('caption:restart', { code: state.roomCode });
    } else {
      socket.emit('caption:next_round', { code: state.roomCode });
    }
  };

  return (
    <GamePageWrapper>
      <motion.div
        className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8] mt-6 mb-1">
          {isEnded ? '🏆 Final Results!' : `Round ${caption.round} Results`}
        </h1>

        {caption.featuredPhotoData && (
          <img
            src={caption.featuredPhotoData}
            className="w-40 h-40 object-cover rounded-2xl border-2 border-[#FD79A8] my-4"
            alt="featured selfie"
          />
        )}

        {caption.prompt && (
          <div className="w-full max-w-xs bg-[#FFE66D]/10 rounded-2xl px-4 py-2 mb-4 text-center">
            <p className="text-[#FFE66D] font-['Nunito'] text-sm">{caption.prompt}</p>
          </div>
        )}

        <div className="w-full max-w-sm flex flex-col gap-3 mb-6">
          {(caption.captionResults || []).map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-start gap-3 bg-[#1A1A2E] rounded-2xl p-4"
            >
              <span className="text-2xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '📝'}</span>
              <div className="flex-1">
                <p className="text-white font-['Nunito'] text-sm">{c.text}</p>
                <p className="text-gray-400 font-['Nunito'] text-xs mt-1">
                  {c.playerName} — {c.voteCount} vote{c.voteCount !== 1 ? 's' : ''}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {isEnded && (
          <div className="w-full max-w-sm mb-4">
            <h2 className="text-xl font-['Fredoka_One'] text-[#FFE66D] mb-3 text-center">Scoreboard</h2>
            {Object.entries(caption.scores || {})
              .sort(([, a], [, b]) => b - a)
              .map(([id, pts], i) => {
                const p = state.players.find(pl => pl.id === id);
                return (
                  <div key={id} className="flex justify-between items-center bg-[#1A1A2E] rounded-xl px-4 py-2 mb-2">
                    <span className="font-['Nunito'] text-white">{i + 1}. {p?.name || id}</span>
                    <span className="font-['Fredoka_One'] text-[#FD79A8]">{pts} pts</span>
                  </div>
                );
              })}
          </div>
        )}

        {isHost && (
          <button
            onClick={handleNext}
            className="w-full max-w-sm py-4 rounded-2xl font-['Fredoka_One'] text-xl bg-[#FD79A8] text-white mt-2"
          >
            {isEnded ? 'Back to Lobby 🏠' : `Next Round (${caption.round + 1}/${caption.totalRounds}) ▶️`}
          </button>
        )}
        {!isHost && (
          <p className="text-gray-500 font-['Nunito'] text-sm mt-4">Waiting for host…</p>
        )}
      </motion.div>
    </GamePageWrapper>
  );
}
