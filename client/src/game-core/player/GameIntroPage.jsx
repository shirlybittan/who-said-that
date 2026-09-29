import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { socket } from '../../socket';
import { useGame } from '../../store/gameStore.jsx';
import { translations } from '../../locales/translations';
import { getGame, gameName, gameRules } from '../../games/registry';

/**
 * The canonical pre-game intro (phones). Every game — and every playlist item —
 * starts here: icon, name, rules, who's ready, "I'm ready", and a 3-2-1
 * countdown. Driven by the server intro gate (server/game/intro.js).
 */
export default function GameIntroPage() {
  const { state } = useGame();
  const t = translations[state.lang]?.common || translations.en.common;
  const intro = state.intro || {};
  const game = getGame(intro.gameType);
  const accent = game?.accent || '#4ECDC4';
  const readyIds = intro.readyIds || [];
  const players = intro.players || [];
  const iAmReady = readyIds.includes(state.playerId);
  const iPlay = players.some(p => p.id === state.playerId);
  const countdown = useCountdown(intro.countdownEndsAt);

  const ready = () => { if (!iAmReady) socket.emit('intro:ready', { code: state.roomCode }); };
  const startNow = () => socket.emit('intro:start_now', { code: state.roomCode });

  return (
    <motion.div
      data-testid="game-intro"
      className="flex flex-col items-center min-h-[calc(100vh-3.5rem)] px-6 py-8 gap-6 text-center"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
    >
      <div className="text-7xl" aria-hidden>{game?.icon || '🎮'}</div>
      <h1 className="text-4xl font-['Fredoka_One']" style={{ color: accent }}>{gameName(intro.gameType, state.lang)}</h1>
      <div className="w-full max-w-sm bg-[#1A1A2E] border-2 rounded-2xl p-5" style={{ borderColor: `${accent}55` }}>
        <p className="text-xs font-['Nunito'] text-gray-400 uppercase tracking-widest mb-2">{t.howToPlay}</p>
        <p className="font-['Nunito'] text-lg text-white leading-snug">{gameRules(intro.gameType, state.lang)}</p>
      </div>

      {countdown !== null ? (
        <div data-testid="intro-countdown" className="flex flex-col items-center gap-1">
          <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">{t.startingIn}</p>
          <motion.p key={countdown} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-7xl font-['Fredoka_One']" style={{ color: accent }}>
            {countdown}
          </motion.p>
        </div>
      ) : iPlay && (
        <button
          data-testid="intro-ready-btn"
          onClick={ready}
          disabled={iAmReady}
          className="w-full max-w-sm py-4 rounded-2xl font-['Fredoka_One'] text-2xl text-black transition active:scale-95 disabled:opacity-60"
          style={{ backgroundColor: accent }}
        >
          {iAmReady ? t.readyDone : t.ready}
        </button>
      )}

      <div className="w-full max-w-sm">
        <p className="text-sm font-['Nunito'] text-gray-400 mb-2">
          {t.readyCount.replace('{ready}', readyIds.length).replace('{total}', players.length)}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {players.map(p => {
            const r = readyIds.includes(p.id);
            return (
              <span key={p.id} className={`flex items-center gap-1.5 rounded-full ps-1 pe-3 py-1 border ${r ? 'border-[#4ECDC4] bg-[#4ECDC4]/10' : 'border-[#2D2D44] bg-[#1A1A2E] opacity-60'}`}>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-black" style={{ backgroundColor: p.color }}>{p.name?.charAt(0).toUpperCase()}</span>
                <span className="text-sm font-['Nunito'] text-gray-200 max-w-[7rem] truncate">{p.name}</span>
                {r && <span className="text-[#4ECDC4] text-sm">✓</span>}
              </span>
            );
          })}
        </div>
      </div>

      {state.isHost && countdown === null && (
        <button data-testid="intro-start-now" onClick={startNow} className="text-sm font-['Nunito'] text-gray-400 underline hover:text-white">
          {t.startNow} →
        </button>
      )}
    </motion.div>
  );
}

function useCountdown(endsAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  return Math.max(1, Math.ceil((endsAt - now) / 1000));
}
