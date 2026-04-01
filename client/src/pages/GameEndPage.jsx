import React, { useEffect, useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import Confetti from 'react-confetti';

export default function GameEndPage() {
  const { state } = useGame();
  const [windowDimension, setWindowDimension] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => setWindowDimension({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePlayAgain = () => {
    // We could emit a play_again event or just reload to start over
    window.location.reload();
  };

  const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);
  const winner = sortedPlayers[0];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 text-center">
      <Confetti width={windowDimension.width} height={windowDimension.height} />
      
      <h1 className="text-5xl font-['Fredoka_One'] text-[#FFE66D] mb-8 animate-bounce">
        Game Over!
      </h1>
      
      <div className="w-full max-w-md bg-[#1A1A2E] p-8 rounded-2xl border border-[#2D2D44] shadow-2xl mb-8 relative overflow-hidden">
        {winner && (
          <div className="mb-8 p-6 bg-[#2D2D44] rounded-xl text-center transform hover:scale-105 transition">
            <h2 className="text-2xl font-bold font-['Nunito'] text-[#4ECDC4] mb-2">Winner! 🏆</h2>
            <div className="text-4xl font-['Fredoka_One'] mb-2" style={{ color: winner.color }}>{winner.name}</div>
            <div className="text-xl font-bold">{winner.score} Points</div>
          </div>
        )}

        <h3 className="text-xl font-bold font-['Nunito'] text-gray-400 mb-4 border-b border-[#2D2D44] pb-2">Final Standings</h3>
        
        <div className="space-y-3">
          {sortedPlayers.map((player, idx) => (
            <div key={player.id} className="flex items-center justify-between bg-[#2D2D44]/50 p-3 rounded-lg">
              <div className="flex items-center space-x-3">
                <span className="text-lg font-bold text-gray-500 w-6">{idx + 1}.</span>
                <span className="w-4 h-4 rounded-full" style={{ backgroundColor: player.color }}></span>
                <span className="font-['Fredoka_One'] text-lg">{player.name}</span>
              </div>
              <span className="font-bold text-[#FF6B6B]">{player.score} pts</span>
            </div>
          ))}
        </div>
      </div>

      <button 
        onClick={handlePlayAgain}
        className="w-full max-w-md bg-[#FFE66D] hover:bg-[#ffdd33] text-black font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] shadow-[0_0_15px_rgba(255,230,109,0.3)] uppercase tracking-wider"
      >
        Play Again! 🎮
      </button>
    </div>
  );
}