import React, { useEffect, useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { translations } from '../locales/translations';
import { socket } from '../socket';
import Confetti from 'react-confetti';

export default function MostLikelyToEndPage() {
  const { state } = useGame();
  const t = translations[state.lang].mlt;
  const { mlt } = state;

  const [windowDimension, setWindowDimension] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [podiumVisible, setPodiumVisible] = useState(false);

  useEffect(() => {
    const handleResize = () =>
      setWindowDimension({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setPodiumVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  const handlePlayAgain = () => {
    socket.emit('mlt:restart', { code: state.roomCode });
  };

  const top3 = mlt.leaderboard.slice(0, 3);
  // Podium order: 2nd, 1st, 3rd
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  const podiumHeights = { 0: 'h-24', 1: 'h-36', 2: 'h-16' }; // heights for 2nd/1st/3rd
  const podiumColors = { 0: '#C0C0C0', 1: '#FFE66D', 2: '#CD7F32' };
  const podiumPositions = [1, 0, 2]; // indices in top3 for left/center/right

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-24">
      <Confetti width={windowDimension.width} height={windowDimension.height} />

      <h1 className="text-5xl font-['Fredoka_One'] text-[#FFE66D] mb-2 mt-4 animate-bounce">
        {t.gameOverTitle}
      </h1>
      <p className="text-gray-400 font-['Nunito'] text-sm mb-8">{t.gameOverSub}</p>

      {/* Podium */}
      {top3.length > 0 && (
        <div className="w-full max-w-md mb-8">
          <div className="flex items-end justify-center gap-3 px-4">
            {podiumOrder.map((player, slotIdx) => {
              const realIdx = podiumPositions[slotIdx];
              const medal = ['🥇', '🥈', '🥉'][realIdx] || '';
              const barH = ['h-24', 'h-36', 'h-16'][slotIdx];
              const col = [podiumColors[1], podiumColors[0], podiumColors[2]][slotIdx];
              const nameColor = realIdx === 0 ? '#FFE66D' : realIdx === 1 ? '#C0C0C0' : '#CD7F32';
              return (
                <div key={player.playerId} className="flex flex-col items-center flex-1">
                  {/* Avatar + name above podium */}
                  <span className="text-xl mb-1">{medal}</span>
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-black font-bold text-lg border-3 mb-1"
                    style={{ backgroundColor: player.color, border: `3px solid ${col}` }}
                  >
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <p className="font-['Fredoka_One'] text-sm mb-1 text-center leading-tight" style={{ color: nameColor }}>
                    {player.name}
                  </p>
                  <p className="font-['Nunito'] text-xs text-gray-400 mb-2">{player.score} {t.pts}</p>
                  {/* Podium block */}
                  <div
                    className={`w-full rounded-t-xl flex items-center justify-center font-['Fredoka_One'] text-2xl transition-all duration-700 ease-out ${podiumVisible ? barH : 'h-0'}`}
                    style={{ backgroundColor: col + '33', border: `2px solid ${col}`, borderBottom: 'none', overflow: 'hidden' }}
                  >
                    {realIdx + 1}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Base line */}
          <div className="h-1 w-full rounded-full mt-0" style={{ backgroundColor: '#2D2D44' }} />
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

      {state.isHost ? (
        <button
          onClick={handlePlayAgain}
          className="w-full max-w-md bg-[#FFE66D] hover:bg-[#ffdd33] text-black font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] shadow-[0_0_15px_rgba(255,230,109,0.3)] uppercase tracking-wider"
        >
          {t.playAgain}
        </button>
      ) : (
        <p className="text-gray-500 font-['Nunito'] text-sm">
          Waiting for host to start a new game...
        </p>
      )}
    </div>
  );
}
