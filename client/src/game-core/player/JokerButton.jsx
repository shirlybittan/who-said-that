import React from 'react';

export default function JokerButton({ left, active, onClick, noJokersLabel = 'No jokers remaining', activeLabel = 'Joker ON!', useLabel = 'Use Joker', leftLabel = 'left' }) {
  if (!active && left <= 0) {
    return <p className="text-center text-gray-600 font-['Nunito'] text-sm">{noJokersLabel}</p>;
  }

  return (
    <button
      onClick={onClick}
      className="w-full max-w-md py-4 rounded-2xl font-['Fredoka_One'] text-xl transition active:scale-95 border-2"
      style={active
        ? { backgroundColor: '#FF6B6B22', borderColor: '#FF6B6B', color: '#FF6B6B', boxShadow: '0 0 20px #FF6B6B55' }
        : { backgroundColor: '#2D2D44', borderColor: '#6C5CE7', color: '#A29BFE' }}
    >
      {active ? `🔥 ${activeLabel}` : `🃏 ${useLabel} (${left} ${leftLabel})`}
    </button>
  );
}
