import React, { useEffect, useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { translations } from '../locales/translations';
import Confetti from 'react-confetti';

export default function MostLikelyToEndPage() {
  const { state } = useGame();
  const t = translations[state.lang].mlt;
  const { mlt } = state;

  const [windowDimension, setWindowDimension] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () =>
      setWindowDimension({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePlayAgain = () => {
    window.location.reload();
  };

  const topPlayer = mlt.leaderboard[0];

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-24">
      <Confetti width={windowDimension.width} height={windowDimension.height} />

      <h1 className="text-5xl font-['Fredoka_One'] text-[#FFE66D] mb-2 mt-4 animate-bounce">
        {t.gameOverTitle}
      </h1>
      <p className="text-gray-400 font-['Nunito'] text-sm mb-8">{t.gameOverSub}</p>

      {/* Winner spotlight */}
      {topPlayer && (
        <div className="w-full max-w-md bg-[#1A1A2E] border-2 border-[#FFE66D] rounded-2xl p-6 text-center mb-6 shadow-[0_0_20px_rgba(255,230,109,0.2)]">
          <p className="text-sm font-['Nunito'] text-[#FFE66D] uppercase tracking-widest mb-2">{t.topScorer}</p>
          <div
            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-black font-bold text-2xl border-4 border-[#FFE66D] mb-3"
            style={{ backgroundColor: topPlayer.color }}
          >
            {topPlayer.name.charAt(0).toUpperCase()}
          </div>
          <p className="text-3xl font-['Fredoka_One'] text-white mb-1">{topPlayer.name}</p>
          <p className="text-[#4ECDC4] font-['Nunito'] font-bold">{topPlayer.title}</p>
          <p className="text-gray-400 font-['Nunito'] text-sm mt-1">
            {topPlayer.score} {t.pts}
          </p>
        </div>
      )}

      {/* Full leaderboard */}
      <div className="w-full max-w-md bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-4 mb-8">
        <h3 className="text-lg font-['Fredoka_One'] text-gray-400 mb-4 border-b border-[#2D2D44] pb-2 uppercase tracking-wide">
          {t.finalStandings}
        </h3>
        <div className="space-y-3">
          {mlt.leaderboard.map((player, idx) => (
            <div
              key={player.playerId}
              className="flex items-center justify-between bg-[#2D2D44]/50 p-3 rounded-xl"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-gray-500 w-6">{idx + 1}.</span>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-black font-bold text-sm border-2 border-white/20"
                  style={{ backgroundColor: player.color }}
                >
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="font-['Fredoka_One'] text-base leading-tight">{player.name}</span>
                  <span className="text-xs text-[#4ECDC4] font-['Nunito']">{player.title}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-bold text-[#FF6B6B] font-['Fredoka_One']">{player.score}</span>
                <span className="text-gray-500 text-xs ml-1 font-['Nunito']">{t.pts}</span>
                {player.wins > 0 && (
                  <p className="text-xs text-[#FFE66D] font-['Nunito']">
                    👑 {player.wins} {player.wins === 1 ? t.win : t.wins}
                  </p>
                )}
              </div>
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
    </div>
  );
}
