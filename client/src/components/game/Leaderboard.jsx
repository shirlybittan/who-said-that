import React from 'react';
import { motion } from 'framer-motion';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Animated staggered leaderboard list.
 *
 * Props:
 *  entries      – sorted array of { id, name, color, score, title? }
 *                 (id may be `playerId` – the component checks both)
 *  accentColor  – highlight colour for the #1 entry (default gold)
 *  pts          – label appended after score (default 'pts')
 */
export default function Leaderboard({ entries = [], accentColor = '#FFE66D', pts = 'pts' }) {
  if (!entries.length) return null;

  return (
    <motion.div
      className="w-full max-w-lg space-y-3 mb-8"
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
      }}
    >
      {entries.map((entry, i) => {
        const key = entry.id ?? entry.playerId ?? i;
        const isFirst = i === 0;

        return (
          <motion.div
            key={key}
            variants={{
              hidden: { opacity: 0, x: -30 },
              show: { opacity: 1, x: 0, transition: { duration: 0.35 } },
            }}
            className={`flex items-center gap-4 rounded-2xl px-5 py-4 border-2 transition-all ${
              isFirst
                ? 'bg-[#2E2000] border-[#FFE66D] shadow-[0_0_20px_rgba(255,230,109,0.2)]'
                : 'bg-[#1A1A2E] border-[#2D2D44]'
            }`}
          >
            <span className="font-['Fredoka_One'] text-2xl w-8 text-center flex-shrink-0">
              {MEDALS[i] || `${i + 1}`}
            </span>

            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-black font-bold flex-shrink-0 border-2 border-white/20"
              style={{ backgroundColor: entry.color }}
            >
              {entry.name?.charAt(0).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <p
                className={`font-['Fredoka_One'] text-lg truncate ${
                  isFirst ? 'text-[#FFE66D]' : 'text-white'
                }`}
              >
                {entry.name}
              </p>
              {entry.title && (
                <p className="text-xs font-['Nunito'] text-[#4ECDC4] truncate">{entry.title}</p>
              )}
            </div>

            <span
              className="font-['Fredoka_One'] text-xl flex-shrink-0"
              style={{ color: isFirst ? accentColor : '#aaa' }}
            >
              {entry.score} <span className="text-sm font-['Nunito'] text-gray-500">{pts}</span>
            </span>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
