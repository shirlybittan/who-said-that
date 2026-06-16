import React from 'react';

export default function HostControlFooter({ paused, onPauseToggle, onChangeQuestion, onNextRound, resultsVisible, onSkipMiniGame }) {
  return (
    <div className="border-t border-[#2D2D44] bg-[#1A1A2E] p-4 flex justify-center">
      <div className="flex gap-3 flex-wrap justify-center">
        {resultsVisible && onNextRound ? (
          <button onClick={onNextRound} className="px-8 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#6C5CE7] text-[#6C5CE7] bg-[#6C5CE7]/10 hover:bg-[#6C5CE7]/20 active:scale-95 transition">
            Next Round →
          </button>
        ) : (
          <>
            <button onClick={onPauseToggle} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#FFE66D] text-[#FFE66D] bg-[#FFE66D]/10 hover:bg-[#FFE66D]/20 active:scale-95 transition">
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button onClick={onChangeQuestion} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#4ECDC4] hover:text-[#4ECDC4] active:scale-95 transition">
              🔄 Change Question
            </button>
          </>
        )}
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    </div>
  );
}
