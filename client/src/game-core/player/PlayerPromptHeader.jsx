import React from 'react';

export default function PlayerPromptHeader({ gameName, roundLabel, promptLabel, prompt }) {
  return (
    <>
      {gameName ? (
        <p className="text-lg font-['Fredoka_One'] text-[#4ECDC4] mb-1">{gameName}</p>
      ) : null}
      <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest mb-3">{roundLabel}</p>
      <div className="w-full max-w-lg bg-[#1A1A2E] border-2 border-[#4ECDC4] rounded-2xl p-6 mb-6 text-center">
        <p className="text-xs font-['Nunito'] text-[#4ECDC4] uppercase tracking-widest mb-2">{promptLabel}</p>
        <h1 className="text-2xl md:text-3xl font-['Fredoka_One'] text-[#FFE66D] leading-snug">{prompt}</h1>
      </div>
    </>
  );
}
