import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';

export default function ThisOrThatEndPage() {
  const { state } = useGame();
  const t = translations[state.lang].tot;
  const { tot, roomCode } = state;

  const leaderboard = tot.leaderboard || [];

  const handlePlayAgain = () => {
    // Navigate back to lobby root (simplest restart — host creates new room)
    window.location.href = '/';
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-12">
      {/* Header */}
      <div className="text-center mb-8 mt-6">
        <h1 className="text-4xl font-['Fredoka_One'] text-[#FFE66D] mb-2">{t.gameOverTitle}</h1>
        <p className="text-gray-400 font-['Nunito']">{t.gameOverSub}</p>
      </div>

      {/* Podium / Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="w-full max-w-lg space-y-3 mb-8">
          {leaderboard.map((entry, i) => (
            <div
              key={entry.playerId}
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
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handlePlayAgain}
        className="w-full max-w-sm bg-[#6C5CE7] hover:bg-[#5a4fd4] text-white font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] shadow-lg uppercase"
      >
        {t.playAgain}
      </button>
    </div>
  );
}
