import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import Confetti from 'react-confetti';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8B94', '#6C5CE7', '#FFA07A', '#00CEC9'];

const GAME_TYPE_LABELS = {
  'who-said-that': '🤔 Who Said That?',
  'situational': '🎭 Situational',
  'this-or-that': '⚡ This or That',
  'most-likely-to': '👑 Most Likely To',
  'mixed': '🎲 Mixed',
};

// ─── Shared sub-components ───────────────────────────────────────────────────

const TimerRing = ({ secondsLeft, total = 30, paused, size = 100 }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, secondsLeft / total);
  const offset = circumference * (1 - progress);
  const color = paused ? '#6C5CE7' : secondsLeft <= 8 ? '#FF6B6B' : secondsLeft <= 15 ? '#FFE66D' : '#4ECDC4';
  const isUrgent = !paused && secondsLeft <= 8 && secondsLeft > 0;
  return (
    <motion.svg
      style={{ width: size, height: size }}
      viewBox="0 0 100 100"
      animate={isUrgent ? { scale: [1, 1.07, 1] } : { scale: 1 }}
      transition={isUrgent ? { duration: 0.5, repeat: Infinity, ease: 'easeInOut' } : {}}
    >
      <circle cx="50" cy="50" r={radius} fill="none" stroke="#2D2D44" strokeWidth="8" />
      <circle
        cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
      />
      <text x="50" y="57" textAnchor="middle" fill="white" fontSize="26" fontWeight="bold" fontFamily="Nunito">
        {paused ? '⏸' : secondsLeft}
      </text>
    </motion.svg>
  );
};

const PlayerAvatar = ({ player, size = 'md', status, subtitle }) => {
  const sizes = { sm: 'w-10 h-10 text-base', md: 'w-14 h-14 text-xl', lg: 'w-20 h-20 text-3xl' };
  const statusDot = {
    voted: 'after:bg-green-400',
    waiting: 'after:bg-gray-500',
    answered: 'after:bg-[#4ECDC4]',
  }[status || 'waiting'];
  const floatDelay = useRef(Math.random() * 2).current;

  return (
    <motion.div
      className="flex flex-col items-center gap-1"
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 2.8 + floatDelay * 0.4, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
    >
      <div className={`relative ${sizes[size]} rounded-full flex items-center justify-center font-bold text-black flex-shrink-0 border-2 border-white/20 ${status ? 'after:absolute after:bottom-0 after:right-0 after:w-3 after:h-3 after:rounded-full after:border-2 after:border-[#0D0D1A] ' + statusDot : ''}`}
        style={{ backgroundColor: player.color || COLORS[0] }}>
        {player.name?.charAt(0).toUpperCase()}
      </div>
      <span className="text-xs font-['Nunito'] text-gray-300 text-center leading-tight max-w-[60px] truncate">{player.name}</span>
      {subtitle && <span className="text-xs font-['Fredoka_One'] text-[#FFE66D]">{subtitle}</span>}
    </motion.div>
  );
};

const ProgressBar = ({ value, total, color = '#4ECDC4', label, sublabel }) => {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="w-full">
      {(label || sublabel) && (
        <div className="flex justify-between items-baseline mb-1">
          {label && <span className="text-sm font-['Nunito'] text-gray-400">{label}</span>}
          {sublabel && <span className="text-sm font-['Fredoka_One'] text-white">{value} / {total}</span>}
        </div>
      )}
      <div className="w-full bg-[#2D2D44] rounded-full h-3">
        <div
          className="h-3 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
};

const VoteCoin = ({ coinIndex, cardIndex, isJoker = false }) => (
  <motion.div
    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold select-none flex-shrink-0"
    style={isJoker ? {
      background: 'radial-gradient(circle at 35% 35%, #e879f9, #7c3aed)',
      border: '2px solid #d946ef',
      boxShadow: '0 0 12px rgba(217,70,239,0.6)',
      color: '#fff',
    } : {
      background: 'radial-gradient(circle at 35% 35%, #fef08a, #ca8a04)',
      border: '2px solid #facc15',
      boxShadow: '0 3px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)',
      color: '#713f12',
    }}
    initial={{ y: -80, opacity: 0, scale: 0.3, rotate: -40 }}
    animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
    transition={{
      delay: 0.5 + cardIndex * 0.3 + coinIndex * 0.1,
      type: 'spring',
      stiffness: 460,
      damping: 14,
      mass: 0.6,
    }}
  >
    {isJoker ? '🃏' : '★'}
  </motion.div>
);

