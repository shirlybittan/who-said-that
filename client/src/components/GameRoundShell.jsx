import React from 'react';
import { motion } from 'framer-motion';

/**
 * GameRoundShell — shared layout wrapper for all game mode pages.
 *
 * Props:
 *   mode        {string}  – display name for the current game mode
 *   modeColor   {string}  – accent colour for the mode badge (default teal)
 *   prompt      {string}  – main prompt text shown in the big banner
 *   subPrompt   {string}  – optional secondary label beneath the prompt
 *   roundLabel  {string}  – e.g. "Round 2 / 4"
 *   children    {ReactNode}
 */
export default function GameRoundShell({
  mode,
  modeColor = '#4ECDC4',
  prompt,
  subPrompt,
  roundLabel,
  children,
}) {
  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] px-4 pb-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* Mode badge + round label */}
      <div className="flex items-center gap-3 mt-5 mb-3">
        {mode && (
          <span
            className="px-3 py-1 rounded-full text-black text-xs font-['Fredoka_One'] tracking-wide"
            style={{ backgroundColor: modeColor }}
          >
            {mode}
          </span>
        )}
        {roundLabel && (
          <span className="text-gray-400 font-['Nunito'] text-xs">{roundLabel}</span>
        )}
      </div>

      {/* Prompt banner */}
      {prompt && (
        <div className="w-full max-w-sm bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl px-5 py-4 mb-4 text-center shadow-lg">
          <p className="text-[#FFE66D] font-['Fredoka_One'] text-lg leading-snug">{prompt}</p>
          {subPrompt && (
            <p className="text-gray-400 font-['Nunito'] text-xs mt-1">{subPrompt}</p>
          )}
        </div>
      )}

      {/* Action area */}
      <div className="w-full max-w-sm flex flex-col items-center">
        {children}
      </div>
    </motion.div>
  );
}
