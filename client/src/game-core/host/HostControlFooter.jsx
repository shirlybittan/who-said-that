import React from 'react';

export default function HostControlFooter({ paused, onPauseToggle, onChangeQuestion, onSkipQuestion, onSkipMiniGame }) {
  return (
    <div className="border-t border-[#2D2D44] bg-[#1A1A2E] p-4 flex justify-center">
      <div className="flex gap-3 flex-wrap justify-center">
        {onPauseToggle ? (
          <button onClick={onPauseToggle} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#FFE66D] text-[#FFE66D] bg-[#FFE66D]/10 hover:bg-[#FFE66D]/20 active:scale-95 transition">
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        ) : null}
        {onChangeQuestion ? (
          <button onClick={onChangeQuestion} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#4ECDC4] hover:text-[#4ECDC4] active:scale-95 transition">
            🔄 Change Question
          </button>
        ) : null}
        {onSkipQuestion ? (
          <button onClick={onSkipQuestion} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FFE66D] hover:text-[#FFE66D] active:scale-95 transition">
            ⏭ Skip Question
          </button>
        ) : null}
        {onSkipMiniGame ? (
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        ) : null}
      </div>
    </div>
  );
}