const ScoreList = ({ players, scores, prevScores }) => {
  const sorted = [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  const maxScore = Math.max(...sorted.map(p => scores[p.id] || 0), 1);
  return (
    <motion.div
      className="flex flex-col gap-2 w-full"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
    >
      {sorted.map((p, i) => {
        const score = scores[p.id] || 0;
        const prev = prevScores?.[p.id] || 0;
        const delta = score - prev;
        return (
          <motion.div
            key={p.id}
            className="flex items-center gap-3"
            variants={{ hidden: { opacity: 0, x: -20 }, show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 20 } } }}
          >
            <span className="text-sm font-['Fredoka_One'] text-gray-500 w-4">{i + 1}</span>
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-black flex-shrink-0"
              style={{ backgroundColor: p.color }}>
              {p.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-sm font-['Nunito'] text-white truncate">{p.name}</span>
                <div className="flex items-center gap-2">
                  {delta > 0 && (
                    <motion.span
                      className="text-xs font-['Fredoka_One'] text-[#4ECDC4]"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.3 + i * 0.08 }}
                    >+{delta}</motion.span>
                  )}
                  <span className="text-base font-['Fredoka_One'] text-[#FFE66D]">{score}</span>
                </div>
              </div>
              <div className="w-full bg-[#2D2D44] rounded-full h-1.5 overflow-hidden">
                <motion.div
                  className="h-1.5 rounded-full"
                  style={{ backgroundColor: p.color }}
                  initial={{ width: '0%' }}
                  animate={{ width: `${(score / maxScore) * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 + i * 0.08 }}
                />
              </div>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
};

// ─── Phase panels ─────────────────────────────────────────────────────────────

function LobbyPanel({ gameInfo, players, joinUrl }) {
  const activePlayers = players.filter(p => p.isPlaying);
  const spectators = players.filter(p => !p.isPlaying);
  return (
    <div className="flex flex-col lg:flex-row items-stretch gap-8 w-full max-w-6xl">
      {/* Left: QR + join info */}
      <div className="flex flex-col items-center justify-center gap-6 flex-shrink-0 bg-[#1A1A2E] border-2 border-[#2D2D44] rounded-3xl p-8 lg:w-80">
        <div className="bg-white p-4 rounded-2xl">
          <QRCodeSVG value={joinUrl} size={180} />
        </div>
        <div className="text-center">
          <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-1">Scan to join</p>
          <p className="text-sm font-['Nunito'] text-gray-400 break-all">{joinUrl}</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-1">or enter code</p>
          <p className="text-5xl font-['Fredoka_One'] tracking-[0.2em] text-white">{gameInfo.code}</p>
        </div>
      </div>

      {/* Right: player list + game info */}
      <div className="flex flex-col gap-6 flex-1">
        {/* Game info */}
        <div className="bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
          <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-2">Game Mode</p>
          <p className="text-2xl font-['Fredoka_One'] text-[#FFE66D]">
            {gameInfo.gameName || GAME_TYPE_LABELS[gameInfo.gameType] || '🎮 Party Pack'}
          </p>
          {gameInfo.gameName && (
            <p className="text-sm font-['Nunito'] text-gray-400 mt-1">{GAME_TYPE_LABELS[gameInfo.gameType]}</p>
          )}
        </div>

        {/* Player list */}
        <div className="flex-1 bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest">Players</p>
            <span className="text-xs bg-[#4ECDC4]/20 text-[#4ECDC4] px-2 py-0.5 rounded-full font-['Nunito'] font-bold">
              {activePlayers.length} joined
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            {activePlayers.map(p => (
              <PlayerAvatar key={p.id} player={p} size="md" />
            ))}
            {activePlayers.length === 0 && (
              <p className="text-gray-500 font-['Nunito'] italic text-sm">Waiting for players to join...</p>
            )}
          </div>
          {spectators.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#2D2D44]">
              <p className="text-xs font-['Nunito'] text-gray-600 uppercase tracking-widest mb-2">Host / Spectators</p>
              <div className="flex flex-wrap gap-3">
                {spectators.map(p => (
                  <span key={p.id} className="text-xs font-['Nunito'] text-gray-500">{p.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Waiting footer */}
        <div className="bg-[#FFE66D]/10 border border-[#FFE66D]/30 rounded-2xl p-4 text-center">
          <p className="text-[#FFE66D] font-['Fredoka_One'] text-lg">
            {activePlayers.length < 3
              ? `Need ${3 - activePlayers.length} more player${3 - activePlayers.length !== 1 ? 's' : ''} to start`
              : '✅ Ready to start — host controls the game from their device'}
          </p>
        </div>
      </div>
    </div>
  );
}

function MltVotingPanel({ mlt, players, gameName }) {
  const prompt = typeof mlt.prompt === 'object' ? (mlt.prompt?.en || mlt.prompt) : (mlt.prompt || '');
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-5xl">
      {/* Round info */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">Round {mlt.round} of {mlt.totalRounds}</span>
        {gameName && <span className="text-sm font-['Fredoka_One'] text-[#4ECDC4]">— {gameName}</span>}
      </div>

      {/* Prompt */}
      <div className="w-full bg-[#1A1A2E] border-2 border-[#4ECDC4] rounded-3xl p-10 text-center"
        style={{ boxShadow: '0 0 40px #4ECDC420' }}>
        <p className="text-xs font-['Nunito'] text-[#4ECDC4] uppercase tracking-widest mb-4">Who is most likely to...</p>
        <h1 className="text-4xl md:text-5xl font-['Fredoka_One'] text-[#FFE66D] leading-tight">
          {prompt}
        </h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 w-full items-center lg:items-start">
        {/* Timer + vote count */}
        <div className="flex flex-col items-center gap-4 flex-shrink-0">
          <TimerRing secondsLeft={mlt.secondsLeft} paused={mlt.paused} size={120} />
          <div className="bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl px-6 py-4 text-center">
            <p className="text-4xl font-['Fredoka_One'] text-white">
              {mlt.voteCount}<span className="text-gray-500 text-2xl">/{mlt.totalVoters}</span>
            </p>
            <p className="text-xs font-['Nunito'] text-gray-400 uppercase tracking-widest mt-1">votes in</p>
            <ProgressBar value={mlt.voteCount} total={mlt.totalVoters} color="#4ECDC4" />
          </div>
          {mlt.paused && (
            <div className="bg-[#6C5CE7]/20 border border-[#6C5CE7] rounded-xl px-4 py-2">
              <p className="text-[#6C5CE7] font-['Fredoka_One']">⏸ Paused</p>
            </div>
          )}
        </div>

        {/* Player chips */}
        <div className="flex-1 bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
          <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-4">Voting</p>
          <div className="flex flex-wrap gap-4 justify-center">
            {players.filter(p => p.isPlaying && p.isConnected).map(p => (
              <PlayerAvatar key={p.id} player={p} size="md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MltResultsPanel({ mlt, players }) {
  const prompt = typeof mlt.prompt === 'object' ? (mlt.prompt?.en || mlt.prompt) : (mlt.prompt || '');
  const maxCount = Math.max(...(mlt.results || []).map(r => r.count), 1);
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest mb-2">Results · Round {mlt.round}/{mlt.totalRounds}</p>
        <h2 className="text-2xl font-['Fredoka_One'] text-[#FFE66D] leading-snug">"{prompt}"</h2>
      </motion.div>

      <motion.div
        className="w-full flex flex-col gap-3"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.15 } } }}
      >
        {(mlt.results || []).map((r, cardIdx) => {
          const isMajority = (mlt.majorityIds || []).includes(r.playerId);
          const coins = Math.min(r.count, 10);
          return (
            <motion.div
              key={r.playerId}
              variants={{ hidden: { opacity: 0, x: -30, scale: 0.97 }, show: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 22 } } }}
              className="bg-[#1A1A2E] rounded-2xl px-5 py-4"
              style={isMajority ? { border: '2px solid #4ECDC4', boxShadow: '0 0 20px #4ECDC430' } : { border: '1px solid #2D2D44' }}
            >
              <div className="flex items-center gap-4">
                <motion.div
                  className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl text-black flex-shrink-0"
                  style={{ backgroundColor: r.color }}
                  animate={isMajority ? { scale: [1, 1.08, 1] } : {}}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  {r.name?.charAt(0).toUpperCase()}
                </motion.div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-['Fredoka_One'] text-lg text-white flex items-center gap-2">
                      {r.name}
                      {isMajority && <span className="text-[#4ECDC4] text-sm">👑 Majority</span>}
                    </span>
                    <motion.span
                      className="font-['Fredoka_One'] text-xl text-[#FFE66D]"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.3 + cardIdx * 0.15 }}
                    >{r.pct}%</motion.span>
                  </div>
                  <div className="w-full bg-[#2D2D44] rounded-full h-3 overflow-hidden">
                    <motion.div
                      className="h-3 rounded-full"
                      style={{ backgroundColor: isMajority ? '#4ECDC4' : r.color }}
                      initial={{ width: '0%' }}
                      animate={{ width: `${maxCount > 0 ? (r.count / maxCount) * 100 : 0}%` }}
                      transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 + cardIdx * 0.15 }}
                    />
                  </div>
                  <p className="text-xs font-['Nunito'] text-gray-500 mt-1">{r.count} vote{r.count !== 1 ? 's' : ''}</p>
                </div>
              </div>
              {coins > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pl-16">
                  {Array.from({ length: coins }).map((_, ci) => (
                    <VoteCoin key={ci} coinIndex={ci} cardIndex={cardIdx} isJoker={ci === 0 && (mlt.jokersUsed || []).includes(r.playerId)} />
                  ))}
                  {r.count > 10 && (
                    <span className="text-xs font-['Fredoka_One'] text-gray-400 self-center ml-1">+{r.count - 10}</span>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Score summary */}
      {players.filter(p => p.isPlaying).length > 0 && (
        <motion.div
          className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.5 }}
        >
          <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-4">Scores</p>
          <ScoreList players={players.filter(p => p.isPlaying)} scores={mlt.scores} prevScores={mlt.prevScores} />
        </motion.div>
      )}
    </div>
  );
}

function MltEndPanel({ mlt }) {
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-3xl">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      >
        <motion.p
          className="text-6xl mb-3"
          animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >🎉</motion.p>
        <h1 className="text-5xl font-['Fredoka_One'] text-[#FFE66D]">Game Over!</h1>
        {mlt.gameName && <p className="text-xl font-['Nunito'] text-gray-400 mt-2">{mlt.gameName}</p>}
      </motion.div>

      <motion.div
        className="w-full flex flex-col gap-3"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.35 } } }}
      >
        {(mlt.leaderboard || []).map((entry, i) => (
          <motion.div
            key={entry.playerId}
            variants={{
              hidden: { opacity: 0, x: -25, scale: 0.97 },
              show: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 350, damping: 22 } }
            }}
            className="flex items-center gap-4 rounded-2xl px-5 py-4"
            style={i === 0
              ? { background: 'linear-gradient(135deg, #FFE66D20, #4ECDC420)', border: '2px solid #FFE66D', boxShadow: '0 0 30px #FFE66D30' }
              : { background: '#1A1A2E', border: '1px solid #2D2D44' }}
          >
            <span className="text-2xl font-['Fredoka_One'] w-10 text-center" style={{ color: i === 0 ? '#FFE66D' : '#666' }}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
            </span>
            <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl text-black flex-shrink-0"
              style={{ backgroundColor: entry.color }}>
              {entry.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-['Fredoka_One'] text-xl text-white">{entry.name}</p>
              {entry.title && <p className="text-sm font-['Nunito'] text-[#4ECDC4]">{entry.title}</p>}
            </div>
            <span className="text-3xl font-['Fredoka_One'] text-[#FFE66D]">{entry.score}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function QuestionPanel({ questionData, players }) {
  const activePlayers = players.filter(p => p.isPlaying && p.isConnected);
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-5xl">
      <div className="flex items-center gap-4">
        <span className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">
          Round {questionData.round} of {questionData.totalRounds}
        </span>
        <span className="text-sm font-['Nunito'] text-gray-500 capitalize">
          {questionData.type === 'situational' ? '🎭 Situational' : '🤔 Who Said That?'}
        </span>
      </div>

      {questionData.type === 'situational' && questionData.target && (
        <div className="flex items-center gap-3 bg-[#A8E6CF]/10 border border-[#A8E6CF]/30 rounded-2xl px-5 py-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-black"
            style={{ backgroundColor: questionData.target.color }}>
            {questionData.target.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-xs font-['Nunito'] text-gray-400">This round is about</p>
            <p className="font-['Fredoka_One'] text-[#A8E6CF] text-lg">{questionData.target.name}</p>
          </div>
        </div>
      )}

      <div className="w-full bg-[#1A1A2E] border-2 border-[#FFE66D]/50 rounded-3xl p-10 text-center"
        style={{ boxShadow: '0 0 40px #FFE66D15' }}>
        <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-4">The Question</p>
        <h1 className="text-4xl md:text-5xl font-['Fredoka_One'] text-[#FFE66D] leading-snug">
          {questionData.text}
        </h1>
      </div>

      {/* Answer progress */}
      <div className="w-full max-w-xl bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">Answers submitted</p>
          <p className="text-2xl font-['Fredoka_One'] text-white">
            {questionData.answeredCount}<span className="text-gray-500">/{questionData.totalAnswerers || activePlayers.length}</span>
          </p>
        </div>
        <ProgressBar
          value={questionData.answeredCount}
          total={questionData.totalAnswerers || activePlayers.length}
          color="#FFE66D"
        />
      </div>

      {/* Players row */}
      <div className="flex flex-wrap gap-4 justify-center">
        {activePlayers.map(p => <PlayerAvatar key={p.id} player={p} size="sm" />)}
      </div>
    </div>
  );
}

function VotingPanel({ votingData, players }) {
  const current = votingData.answers?.[votingData.currentIndex];
  const activePlayers = players.filter(p => p.isPlaying && p.isConnected);
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
      <div className="flex items-center gap-3">
        <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">
          Answer {votingData.currentIndex + 1} of {votingData.answers?.length || 0}
        </p>
      </div>

      <div className="text-center mb-2">
        <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest mb-2">🤔 Who wrote this?</p>
        <div className="w-full bg-[#1A1A2E] border-2 border-[#6C5CE7]/60 rounded-3xl p-8 relative"
          style={{ boxShadow: '0 0 40px #6C5CE720' }}>
          <span className="text-6xl text-[#6C5CE7]/20 font-['Fredoka_One'] absolute top-3 left-5 leading-none select-none">"</span>
          <p className="text-4xl md:text-5xl font-['Fredoka_One'] text-white leading-snug relative z-10">
            {current?.text || '...'}
          </p>
          <span className="text-6xl text-[#6C5CE7]/20 font-['Fredoka_One'] absolute bottom-1 right-5 leading-none select-none rotate-180">"</span>
        </div>
      </div>

      <div className="w-full max-w-xl bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">Votes in</p>
          <p className="text-2xl font-['Fredoka_One'] text-white">
            {votingData.voteCount}<span className="text-gray-500">/{votingData.totalPlayers}</span>
          </p>
        </div>
        <ProgressBar value={votingData.voteCount} total={votingData.totalPlayers} color="#6C5CE7" />
      </div>

      <div className="flex flex-wrap gap-4 justify-center">
        {activePlayers.map(p => <PlayerAvatar key={p.id} player={p} size="sm" />)}
      </div>
    </div>
  );
}

function RoundEndPanel({ roundEndData, players }) {
  const activePlayers = players.filter(p => p.isPlaying);
  return (
    <div className="flex flex-col lg:flex-row items-start gap-8 w-full max-w-5xl">
      {/* Left: Answer Summary */}
      <div className="flex-1 flex flex-col gap-4">
        <h2 className="text-2xl font-['Fredoka_One'] text-[#FFE66D]">Answer Summary</h2>
        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {(roundEndData.answers || []).map((ans, idx) => {
            const correct = (ans.votes || []).filter(v => v.votedForId === ans.playerId);
            const author = players.find(p => p.id === ans.playerId);
            return (
              <motion.div
                key={idx}
                className="bg-[#1A1A2E] border border-[#2D2D44] rounded-xl p-4"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.3 }}
              >
                <p className="text-base font-['Nunito'] text-white italic mb-2">""{ans.text}""</p>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: author?.color || '#888' }} />
                  <span className="font-['Fredoka_One'] text-sm text-gray-300">{ans.playerName}</span>
                </div>
                {correct.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {correct.map((v, i) => {
                      const voter = players.find(p => p.id === v.voterId);
                      return (
                        <span key={i} className="flex items-center gap-1 bg-[#4ECDC4]/20 border border-[#4ECDC4]/40 rounded-full px-2 py-0.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: voter?.color }} />
                          <span className="text-xs font-['Fredoka_One'] text-[#4ECDC4]">{voter?.name}</span>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-xs font-['Nunito'] text-gray-500 italic">No one guessed correctly</span>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
      {/* Right: Scoreboard */}
      <div className="w-full lg:w-80 flex flex-col gap-4">
        <div className="text-center">
          <p className="text-5xl mb-2">🏆</p>
          <h1 className="text-3xl font-['Fredoka_One'] text-[#4ECDC4]">Round Over!</h1>
        </div>
        <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
          <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-4">Scoreboard</p>
          <ScoreList players={activePlayers} scores={roundEndData.scores} prevScores={roundEndData.prevScores} />
        </div>
        <p className="text-sm font-['Nunito'] text-gray-500 italic text-center">Waiting for host to continue...</p>
      </div>
    </div>
  );
}

function GameEndPanel({ gameEndData, players }) {
  const activePlayers = players.filter(p => p.isPlaying);
  const sorted = [...activePlayers].sort((a, b) => (gameEndData.finalScores[b.id] || 0) - (gameEndData.finalScores[a.id] || 0));
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-3xl">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      >
        <motion.p
          className="text-6xl mb-3"
          animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >🎉</motion.p>
        <h1 className="text-5xl font-['Fredoka_One'] text-[#FFE66D]">Game Over!</h1>
      </motion.div>
      <motion.div
        className="w-full flex flex-col gap-3"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.35 } } }}
      >
        {sorted.map((p, i) => (
          <motion.div
            key={p.id}
            variants={{
              hidden: { opacity: 0, x: -25, scale: 0.97 },
              show: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 350, damping: 22 } }
            }}
            className="flex items-center gap-4 rounded-2xl px-5 py-4"
            style={i === 0
              ? { background: 'linear-gradient(135deg, #FFE66D20, #4ECDC420)', border: '2px solid #FFE66D', boxShadow: '0 0 30px #FFE66D30' }
              : { background: '#1A1A2E', border: '1px solid #2D2D44' }}
          >
            <span className="text-2xl font-['Fredoka_One'] w-10 text-center" style={{ color: i === 0 ? '#FFE66D' : '#666' }}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
            </span>
            <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl text-black flex-shrink-0"
              style={{ backgroundColor: p.color }}>
              {p.name?.charAt(0).toUpperCase()}
            </div>
            <p className="flex-1 font-['Fredoka_One'] text-xl text-white">{p.name}</p>
            <span className="text-3xl font-['Fredoka_One'] text-[#FFE66D]">{gameEndData.finalScores[p.id] || 0}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function TotPanel({ totData, players }) {
  const activePlayers = players.filter(p => p.isPlaying && p.isConnected);
  if (totData.resultsVisible) {
    return (
      <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
        <div className="text-center">
          <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest mb-2">Results · Round {totData.round}/{totData.totalRounds}</p>
          <h2 className="text-2xl font-['Fredoka_One'] text-[#FFE66D]">{totData.question}</h2>
        </div>
        <div className="flex gap-6 w-full">
          {[{ key: 'a', label: totData.a, pct: totData.pctA, count: totData.countA, isMajority: totData.majorityChoice === 'a' },
            { key: 'b', label: totData.b, pct: totData.pctB, count: totData.countB, isMajority: totData.majorityChoice === 'b' }
          ].map(({ key, label, pct, count, isMajority }) => (
            <div key={key}
              className="flex-1 flex flex-col items-center gap-3 rounded-3xl p-6"
              style={isMajority
                ? { background: '#6C5CE720', border: '2px solid #6C5CE7', boxShadow: '0 0 30px #6C5CE730' }
                : { background: '#1A1A2E', border: '1px solid #2D2D44' }}>
              <p className="font-['Fredoka_One'] text-xl text-white text-center">{label}</p>
              <p className="text-5xl font-['Fredoka_One'] text-[#FFE66D]">{pct}%</p>
              <p className="text-sm font-['Nunito'] text-gray-400">{count} vote{count !== 1 ? 's' : ''}</p>
              <div className="w-full bg-[#2D2D44] rounded-full h-3">
                <div className="h-3 rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: isMajority ? '#6C5CE7' : '#4ECDC4' }} />
              </div>
              {isMajority && <p className="text-[#6C5CE7] font-['Fredoka_One'] text-sm">✓ Majority</p>}
            </div>
          ))}
        </div>
        <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
          <ScoreList players={activePlayers} scores={totData.scores} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-5xl">
      <div className="flex items-center gap-4">
        <span className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">
          ⚡ This or That · Round {totData.round} of {totData.totalRounds}
        </span>
      </div>
      <h1 className="text-3xl md:text-4xl font-['Fredoka_One'] text-[#FFE66D] text-center leading-snug">
        {totData.question}
      </h1>
      <div className="flex gap-6 w-full">
        {[{ key: 'a', label: totData.a, color: '#6C5CE7' }, { key: 'b', label: totData.b, color: '#4ECDC4' }].map(({ key, label, color }) => (
          <div key={key} className="flex-1 bg-[#1A1A2E] border-2 rounded-3xl p-8 text-center"
            style={{ borderColor: color, boxShadow: `0 0 20px ${color}20` }}>
            <p className="text-5xl font-['Fredoka_One'] mb-2" style={{ color }}>{key.toUpperCase()}</p>
            <p className="font-['Fredoka_One'] text-xl text-white">{label}</p>
          </div>
        ))}
      </div>
      <div className="w-full max-w-xl bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">Voted</p>
          <p className="text-2xl font-['Fredoka_One'] text-white">
            {totData.voteCount}<span className="text-gray-500">/{totData.totalVoters}</span>
          </p>
        </div>
        <ProgressBar value={totData.voteCount} total={totData.totalVoters} color="#6C5CE7" />
      </div>
    </div>
  );
}

function SitPanel({ sitData, players }) {
  const activePlayers = players.filter(p => p.isPlaying && p.isConnected);
  if (sitData.hasResults) {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-4xl">
        <div className="text-center">
          <p className="text-xs font-['Nunito'] text-gray-400 uppercase tracking-widest mb-2">🎭 Situational · Results</p>
          <h2 className="text-2xl font-['Fredoka_One'] text-[#A8E6CF] leading-snug">{sitData.question}</h2>
        </div>
        <motion.div
          className="w-full flex flex-col gap-3"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } } }}
        >
          {(sitData.answers || []).map(answer => {
            const isWinner = (sitData.winners || []).includes(answer.authorId);
            return (
              <motion.div
                key={answer.id}
                variants={{ hidden: { opacity: 0, y: 20, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 22 } } }}
                className="rounded-2xl p-5"
                style={isWinner
                  ? { background: '#A8E6CF15', border: '2px solid #A8E6CF', boxShadow: '0 0 20px #A8E6CF30' }
                  : { background: '#1A1A2E', border: '1px solid #2D2D44' }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-black flex-shrink-0"
                    style={{ backgroundColor: answer.authorColor || '#888' }}>
                    {answer.authorName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-['Fredoka_One'] text-base text-white">
                        {answer.authorName}
                        {isWinner && <span className="text-[#A8E6CF] ml-2">🏆 Winner</span>}
                      </span>
                      <span className="text-sm font-['Nunito'] text-gray-400">{answer.votes} vote{answer.votes !== 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-lg font-['Nunito'] text-gray-200">"{answer.text}"</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-5xl">
      <div className="text-center">
        <span className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">🎭 Situational</span>
      </div>
      <div className="w-full bg-[#1A1A2E] border-2 border-[#A8E6CF]/50 rounded-3xl p-10 text-center"
        style={{ boxShadow: '0 0 40px #A8E6CF10' }}>
        <h1 className="text-4xl md:text-5xl font-['Fredoka_One'] text-[#A8E6CF] leading-snug">
          {sitData.question}
        </h1>
      </div>
      <div className="w-full max-w-xl bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">
            {sitData.votingStarted ? 'Votes in' : 'Answers submitted'}
          </p>
          <p className="text-2xl font-['Fredoka_One'] text-white">
            {sitData.voteCount}<span className="text-gray-500">/{sitData.totalVoters || activePlayers.length}</span>
          </p>
        </div>
        <ProgressBar
          value={sitData.voteCount}
          total={sitData.totalVoters || activePlayers.length}
          color="#A8E6CF"
        />
      </div>
      <div className="flex flex-wrap gap-4 justify-center">
        {activePlayers.map(p => <PlayerAvatar key={p.id} player={p} size="sm" />)}
      </div>
    </div>
  );
}

function TotEndPanel({ totData }) {
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-3xl">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      >
        <motion.p
          className="text-5xl mb-3"
          animate={{ y: [0, -14, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
        >⚡</motion.p>
        <h1 className="text-5xl font-['Fredoka_One'] text-[#6C5CE7]">This or That!</h1>
        <p className="text-xl font-['Nunito'] text-gray-400 mt-2">Final Results</p>
      </motion.div>
      <motion.div
        className="w-full flex flex-col gap-3"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.35 } } }}
      >
        {(totData.leaderboard || []).map((entry, i) => (
          <motion.div
            key={entry.playerId}
            variants={{
              hidden: { opacity: 0, x: -25, scale: 0.97 },
              show: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 350, damping: 22 } }
            }}
            className="flex items-center gap-4 rounded-2xl px-5 py-4"
            style={i === 0
              ? { background: 'linear-gradient(135deg, #6C5CE720, #A29BFE10)', border: '2px solid #6C5CE7', boxShadow: '0 0 30px #6C5CE730' }
              : { background: '#1A1A2E', border: '1px solid #2D2D44' }}
          >
            <span className="text-2xl font-['Fredoka_One'] w-10 text-center" style={{ color: i === 0 ? '#6C5CE7' : '#666' }}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
            </span>
            <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg text-black flex-shrink-0"
              style={{ backgroundColor: entry.color }}>
              {entry.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="font-['Fredoka_One'] text-lg text-white">{entry.name}</p>
              {entry.title && <p className="text-sm font-['Nunito'] text-[#6C5CE7]">{entry.title}</p>}
            </div>
            <span className="text-2xl font-['Fredoka_One'] text-[#FFE66D]">{entry.score}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}


// ─── Setup screens ────────────────────────────────────────────────────────────

const GAME_TYPES_FOR_CREATE = [
  { id: 'most-likely-to', label: '👑 Most Likely To', desc: 'Who fits the prompt?', accent: '#4ECDC4' },
  { id: 'who-said-that',  label: '🤔 Who Said That?', desc: 'Guess who wrote it!',  accent: '#FFE66D' },
  { id: 'situational',   label: '🎭 Situational',   desc: 'Answer for someone!',   accent: '#A8E6CF' },
  { id: 'this-or-that',  label: '⚡ This or That',  desc: 'Pick a side!',           accent: '#6C5CE7' },
  { id: 'mixed',         label: '🎲 Mixed',         desc: 'All modes shuffled!',    accent: '#FF8B94' },
];

function SetupScreen({ onCreateRoom, onSpectate }) {
  const [inputCode, setInputCode] = React.useState('');
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-8 gap-10">
      <div className="text-center">
        <p className="text-7xl mb-4">📺</p>
        <h1 className="text-5xl font-['Fredoka_One'] text-[#FFE66D] mb-3">Big Screen Mode</h1>
        <p className="text-gray-400 font-['Nunito'] text-lg max-w-lg leading-relaxed">
          Show the game on a TV or laptop. Create a room — players join from their phones using the code or QR.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 w-full max-w-2xl">
        <button
          onClick={onCreateRoom}
          className="flex-1 flex flex-col items-center gap-5 bg-[#1A1A2E] border-2 border-[#4ECDC4] rounded-3xl p-8 hover:bg-[#4ECDC4]/10 active:scale-[0.98] transition text-left"
          style={{ boxShadow: '0 0 40px #4ECDC420' }}
        >
          <span className="text-5xl">🎮</span>
          <div className="text-center">
            <p className="font-['Fredoka_One'] text-2xl text-[#4ECDC4] mb-2">Create New Room</p>
            <p className="font-['Nunito'] text-gray-400 text-sm leading-relaxed">
              Set up a game on this screen. Players scan the QR code or enter the room code on their phones.
            </p>
          </div>
          <span className="text-[#4ECDC4] font-['Fredoka_One'] text-lg mt-auto">Let's go →</span>
        </button>

        <div className="flex-1 flex flex-col items-center gap-5 bg-[#1A1A2E] border-2 border-[#2D2D44] rounded-3xl p-8">
          <span className="text-5xl">🔗</span>
          <div className="text-center w-full">
            <p className="font-['Fredoka_One'] text-2xl text-white mb-2">Display Existing Room</p>
            <p className="font-['Nunito'] text-gray-400 text-sm mb-5 leading-relaxed">
              Game already created on a phone? Enter the room code to show it here.
            </p>
            <input
              type="text"
              placeholder="ABCD"
              value={inputCode}
              onChange={e => setInputCode(e.target.value.toUpperCase().slice(0, 4))}
              className="w-full p-3 rounded-xl text-black text-center text-3xl font-['Fredoka_One'] tracking-[0.3em] uppercase mb-4 focus:outline-none focus:ring-2 focus:ring-[#6C5CE7]"
            />
            <button
              onClick={() => inputCode.length === 4 && onSpectate(inputCode)}
              disabled={inputCode.length !== 4}
              className="w-full py-3 rounded-xl font-['Fredoka_One'] text-lg bg-[#6C5CE7] text-white disabled:opacity-40 hover:bg-[#7d6fd4] active:scale-[0.98] transition"
            >
              📺 Display →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateRoomForm({ onSubmit, onBack }) {
  const [gameType, setGameType] = React.useState('most-likely-to');
  const [gameName, setGameName] = React.useState('');
  const [rounds, setRounds] = React.useState(5);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 overflow-auto">
      <div className="w-full max-w-lg py-8">
        <button
          onClick={onBack}
          className="text-gray-500 font-['Nunito'] mb-6 flex items-center gap-2 hover:text-white transition text-sm"
        >
          ← Back
        </button>
        <h1 className="text-4xl font-['Fredoka_One'] text-[#FFE66D] mb-8">Create Room</h1>

        <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-3">Game Mode</p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {GAME_TYPES_FOR_CREATE.map(g => {
            const selected = gameType === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setGameType(g.id)}
                className={`rounded-2xl p-4 text-left border-2 transition active:scale-95 ${g.id === 'mixed' ? 'col-span-2' : ''}`}
                style={selected
                  ? { backgroundColor: g.accent + '20', borderColor: g.accent, boxShadow: `0 0 12px ${g.accent}44` }
                  : { borderColor: '#2D2D44', backgroundColor: '#0D0D1A60' }}
              >
                <p className="font-['Fredoka_One'] text-sm" style={{ color: selected ? g.accent : '#ccc' }}>{g.label}</p>
                <p className="font-['Nunito'] text-xs text-gray-400 mt-1">{g.desc}</p>
              </button>
            );
          })}
        </div>

        <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-2">Game Name (optional)</p>
        <input
          type="text"
          placeholder="e.g. Sarah's Birthday Party 🎂"
          value={gameName}
          onChange={e => setGameName(e.target.value.slice(0, 40))}
          className="w-full p-3 rounded-xl text-black mb-6 text-base border-2 border-transparent focus:border-[#FFE66D] focus:outline-none"
        />

        <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-2">Number of Rounds</p>
        <div className="flex gap-2 mb-6">
          {[3, 5, 8, 10].map(r => (
            <button
              key={r}
              onClick={() => setRounds(r)}
              className={`flex-1 py-2.5 rounded-xl font-['Fredoka_One'] text-lg border-2 transition active:scale-95 ${rounds === r
                ? 'bg-[#4ECDC4]/20 border-[#4ECDC4] text-[#4ECDC4]'
                : 'border-[#2D2D44] text-gray-400 hover:border-[#4ECDC4]/50'}`}
            >
              {r}
            </button>
          ))}
        </div>

        <button
          onClick={() => onSubmit({ gameType, gameName: gameName.trim(), rounds })}
          className="w-full py-4 rounded-2xl font-['Fredoka_One'] text-xl bg-[#4ECDC4] text-black hover:bg-[#3dbdb5] active:scale-95 transition"
          style={{ boxShadow: '0 0 20px #4ECDC440' }}
        >
          📺 Create & Display
        </button>
      </div>
    </div>
  );
}

// ─── Host control bar (creator only) ─────────────────────────────────────────

function HostControlBar({ status, isRoomCreator, players, mlt, votingData, isMixedMode, onStart, onMltPauseResume, onMltSkip, onMltNext, onNextRound, onSkipQuestion, onSkipMiniGame, onTotNext, onSitNext, onNextAnswer }) {
  if (!isRoomCreator) return null;

  const playingCount = players.filter(p => p.isPlaying && p.isConnected).length;
  const canStart = playingCount >= 3;

  let controls = null;

  if (status === 'lobby') {
    controls = (
      <button
        onClick={onStart}
        disabled={!canStart}
        className={`px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl transition ${canStart
          ? 'bg-[#4ECDC4] text-black hover:bg-[#3dbdb5] active:scale-95'
          : 'bg-[#2D2D44] text-gray-500 cursor-not-allowed'}`}
        style={canStart ? { boxShadow: '0 0 20px #4ECDC460' } : {}}
      >
        {canStart ? '▶ Start Game' : `⏳ Need ${3 - playingCount} more player${3 - playingCount !== 1 ? 's' : ''}`}
      </button>
    );
  } else if (status === 'mlt-voting') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onMltPauseResume} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#FFE66D] text-[#FFE66D] bg-[#FFE66D]/10 hover:bg-[#FFE66D]/20 active:scale-95 transition">
          {mlt.paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button onClick={onMltSkip} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF6B6B] hover:text-[#FF6B6B] active:scale-95 transition">
          ⏭ Skip
        </button>
      </div>
    );
  } else if (status === 'mlt-results') {
    controls = (
      <button onClick={onMltNext} className="px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl bg-[#4ECDC4] text-black hover:bg-[#3dbdb5] active:scale-95 transition" style={{ boxShadow: '0 0 20px #4ECDC440' }}>
        Next Round →
      </button>
    );
  } else if (status === 'question') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onSkipQuestion} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FFE66D] hover:text-[#FFE66D] active:scale-95 transition">
          ⏭ Skip Question
        </button>
        {isMixedMode && (
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        )}
      </div>
    );
  } else if (status === 'sit-voting') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onSkipQuestion} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FFE66D] hover:text-[#FFE66D] active:scale-95 transition">
          ⏭ Skip Question
        </button>
        {isMixedMode && (
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        )}
      </div>
    );
  } else if (status === 'round-end') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onNextRound} className="px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl bg-[#4ECDC4] text-black hover:bg-[#3dbdb5] active:scale-95 transition" style={{ boxShadow: '0 0 20px #4ECDC440' }}>
          Next Round →
        </button>
        {isMixedMode && (
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        )}
      </div>
    );
  } else if (status === 'tot') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onTotNext} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#6C5CE7] hover:text-[#6C5CE7] active:scale-95 transition">
          ⏭ Skip / Next →
        </button>
        {isMixedMode && (
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        )}
      </div>
    );
  } else if (status === 'sit-results') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onSitNext} className="px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl bg-[#A8E6CF] text-black hover:bg-[#8fd4b8] active:scale-95 transition" style={{ boxShadow: '0 0 20px #A8E6CF40' }}>
          Next Round →
        </button>
        {isMixedMode && (
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        )}
      </div>
    );
  } else if (status === 'voting') {
    controls = (
      <button
        onClick={onNextAnswer}
        disabled={!votingData?.allVotesIn}
        className={`px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl transition ${votingData?.allVotesIn ? 'bg-[#6C5CE7] text-white hover:bg-[#7d6fd4] active:scale-95' : 'bg-[#2D2D44] text-gray-500 cursor-not-allowed'}`}
        style={votingData?.allVotesIn ? { boxShadow: '0 0 20px #6C5CE760' } : {}}
      >
        {votingData?.allVotesIn ? 'Next Answer →' : '⏳ Waiting for votes...'}
      </button>
    );
  } else if (status === 'game-end' || status === 'mlt-end' || status === 'tot-end') {
    controls = (
      <button
        onClick={() => { window.location.href = '/host'; }}
        className="px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl bg-[#FFE66D] text-black hover:bg-[#ffdd33] active:scale-95 transition"
        style={{ boxShadow: '0 0 20px #FFE66D60' }}
      >
        🎮 New Game
      </button>
    );
  }

  if (!controls) return null;

  return (
    <div className="flex-shrink-0 flex justify-center items-center gap-6 py-4 px-6 bg-[#0D0D1A]/95 border-t border-[#2D2D44]">
      <span className="text-xs font-['Nunito'] text-gray-600 uppercase tracking-widest">Host Controls</span>
      <div className="w-px h-5 bg-[#2D2D44]" />
      {controls}
    </div>
  );
}

// ─── Main HostPage ─────────────────────────────────────────────────────────────

export default function HostPage() {
  const [searchParams] = useSearchParams();
  const roomCodeParam = searchParams.get('room')?.toUpperCase();

  const [status, setStatus] = useState(roomCodeParam ? 'connecting' : 'setup');
  const [errorMsg, setErrorMsg] = useState('');
  const [isRoomCreator, setIsRoomCreator] = useState(false);
  const [creatorSettings, setCreatorSettings] = useState({ gameType: 'most-likely-to', rounds: 5 });

  const [gameInfo, setGameInfo] = useState({ code: roomCodeParam || '', gameName: '', gameType: '' });
  const [players, setPlayers] = useState([]);

  const [mlt, setMlt] = useState({
    prompt: '', round: 0, totalRounds: 0,
    voteCount: 0, totalVoters: 0, secondsLeft: 30, paused: false,
    results: [], majorityIds: [], jokersUsed: [], scores: {}, prevScores: {}, leaderboard: [], gameName: '',
  });

  const [questionData, setQuestionData] = useState({
    text: '', round: 0, totalRounds: 0, type: 'wst', target: null,
    answeredCount: 0, totalAnswerers: 0,
  });

  const [votingData, setVotingData] = useState({
    answers: [], currentIndex: 0, voteCount: 0, totalPlayers: 0, allVotesIn: false,
  });

  const [roundEndData, setRoundEndData] = useState({ scores: {}, prevScores: {}, players: [], answers: [] });
  const [gameEndData, setGameEndData] = useState({ finalScores: {}, players: [] });

  const [totData, setTotData] = useState({
    question: '', a: '', b: '', round: 0, totalRounds: 0,
    voteCount: 0, totalVoters: 0, countA: 0, countB: 0, pctA: 0, pctB: 0,
    majorityChoice: null, scores: {}, leaderboard: [], resultsVisible: false,
  });

  const [sitData, setSitData] = useState({
    question: '', target: null, answers: [],
    voteCount: 0, totalVoters: 0, hasResults: false, votingStarted: false, winners: [], scores: {},
  });

  const socketRef = useRef(null);

  // ─── Attach game event handlers to a socket ──────────────────────────────
  const attachGameHandlers = useCallback((sock) => {
    sock.on('player_joined', ({ players: p }) => setPlayers(p));

    sock.on('mlt:prompt', (data) => {
      setMlt(prev => ({
        ...prev,
        prompt: data.prompt, round: data.round, totalRounds: data.totalRounds,
        voteCount: 0, totalVoters: data.players?.length || 0,
        secondsLeft: 30, paused: false, results: [], majorityIds: [],
        gameName: data.gameName || prev.gameName,
      }));
      setStatus('mlt-voting');
    });

    sock.on('mlt:timer', ({ secondsLeft }) => setMlt(prev => ({ ...prev, secondsLeft })));
    sock.on('mlt:paused', () => setMlt(prev => ({ ...prev, paused: true })));
    sock.on('mlt:resumed', ({ secondsLeft }) => setMlt(prev => ({ ...prev, paused: false, secondsLeft })));
    sock.on('mlt:vote_received', ({ voteCount, totalVoters }) => setMlt(prev => ({ ...prev, voteCount, totalVoters })));

    sock.on('mlt:results', (data) => {
      setMlt(prev => ({
        ...prev,
        results: data.results || [], majorityIds: data.majorityPlayerIds || [],
        jokersUsed: data.jokersUsed || [],
        prevScores: { ...prev.scores }, scores: data.scores || prev.scores,
      }));
      if (data.players) setPlayers(data.players);
      setStatus('mlt-results');
    });

    sock.on('mlt:end', (data) => {
      setMlt(prev => ({ ...prev, leaderboard: data.leaderboard || [] }));
      setStatus('mlt-end');
    });

    sock.on('mlt:restarted', (data) => {
      setGameInfo(prev => ({ ...prev, gameName: data.gameName || prev.gameName, gameType: data.gameType || prev.gameType }));
      setPlayers(data.players || []);
      setMlt(prev => ({ ...prev, round: 0, scores: {}, prevScores: {}, leaderboard: [] }));
      setStatus('lobby');
    });

    sock.on('new_question', (data) => {
      if (data.roundType === 'this-or-that') {
        setTotData(prev => ({
          ...prev,
          question: data.question || '', a: data.a || '', b: data.b || '',
          round: data.round, totalRounds: data.totalRounds,
          voteCount: 0, totalVoters: 0, resultsVisible: false,
          countA: 0, countB: 0, pctA: 0, pctB: 0, majorityChoice: null,
        }));
        setStatus('tot');
      } else {
        setQuestionData({
          text: data.question || '', round: data.round, totalRounds: data.totalRounds,
          type: data.roundType || 'wst', target: data.target || null,
          answeredCount: 0, totalAnswerers: 0,
        });
        setStatus('question');
      }
    });

    sock.on('answer_received', ({ answeredCount, totalPlayers }) => {
      setQuestionData(prev => ({ ...prev, answeredCount, totalAnswerers: totalPlayers }));
    });

    sock.on('voting_started', ({ answers, currentIndex }) => {
      setVotingData({ answers, currentIndex, voteCount: 0, totalPlayers: 0 });
      setStatus('voting');
    });

    sock.on('vote_received', ({ votedCount, totalPlayers }) => {
      setVotingData(prev => ({ ...prev, voteCount: votedCount, totalPlayers }));
    });

    sock.on('all_votes_in', () => {
      setVotingData(prev => ({ ...prev, allVotesIn: true }));
    });

    sock.on('next_answer', ({ currentIndex }) => {
      setVotingData(prev => ({ ...prev, currentIndex, voteCount: 0, allVotesIn: false }));
    });

    sock.on('round_ended', (data) => {
      setRoundEndData(prev => ({ scores: data.scores || {}, prevScores: { ...prev.scores }, players: data.players || [], answers: data.answers || [] }));
      setStatus('round-end');
    });

    sock.on('game_ended', (data) => {
      setGameEndData({ finalScores: data.finalScores || {}, players: data.players || [] });
      setStatus('game-end');
    });

    sock.on('tot:vote_received', ({ voteCount, totalVoters }) => setTotData(prev => ({ ...prev, voteCount, totalVoters })));

    sock.on('tot:results', (data) => {
      setTotData(prev => ({
        ...prev,
        countA: data.countA, countB: data.countB, pctA: data.pctA, pctB: data.pctB,
        majorityChoice: data.majorityChoice,
        prevScores: { ...prev.scores }, scores: data.scores || prev.scores,
        resultsVisible: true,
      }));
    });

    sock.on('tot:end', (data) => {
      setTotData(prev => ({ ...prev, leaderboard: data.leaderboard || [] }));
      setStatus('tot-end');
    });

    sock.on('sit:voting_started', (data) => {
      setSitData(prev => ({
        ...prev,
        question: data.question || '', answers: data.answers || [],
        totalVoters: data.totalVoters, voteCount: 0,
        hasResults: false, votingStarted: true, winners: [],
      }));
      setStatus('sit-voting');
    });

    sock.on('sit:vote_received', ({ voteCount, totalVoters }) => setSitData(prev => ({ ...prev, voteCount, totalVoters })));

    sock.on('sit:results', (data) => {
      setSitData(prev => ({ ...prev, answers: data.answers || [], scores: data.scores || {}, winners: data.winners || [], hasResults: true }));
      setStatus('sit-results');
    });

    sock.on('error', ({ message }) => {
      setErrorMsg(message);
      setStatus('error');
    });
  }, []);

  // ─── Spectator flow ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomCodeParam) return;

    const phaseToStatus = (roomPhase, roomData) => {
      if (roomPhase === 'lobby') return 'lobby';
      if (roomPhase === 'mlt') return roomData?.mlt?.roundState === 'results' ? 'mlt-results' : 'mlt-voting';
      if (roomPhase === 'mltEnd') return 'mlt-end';
      if (roomPhase === 'question') return 'question';
      if (roomPhase === 'voting') return 'voting';
      if (roomPhase === 'sit-voting') return 'sit-voting';
      if (roomPhase === 'sit-results') return 'sit-results';
      if (roomPhase === 'roundEnd') return 'round-end';
      if (roomPhase === 'gameEnd') return 'game-end';
      if (roomPhase === 'tot') return 'tot';
      if (roomPhase === 'totEnd') return 'tot-end';
      return 'lobby';
    };

    const sock = io(SERVER_URL, { autoConnect: false });
    socketRef.current = sock;

    sock.on('connect', () => sock.emit('join_spectator', { code: roomCodeParam }));

    sock.on('spectator_joined', ({ room }) => {
      setGameInfo({ code: room.code, gameName: room.gameName || '', gameType: room.gameType || '' });
      setPlayers(room.players || []);
      if (room.phase === 'mlt' || room.phase === 'mltEnd') {
        setMlt(prev => ({
          ...prev,
          prompt: room.mlt?.prompt || '', round: room.mlt?.round || 0,
          totalRounds: room.mlt?.totalRounds || 0, voteCount: room.mlt?.voteCount || 0,
          totalVoters: room.mlt?.totalVoters || 0, secondsLeft: room.mlt?.secondsLeft || 30,
          paused: room.mlt?.paused || false, scores: room.mlt?.scores || {},
          gameName: room.gameName || '',
        }));
      }
      if (room.phase === 'question') {
        setQuestionData(prev => ({
          ...prev, text: room.currentQuestion || '',
          answeredCount: room.answersCount || 0,
          totalAnswerers: room.players?.filter(p => p.isPlaying && p.isConnected).length || 0,
        }));
      }
      if (room.phase === 'tot') {
        setTotData(prev => ({
          ...prev, question: room.tot?.question || '', a: room.tot?.a || '', b: room.tot?.b || '',
          round: room.tot?.round || 0, totalRounds: room.tot?.totalRounds || 0,
          voteCount: room.tot?.voteCount || 0, totalVoters: room.tot?.totalVoters || 0,
          scores: room.tot?.scores || {}, resultsVisible: false,
        }));
      }
      if (room.phase === 'sit-voting') {
        setSitData(prev => ({
          ...prev, question: room.sit?.question || '',
          voteCount: room.sit?.voteCount || 0, totalVoters: room.sit?.totalVoters || 0,
          hasResults: false, votingStarted: false,
        }));
      }
      setStatus(phaseToStatus(room.phase, room));
    });

    attachGameHandlers(sock);
    sock.connect();
    return () => { sock.disconnect(); };
  }, [roomCodeParam, attachGameHandlers]);

  // ─── Creator flow ─────────────────────────────────────────────────────────
  const handleCreateRoom = useCallback(({ gameType, gameName, rounds }) => {
    setCreatorSettings({ gameType, rounds });
    setStatus('connecting');

    const sock = io(SERVER_URL, { autoConnect: false });
    socketRef.current = sock;

    sock.on('connect', () => {
      sock.emit('create_room', { playerName: 'Screen Cast', gameType, gameName, hostIsPlaying: false });
    });

    sock.on('room_created', ({ code, players: initialPlayers, gameType: gt, gameName: gn }) => {
      setGameInfo({ code, gameName: gn || '', gameType: gt || '' });
      setPlayers(initialPlayers || []);
      setIsRoomCreator(true);
      window.history.replaceState({}, '', `/host?room=${code}`);
      setStatus('lobby');
    });

    attachGameHandlers(sock);
    sock.connect();
  }, [attachGameHandlers]);

  // ─── Host control handlers ────────────────────────────────────────────────
  const handleStartGame = () => {
    const sock = socketRef.current;
    if (!sock || !gameInfo.code) return;
    if (creatorSettings.gameType === 'most-likely-to') {
      sock.emit('mlt:start', { code: gameInfo.code, rounds: creatorSettings.rounds, allowSelfVote: true });
    } else {
      sock.emit('start_game', { code: gameInfo.code });
    }
  };

  const handleMltPauseResume = () => {
    const sock = socketRef.current;
    if (!sock) return;
    if (mlt.paused) sock.emit('mlt:resume', { code: gameInfo.code });
    else sock.emit('mlt:pause', { code: gameInfo.code });
  };

  const handleMltSkip = () => socketRef.current?.emit('mlt:skip', { code: gameInfo.code });
  const handleMltNext = () => socketRef.current?.emit('mlt:next_round', { code: gameInfo.code });
  const handleNextRound = () => socketRef.current?.emit('ready_next_round', { code: gameInfo.code });
  const handleSkipQuestion = () => socketRef.current?.emit('skip_question', { code: gameInfo.code });
  const handleSkipMiniGame = () => socketRef.current?.emit('skip_mini_game', { code: gameInfo.code });
  const handleTotNext = () => socketRef.current?.emit('tot:next_round', { code: gameInfo.code });
  const handleSitNext = () => socketRef.current?.emit('sit:next', { code: gameInfo.code });
  const handleNextAnswer = () => socketRef.current?.emit('next_answer_request', { code: gameInfo.code });

  // ─── Render ───────────────────────────────────────────────────────────────
  if (status === 'setup') {
    return (
      <div className="font-['Nunito'] bg-[#0D0D1A] text-[#F7F7F7]">
        <SetupScreen
          onCreateRoom={() => setStatus('creating')}
          onSpectate={(code) => { window.location.search = `?room=${code}`; }}
        />
      </div>
    );
  }

  if (status === 'creating') {
    return (
      <div className="font-['Nunito'] bg-[#0D0D1A] text-[#F7F7F7]">
        <CreateRoomForm onSubmit={handleCreateRoom} onBack={() => setStatus('setup')} />
      </div>
    );
  }

  const joinUrl = `${window.location.origin}/?join=${gameInfo.code || roomCodeParam || ''}`;
  const headerRoomCode = gameInfo.code || roomCodeParam;

  const renderPanel = () => {
    switch (status) {
      case 'connecting':
        return (
          <div className="flex flex-col items-center gap-4 text-gray-500">
            <div className="w-16 h-16 border-4 border-[#4ECDC4] border-t-transparent rounded-full animate-spin" />
            <p className="font-['Nunito'] text-xl">Connecting...</p>
          </div>
        );
      case 'error':
        return (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-6xl">😕</p>
            <p className="text-3xl font-['Fredoka_One'] text-[#FF6B6B]">{errorMsg || 'Room not found'}</p>
            <p className="font-['Nunito'] text-gray-400">Make sure the room code is correct and the game is still running.</p>
            <button
              onClick={() => { window.history.replaceState({}, '', '/host'); setStatus('setup'); }}
              className="px-6 py-3 bg-[#2D2D44] rounded-xl font-['Fredoka_One'] text-white hover:bg-[#3D3D54] transition mt-2"
            >
              ← Try Again
            </button>
          </div>
        );
      case 'lobby':
        return <LobbyPanel gameInfo={gameInfo} players={players} joinUrl={joinUrl} />;
      case 'mlt-voting':
        return <MltVotingPanel mlt={mlt} players={players} gameName={mlt.gameName || gameInfo.gameName} />;
      case 'mlt-results':
        return <MltResultsPanel mlt={mlt} players={players} />;
      case 'mlt-end':
        return <MltEndPanel mlt={{ ...mlt, gameName: gameInfo.gameName }} />;
      case 'question':
        return <QuestionPanel questionData={questionData} players={players} />;
      case 'voting':
        return <VotingPanel votingData={votingData} players={players} />;
      case 'round-end':
        return <RoundEndPanel roundEndData={roundEndData} players={players} />;
      case 'game-end':
        return <GameEndPanel gameEndData={gameEndData} players={players} />;
      case 'tot':
        return <TotPanel totData={totData} players={players} />;
      case 'tot-end':
        return <TotEndPanel totData={totData} />;
      case 'sit-voting':
      case 'sit-results':
        return <SitPanel sitData={sitData} players={players} />;
      default:
        return null;
    }
  };

  return (
    <div className="font-['Nunito'] min-h-screen bg-[#0D0D1A] text-[#F7F7F7] flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 bg-[#1A1A2E] border-b border-[#2D2D44] flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl font-['Fredoka_One'] text-[#FFE66D]">🎉 Party Pack</span>
          {gameInfo.gameName && (
            <span className="text-base font-['Fredoka_One'] text-[#4ECDC4]">— {gameInfo.gameName}</span>
          )}
          {!gameInfo.gameName && gameInfo.gameType && (
            <span className="text-sm font-['Nunito'] text-gray-500">{GAME_TYPE_LABELS[gameInfo.gameType] || ''}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest">Room</span>
            <span className="text-2xl font-['Fredoka_One'] text-[#FFE66D] tracking-widest">{headerRoomCode}</span>
          </div>
          {status !== 'lobby' && (
            <div className="bg-white p-1 rounded">
              <QRCodeSVG value={joinUrl} size={36} />
            </div>
          )}
        </div>
      </div>

      {['game-end', 'mlt-end', 'tot-end'].includes(status) && (
        <Confetti width={window.innerWidth} height={window.innerHeight} recycle={false} numberOfPieces={400} />
      )}
      <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={status}
            className="w-full flex justify-center"
            initial={{ opacity: 0, y: 22, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -22, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {renderPanel()}
          </motion.div>
        </AnimatePresence>
      </div>

      <HostControlBar
        status={status}
        isRoomCreator={isRoomCreator}
        players={players}
        mlt={mlt}
        votingData={votingData}
        onStart={handleStartGame}
        onMltPauseResume={handleMltPauseResume}
        onMltSkip={handleMltSkip}
        onMltNext={handleMltNext}
        onNextRound={handleNextRound}
        onSkipQuestion={handleSkipQuestion}
        onSkipMiniGame={handleSkipMiniGame}
        isMixedMode={gameInfo.gameType === 'mixed'}
        onTotNext={handleTotNext}
        onSitNext={handleSitNext}
        onNextAnswer={handleNextAnswer}
      />
    </div>
  );
}
