import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../store/gameStore.jsx';
import { translations } from '../locales/translations';
import Confetti from 'react-confetti';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import GameSwitcher from '../components/GameSwitcher.jsx';

export default function GameEndPage() {
  const { state } = useGame();
  const navigate = useNavigate();
  const [windowDimension, setWindowDimension] = useState({ width: window.innerWidth, height: window.innerHeight });
  const sounds = useSounds();

  const t = translations[state.lang].gameEnd;

  useEffect(() => { sounds.gameEnd(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleResize = () => setWindowDimension({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePlayAgain = () => {
    sounds.click();
    navigate('/');
  };

  const sortedPlayers = state.players.filter(p => p.isPlaying).sort((a, b) => (state.scores[b.id] || 0) - (state.scores[a.id] || 0));   
  const winner = sortedPlayers[0];

  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 text-center"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <Confetti width={windowDimension.width} height={windowDimension.height} />

      <h1 className="text-5xl font-['Fredoka_One'] text-[#FFE66D] mb-8 animate-bounce">
        {t.title}
      </h1>

      <div className="w-full max-w-md bg-[#1A1A2E] p-8 rounded-2xl border border-[#2D2D44] shadow-2xl mb-8 relative overflow-hidden">
        {winner && (
          <div className="mb-8 p-6 bg-[#2D2D44] rounded-xl text-center transform hover:scale-105 transition">
            <h2 className="text-2xl font-bold font-['Nunito'] text-[#4ECDC4] mb-2">{t.winner}</h2>
            <div className="text-4xl font-['Fredoka_One'] mb-2" style={{ color: winner.color }}>{winner.name}</div>
            <div className="text-xl font-bold">{t.points.replace('{score}', state.scores[winner.id] || 0)}</div>      
          </div>
        )}

        <h3 className="text-xl font-bold font-['Nunito'] text-gray-400 mb-4 border-b border-[#2D2D44] pb-2">{t.finalStandings}</h3>

        <div className="space-y-3">
          {sortedPlayers.map((player, idx) => (
            <div key={player.id} className="flex items-center justify-between bg-[#2D2D44]/50 p-3 rounded-lg">
              <div className="flex items-center space-x-3">
                <span className="text-lg font-bold text-gray-500 w-6">{idx + 1}.</span>
                <span className="w-4 h-4 rounded-full" style={{ backgroundColor: player.color }}></span>
                <span className="font-['Fredoka_One'] text-lg">{player.name}</span>
              </div>
              <span className="font-bold text-[#FF6B6B]">{t.pts.replace('{score}', state.scores[player.id] || 0)}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handlePlayAgain}
        className="w-full max-w-md bg-[#FFE66D] hover:bg-[#ffdd33] text-black font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] shadow-[0_0_15px_rgba(255,230,109,0.3)] uppercase tracking-wider"
      >
        {t.playAgain}
      </button>
      <div className="w-full max-w-md mt-3">
        <GameSwitcher currentGameType={state.gameType} />
      </div>
      <button
        onClick={() => navigate('/')}
        className="w-full max-w-md mt-3 border border-[#2D2D44] text-gray-400 font-bold py-3 px-6 rounded-xl transition transform active:scale-95 text-base font-['Fredoka_One'] hover:border-gray-500 hover:text-gray-300"
      >
        🏠 Main Menu
      </button>
    </motion.div>
  );
}
