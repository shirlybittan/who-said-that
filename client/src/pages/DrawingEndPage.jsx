import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import Confetti from 'react-confetti';
import { motion } from 'framer-motion';

export default function DrawingEndPage() {
  const { state, dispatch } = useGame();
  const navigate = useNavigate();
  const { draw, isHost, roomCode, lang } = state;
  const t = translations[lang].draw;

  const leaderboard = draw.leaderboard || [];
  const medals = ['🥇', '🥈', '🥉'];

  const [win, setWin] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const fn = () => setWin({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const handlePlayAgain = () => {
    socket.emit('draw:restart', { code: roomCode });
  };

  const handleMainMenu = () => {
    navigate('/');
  };

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <Confetti width={win.width} height={win.height} recycle={false} numberOfPieces={280} />
      <h1 className="text-4xl font-['Fredoka_One'] text-[#FFE66D] mt-6 mb-2">{t.finalTitle}</h1>
      <p className="text-base text-gray-400 font-['Nunito'] mb-8">🎨 Sketch It!</p>

      <motion.div
        className="w-full max-w-sm space-y-3 mb-10"
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } }}
      >
        {leaderboard.map((p, i) => (
          <motion.div
            key={p.id}
            variants={{ hidden: { opacity: 0, x: -30 }, show: { opacity: 1, x: 0, transition: { duration: 0.35 } } }}
            className={`flex items-center justify-between rounded-2xl px-5 py-4 border ${
              i === 0
                ? 'bg-[#2E2000] border-[#FFE66D] shadow-[0_0_18px_#FFE66D50]'
                : 'bg-[#1A1A2E] border-[#2D2D44]'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl w-8">{medals[i] || `#${i + 1}`}</span>
              <div className="w-6 h-6 rounded-full border border-white/20 flex-shrink-0" style={{ backgroundColor: p.color }} />
              <span className={`font-['Fredoka_One'] text-lg ${i === 0 ? 'text-[#FFE66D]' : 'text-white'}`}>
                {p.name}
              </span>
            </div>
            <span className={`font-['Fredoka_One'] text-xl ${i === 0 ? 'text-[#FFE66D]' : 'text-[#C39BD3]'}`}>
              {p.score} {t.pts}
            </span>
          </motion.div>
        ))}
      </motion.div>

      <div className="w-full max-w-sm space-y-3">
        {isHost && (
          <button
            onClick={handlePlayAgain}
            className="w-full py-4 rounded-2xl bg-[#C39BD3] text-black font-['Fredoka_One'] text-xl hover:bg-[#b089c2] transition"
          >
            🔄 {t.playAgain}
          </button>
        )}
        <button
          onClick={handleMainMenu}
          className="w-full py-3 rounded-2xl bg-[#1A1A2E] text-white font-['Fredoka_One'] text-lg border border-[#2D2D44] hover:border-[#C39BD3] transition"
        >
          🏠 Main Menu
        </button>
      </div>
    </motion.div>
  );
}
