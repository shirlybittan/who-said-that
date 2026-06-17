import React from 'react';
import { useGame } from '../store/gameStore';

export default function LanguageSwitcher() {
  const { state, dispatch } = useGame();

  const handleLangChange = (e) => {
    dispatch({ type: 'SET_LANG', payload: e.target.value });
  };

  // Do not block interaction if hidden
  return (
    <div className="fixed top-4 right-4 z-[9999]">
      <select 
        value={state.lang || 'en'} 
        onChange={handleLangChange}
        className="bg-[#2D2D44] text-white border border-[#4ECDC4] rounded-md px-2 py-1 text-sm outline-none cursor-pointer hover:bg-[#1A1A2E] transition-colors shadow-lg"
      >
        <option value="en">🇬🇧 EN</option>
        <option value="fr">🇫🇷 FR</option>
        <option value="he">🇮🇱 HE</option>
      </select>
    </div>
  );
}
