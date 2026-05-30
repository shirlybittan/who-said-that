import React, { useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

export default function DrawTelPromptPage() {
  const { state } = useGame();
  const { dt, roomCode } = state;
  const sounds = useSounds();
  const [promptText, setPromptText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const hasName = promptText.toLowerCase().includes('[name]');
  const canSubmit = hasName && promptText.trim().length > 3 && !submitted;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    sounds.answer?.();
    socket.emit('dt:submit_prompt', { code: roomCode, templateText: promptText.trim() });
    setSubmitted(true);
  };

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="w-full max-w-md mt-6 mb-2 flex items-center justify-between">
        <span className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest">📞 Draw Telephone</span>
        <span className="text-xs text-[#FF6B6B] font-['Nunito']">
          {dt.promptsSubmittedCount}/{dt.totalPrompts} submitted
        </span>
      </div>

      <div className="w-full max-w-md bg-[#1A1A2E] rounded-2xl border-2 border-[#FF6B6B]/40 p-5 mb-4">
        <h2 className="text-2xl font-['Fredoka_One'] text-[#FF6B6B] mb-2">Write a Drawing Prompt!</h2>
        <p className="text-sm text-gray-400 font-['Nunito'] leading-relaxed">
          Write a funny sentence that includes{' '}
          <span className="text-[#FFE66D] font-bold">[name]</span> — a random player will be substituted in.
          Others will draw it step-by-step and the target player must guess the original!
        </p>
      </div>

      <div className="w-full max-w-md bg-[#1A1A2E] rounded-xl border border-[#2D2D44] p-3 mb-4">
        <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-2">Examples</p>
        {[
          '[name] fighting a shark with a baguette',
          '[name] discovering they can only fly backwards',
          '[name] as the world\'s worst astronaut',
        ].map((ex, i) => (
          <button
            key={i}
            onClick={() => { if (!submitted) setPromptText(ex); }}
            className="block w-full text-left text-sm text-gray-300 hover:text-white font-['Nunito'] py-1.5 px-2 rounded hover:bg-[#0D0D1A] transition mb-1"
          >
            "{ex}"
          </button>
        ))}
      </div>

      {submitted ? (
        <div className="w-full max-w-md bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-6 text-center">
          <p className="text-[#FF6B6B] font-['Fredoka_One'] text-2xl mb-2">Prompt in! ✓</p>
          <p className="text-gray-400 font-['Nunito'] text-sm mb-4">
            Waiting for others… ({dt.promptsSubmittedCount}/{dt.totalPrompts})
          </p>
          <div className="flex justify-center gap-2">
            {Array.from({ length: dt.totalPrompts }).map((_, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full transition-colors duration-300"
                style={{ backgroundColor: i < dt.promptsSubmittedCount ? '#FF6B6B' : '#2D2D44' }}
              />
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="w-full max-w-md space-y-3">
          <div className="relative">
            <input
              type="text"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value.slice(0, 150))}
              placeholder="e.g. [name] riding a dinosaur to work"
              className="w-full bg-[#1A1A2E] border-2 border-[#2D2D44] focus:border-[#FF6B6B] outline-none rounded-xl px-4 py-3 text-white font-['Nunito'] text-base placeholder-gray-600 transition"
              maxLength={150}
              autoFocus
            />
            <span className="absolute right-3 bottom-3 text-xs text-gray-600 font-['Nunito']">
              {promptText.length}/150
            </span>
          </div>

          {promptText.length > 2 && !hasName && (
            <p className="text-xs text-[#FFE66D] font-['Nunito'] pl-1">
              ⚠️ Include <span className="font-bold">[name]</span> somewhere in your prompt
            </p>
          )}
          {hasName && (
            <p className="text-xs text-[#A8E6CF] font-['Nunito'] pl-1">
              ✓ <span className="font-bold">[name]</span> will be replaced with a real player's name
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-[#FF6B6B] disabled:opacity-30 text-white font-['Fredoka_One'] text-lg py-3 rounded-xl transition hover:bg-[#ff5252]"
          >
            Submit Prompt
          </button>
        </form>
      )}
    </motion.div>
  );
}
