import React, { useState } from 'react';
import { socket } from '../socket';
import { useGame } from '../store/gameStore.jsx';

const AVAILABLE_GAMES = [
  { id: 'most-likely-to',    label: '👑 Most Likely To',   accent: '#4ECDC4' },
  { id: 'who-said-that',     label: '🤔 Who Said That?',   accent: '#FFE66D' },
  { id: 'situational',       label: '💭 Situational',      accent: '#6C5CE7' },
  { id: 'this-or-that',      label: '🆚 This or That',     accent: '#A29BFE' },
  { id: 'drawing',           label: '🎨 Sketch It!',       accent: '#C39BD3' },
  { id: 'fill-in-the-blank', label: '✏️ Fill in the Blank', accent: '#55EFC4' },
  { id: 'selfie-roast',      label: '📸 Selfie Artist',    accent: '#FD79A8' },
  { id: 'mixed',             label: '🎲 Mixed Pack',       accent: '#FDCB6E' },
];

export default function GameSwitcher({ currentGameType }) {
  const { state } = useGame();
  const [open, setOpen] = useState(false);

  if (!state.isHost) return null;

  const handleSelect = (gameType) => {
    socket.emit('change_game', { code: state.roomCode, newGameType: gameType });
    setOpen(false);
  };

  return (
    <div className="w-full max-w-md">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full py-3 rounded-2xl bg-[#1A1A2E] text-white font-['Fredoka_One'] text-lg border border-[#2D2D44] hover:border-[#FFE66D] hover:text-[#FFE66D] transition"
        >
          🎮 Switch Game
        </button>
      ) : (
        <div className="w-full rounded-2xl bg-[#1A1A2E] border border-[#2D2D44] p-4 space-y-2">
          <p className="text-gray-400 font-['Nunito'] text-sm text-center mb-3">Pick a game — same room &amp; players</p>
          {AVAILABLE_GAMES.filter(g => g.id !== currentGameType).map(g => (
            <button
              key={g.id}
              onClick={() => handleSelect(g.id)}
              className="w-full py-3 rounded-xl font-['Fredoka_One'] text-lg text-black transition active:scale-95 hover:opacity-90"
              style={{ backgroundColor: g.accent }}
            >
              {g.label}
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="w-full py-2 rounded-xl border border-[#2D2D44] text-gray-400 font-['Nunito'] text-sm hover:border-gray-500 transition"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
