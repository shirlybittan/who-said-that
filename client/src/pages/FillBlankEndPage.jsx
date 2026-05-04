import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import Confetti from 'react-confetti';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import GameSwitcher from '../components/GameSwitcher.jsx';

export default function FillBlankEndPage() {
  const { state } = useGame();
  const navigate = useNavigate();
  const { fitb, isHost, roomCode } = state;
  const sounds = useSounds();

  useEffect(() => { sounds.gameEnd?.(); }, []);

  const leaderboard = fitb.leaderboard || [];
  const medals = ['🥇', '🥈', '🥉'];

  const [win, setWin] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const fn = () => setWin({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const handlePlayAgain = () => socket.emit('fitb:restart', { code: roomCode });
  const handleMainMenu = () => navigate('/');

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <Confetti width={win.width} height={win.height} recycle={false} numberOfPieces={280} />
      <h1 className="text-4xl font-['Fredoka_One'] text-[#FFE66D] mt-6 mb-2">Game Over!</h1>
      <p className="text-base text-gray-400 font-['Nunito'] mb-8">✏️ Fill in the Blank</p>

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
              i === 0 ? 'bg-[#2E2000] border-[#FFE66D] shadow-[0_0_18px_#FFE66D50]' : 'bg-[#1A1A2E] border-[#2D2D44]'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{medals[i] || `${i + 1}.`}</span>
              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="font-['Fredoka_One'] text-lg">{p.name}</span>
            </div>
            <span className={`font-['Fredoka_One'] text-xl ${i === 0 ? 'text-[#FFE66D]' : 'text-[#FF6B6B]'}`}>
              {p.score} pts
            </span>
          </motion.div>
        ))}
      </motion.div>

      {isHost && (
        <button
          onClick={handlePlayAgain}
          className="w-full max-w-sm bg-[#4ECDC4] text-black font-['Fredoka_One'] text-xl py-4 rounded-2xl hover:bg-[#3DBDB4] transition mb-3"
        >
          Play Again
        </button>
      )}
      <div className="w-full max-w-sm mb-3">
        <GameSwitcher currentGameType={state.gameType} />
      </div>
      <button
        onClick={handleMainMenu}
        className="w-full max-w-sm bg-[#1A1A2E] border border-[#2D2D44] text-gray-300 font-['Fredoka_One'] text-xl py-4 rounded-2xl hover:bg-[#2D2D44] transition"
      >
        Main Menu
      </button>
    </motion.div>
  );
}
