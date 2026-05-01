import React, { useState, useEffect } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import Confetti from 'react-confetti';
import { motion } from 'framer-motion';

export default function ThisOrThatEndPage() {
  const { state } = useGame();
  const t = translations[state.lang].tot;
  const { tot, roomCode } = state;

  const leaderboard = tot.leaderboard || [];

  const [win, setWin] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const fn = () => setWin({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const handlePlayAgain = () => {
    window.location.href = '/';
  };

  return (
    <motion.div
      className="flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-12"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <Confetti width={win.width} height={win.height} recycle={false} numberOfPieces={300} />
      {/* Header */}
      <div className="text-center mb-8 mt-6">
        <h1 className="text-4xl font-['Fredoka_One'] text-[#FFE66D] mb-2">{t.gameOverTitle}</h1>
        <p className="text-gray-400 font-['Nunito']">{t.gameOverSub}</p>
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <motion.div
          className="w-full max-w-lg space-y-3 mb-8"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } } }}
        >
          {leaderboard.map((entry, i) => (
            <motion.div
              key={entry.playerId}
              variants={{ hidden: { opacity: 0, x: -30 }, show: { opacity: 1, x: 0, transition: { duration: 0.35 } } }}
              className={`flex items-center gap-4 rounded-2xl p-4 border-2 transition-all ${
                i === 0
                  ? 'bg-[#FFE66D]/10 border-[#FFE66D] shadow-[0_0_20px_rgba(255,230,109,0.2)]'
                  : 'bg-[#1A1A2E] border-[#2D2D44]'
              }`}
            >
              {/* Rank */}
              <span className="font-['Fredoka_One'] text-2xl w-8 text-center">
                {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
              </span>

              {/* Avatar */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-black font-bold flex-shrink-0 border-2 border-white/20"
                style={{ backgroundColor: entry.color }}
              >
                {entry.name.charAt(0).toUpperCase()}
              </div>

              {/* Name + title */}
              <div className="flex-1 min-w-0">
                <p className={`font-['Fredoka_One'] text-lg truncate ${i === 0 ? 'text-[#FFE66D]' : 'text-white'}`}>
                  {entry.name}
                </p>
                {entry.title && (
                  <p className="text-gray-400 font-['Nunito'] text-xs">{entry.title}</p>
                )}
              </div>

              {/* Score */}
              <div className="text-right">
                <span className={`font-['Fredoka_One'] text-2xl ${i === 0 ? 'text-[#FFE66D]' : 'text-white'}`}>
                  {entry.score}
                </span>
                <span className="text-gray-400 text-sm ml-1 font-['Nunito']">{t.pts}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <button
        onClick={handlePlayAgain}
        className="w-full max-w-sm bg-[#6C5CE7] hover:bg-[#5a4fd4] text-white font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] shadow-lg uppercase"
      >
        {t.playAgain}
      </button>
    </motion.div>
  );
}
