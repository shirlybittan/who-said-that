import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Confetti from 'react-confetti';
import { motion } from 'framer-motion';
import { useSounds } from '../../hooks/useSounds';
import Leaderboard from './Leaderboard';
import GameSwitcher from '../GameSwitcher.jsx';
import { useGame } from '../../store/gameStore.jsx';
import { translations } from '../../locales/translations';
import { leaveRoom } from '../../game-core/leaveRoom';

/**
 * Shared end-of-game page shell.
 *
 * Props:
 *  title          – heading (e.g. "Game Over!")
 *  subtitle       – subheading (e.g. game name)
 *  leaderboard    – sorted array of { id?, playerId?, name, color, score, title? }
 *  accentColor    – leaderboard highlight colour (default gold)
 *  pts            – score label (default 'pts')
 *  isHost         – ignored: the shell reads the host role from the store, so a
 *                   page can't show host-only buttons to everyone (AUDIT.md P2-05)
 *  onPlayAgain    – called when host clicks Play Again
 *  playAgainLabel – button label (default 'Play Again 🔄')
 *  gameType       – passed to GameSwitcher
 *  children       – optional extra content rendered below leaderboard
 */
export default function GameEndShell({
  title,
  subtitle = '',
  leaderboard = [],
  accentColor = '#FFE66D',
  pts,
  onPlayAgain,
  playAgainLabel,
  gameType,
  children,
}) {
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const isHost = !!state.isHost;
  const t = translations[state.lang]?.common || translations.en.common;
  const sounds = useSounds();
  const soundsRef = useRef(sounds);

  const [win, setWin] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const fn = () => setWin({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  useEffect(() => { soundsRef.current.gameEnd?.(); }, []);

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-12"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <Confetti width={win.width} height={win.height} recycle={false} numberOfPieces={300} />

      <div className="text-center mt-6 mb-8">
        <h1 className="text-4xl font-['Fredoka_One'] animate-bounce" style={{ color: accentColor }}>
          {title || t.gameOver}
        </h1>
        {subtitle && (
          <p className="text-gray-400 font-['Nunito'] mt-1">{subtitle}</p>
        )}
      </div>

      <Leaderboard entries={leaderboard} accentColor={accentColor} pts={pts || t.pts} />

      {children}

      <div className="w-full max-w-lg space-y-3 mt-4">
        {isHost && onPlayAgain && (
          <button
            onClick={onPlayAgain}
            className="w-full py-4 rounded-2xl font-['Fredoka_One'] text-xl text-black transition hover:opacity-90 active:scale-95"
            style={{ backgroundColor: accentColor }}
          >
            {playAgainLabel || t.playAgain}
          </button>
        )}
        {!isHost && (
          <p data-testid="waiting-host" className="text-center text-gray-400 font-['Nunito'] animate-pulse">{t.waitingHost}</p>
        )}

        <GameSwitcher currentGameType={gameType} />

        <button
          onClick={() => leaveRoom(dispatch, navigate)}
          className="w-full py-3 rounded-2xl bg-[#1A1A2E] text-white font-['Fredoka_One'] text-lg border border-[#2D2D44] hover:border-gray-500 transition"
        >
          {t.mainMenu}
        </button>
      </div>
    </motion.div>
  );
}
