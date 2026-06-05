import React from 'react';

export default function PlayerStatusBubbles({ players }) {
  return (
    <div className="bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
      <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-4">Voting</p>
      <div className="flex flex-wrap gap-4 justify-center">
        {players.map((player) => (
          <div key={player.id} className="flex flex-col items-center gap-1">
            <div className="relative w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl text-black border-2 border-white/20" style={{ backgroundColor: player.color }}>
              {player.name?.charAt(0).toUpperCase()}
              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0D0D1A] ${player.status === 'voted' ? 'bg-green-400' : 'bg-gray-500'}`} />
            </div>
            <span className="text-xs font-['Nunito'] text-gray-300 text-center leading-tight max-w-[60px] truncate">{player.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
