import React, { useEffect, useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';

export default function MostLikelyToResultsPage() {
  const { state } = useGame();
  const t = translations[state.lang].mlt;
  const { mlt, isHost, roomCode } = state;

  const [revealed, setRevealed] = useState(false);

  // Animate bars in after a short delay
  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleNextRound = () => {
    socket.emit('mlt:next_round', { code: roomCode });
  };

  const isLastRound = mlt.round >= mlt.totalRounds;

  const maxCount = mlt.results[0]?.count || 1;

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-32">
      {/* Round header */}
      <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest mb-3">
        {t.round} {mlt.round} {t.of} {mlt.totalRounds}
      </p>

      {/* Prompt recap */}
      <div className="w-full max-w-lg bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5 mb-6 text-center">
        <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-1">{t.promptLabel}</p>
        <h2 className="text-xl font-['Fredoka_One'] text-[#FFE66D]">{mlt.prompt}</h2>
      </div>

      {/* Results */}
      <div className="w-full max-w-lg space-y-4 mb-6">
        {mlt.results.map((player, idx) => {
          const isWinner = player.playerId === mlt.winnerId;
          const barWidth = revealed && maxCount > 0 ? `${(player.count / maxCount) * 100}%` : '0%';

          return (
            <div
              key={player.playerId}
              className={`rounded-2xl p-4 border-2 transition-all duration-500 ${
                isWinner
                  ? 'border-[#FFE66D] bg-[#1A1A2E] shadow-[0_0_20px_rgba(255,230,109,0.25)]'
                  : 'border-[#2D2D44] bg-[#1A1A2E]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  {isWinner && <span className="text-lg">👑</span>}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-black font-bold flex-shrink-0 border-2 border-white/20"
                    style={{ backgroundColor: player.color }}
                  >
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className={`font-['Fredoka_One'] text-lg ${isWinner ? 'text-[#FFE66D]' : 'text-white'}`}>
                    {player.name}
                  </span>
                </div>
                <div className="text-right">
                  <span className={`font-['Fredoka_One'] text-2xl ${isWinner ? 'text-[#FFE66D]' : 'text-white'}`}>
                    {player.count}
                  </span>
                  <span className="text-gray-400 text-sm ml-1 font-['Nunito']">
                    {player.count === 1 ? t.vote : t.votes}
                  </span>
                  {player.pct > 0 && (
                    <span className="text-gray-500 text-xs ml-2 font-['Nunito']">({player.pct}%)</span>
                  )}
                </div>
              </div>

              {/* Vote bar */}
              <div className="w-full bg-[#2D2D44] rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-700 ease-out ${isWinner ? 'bg-[#FFE66D]' : 'bg-[#4ECDC4]'}`}
                  style={{ width: barWidth }}
                />
              </div>
            </div>
          );
        })}

        {(!mlt.winnerId || mlt.results.every(r => r.count === 0)) && (
          <p className="text-center text-gray-500 italic font-['Nunito']">{t.noVotesCast}</p>
        )}
      </div>

      {/* Host controls */}
      {isHost && (
        <div className="fixed bottom-0 w-full bg-[#1A1A2E] p-4 border-t-2 border-[#FFE66D] flex justify-center shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-50">
          <button
            onClick={handleNextRound}
            className="w-full max-w-sm bg-[#FFE66D] hover:bg-[#ffdd33] text-black font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] uppercase tracking-wide shadow-lg"
          >
            {isLastRound ? t.seeScores : t.nextRound}
          </button>
        </div>
      )}

      {!isHost && (
        <p className="text-gray-500 text-sm font-['Nunito'] italic animate-pulse mt-4">
          {t.waitingHost}
        </p>
      )}
    </div>
  );
}
