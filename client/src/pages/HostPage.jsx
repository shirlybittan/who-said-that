import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import Confetti from 'react-confetti';
import TimerRing from '../components/game/TimerRing';
import VoteCoin from '../components/game/VoteCoin';
import ReplayCanvas from '../components/game/ReplayCanvas';
import { QUEUE_GAME_LABELS } from '../config/hostControls';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const CLIENT_URL = (import.meta.env.VITE_CLIENT_URL || '').replace(/\/$/, '') || null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8B94', '#6C5CE7', '#FFA07A', '#00CEC9'];

const GAME_TYPE_LABELS = {
  'who-said-that': '🤔 Who Said That?',
  'situational': ' Situational',
  'this-or-that': '⚡ This or That',
  'most-likely-to': '👑 Most Likely To',
  'mixed': '🎲 Mixed',
  'drawing': '🎨 Pictionary Battle',
  'fill-in-the-blank': '✏️ Fill in the Blank',
  'draw-telephone': '📞 Drawing in Chain',
  'selfie-roast': '📸 Draw on Friends',
  'caption': '💬 Selfie Captions',
  'pmatch': '🎭 Selfie Challenge',
  'photoassoc': '🎯 Prompt Match',
};

// ─── Shared sub-components ───────────────────────────────────────────────────

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

// ─── Drawing canvas helpers (for Sketch It! TV panel) ────────────────────────
// (drawStroke, CANVAS_W/H, HostReplayCanvas replaced by shared ReplayCanvas)

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

function LobbyPanel({ gameInfo, players, joinUrl, onKickPlayer }) {
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
              <div key={p.id} className="flex flex-col items-center gap-1 group relative">
                <PlayerAvatar player={p} size="md" />
                {onKickPlayer && (
                  <button
                    onClick={() => onKickPlayer(p.id)}
                    title={`Kick ${p.name}`}
                    className="text-xs font-['Nunito'] text-gray-500 hover:text-red-400 transition absolute -top-1 -right-1 bg-[#0D0D1A] border border-[#2D2D44] rounded-full w-5 h-5 flex items-center justify-center leading-none"
                  >
                    ✕
                  </button>
                )}
              </div>
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
              : '✅ Ready to start — use the Start Game button below ↓'}
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
              <PlayerAvatar key={p.id} player={p} size="md" status={mlt.votedPlayerIds?.includes(p.id) ? 'voted' : 'waiting'} />
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
  const computeSecondsLeft = () => {
    const elapsed = questionData.startedAt ? Math.floor((Date.now() - questionData.startedAt) / 1000) : 0;
    return Math.max(0, (questionData.roundDuration || 60) - elapsed);
  };
  const [secondsLeft, setSecondsLeft] = useState(computeSecondsLeft);

  useEffect(() => {
    const elapsed = questionData.startedAt ? Math.floor((Date.now() - questionData.startedAt) / 1000) : 0;
    setSecondsLeft(Math.max(0, (questionData.roundDuration || 60) - elapsed));
  }, [questionData.text]); // Reset timer when question changes

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-5xl">
      <div className="flex items-center gap-4">
        <span className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">
          Round {questionData.round} of {questionData.totalRounds}
        </span>
        <span className="text-sm font-['Nunito'] text-gray-500 capitalize">
          {questionData.type === 'situational' ? ' Situational' : '🤔 Who Said That?'}
        </span>
      </div>
      <TimerRing secondsLeft={secondsLeft} total={questionData.roundDuration || 60} paused={false} size={100} />

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
        {activePlayers.map(p => (
          <PlayerAvatar key={p.id} player={p} size="sm"
            status={questionData.answeredPlayerIds?.includes(p.id) ? 'answered' : 'waiting'} />
        ))}
      </div>
    </div>
  );
}

function VotingPanel({ votingData, players }) {
  const current = votingData.answers?.[votingData.currentIndex];
  const authorId = current?.playerId;
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
        {activePlayers.map(p => (
          <PlayerAvatar key={p.id} player={p} size="sm"
            status={p.id === authorId ? 'answered' : votingData.votedPlayerIds?.includes(p.id) ? 'voted' : 'waiting'} />
        ))}
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
        <div className="flex flex-wrap gap-3 justify-center mt-4">
          {activePlayers.map(p => (
            <PlayerAvatar key={p.id} player={p} size="sm" status={totData.votedPlayerIds?.includes(p.id) ? 'voted' : 'waiting'} />
          ))}
        </div>
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
          <p className="text-xs font-['Nunito'] text-gray-400 uppercase tracking-widest mb-2"> Situational · Results</p>
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
        <span className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest"> Situational</span>
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
        {activePlayers.map(p => (
          <PlayerAvatar key={p.id} player={p} size="sm"
            status={sitData.votedPlayerIds?.includes(p.id) ? 'voted' : 'waiting'} />
        ))}
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

function DrawingHostPanel({ drawData, players, status }) {
  const activePlayers = players.filter(p => p.isConnected && p.isPlaying);
  const isSecretMode = drawData.mode === 'secret';
  const isEndPhase = status === 'draw-end';
  const isResultsPhase = drawData.phase === 'results' && !isEndPhase;
  const isVotingPhase = drawData.phase === 'voting';
  const isDrawingPhase = drawData.phase === 'drawing';

  // ── DRAWING PHASE ────────────────────────────────────────────────────────
  if (isDrawingPhase) {
    const total = drawData.totalDrawers || activePlayers.length;
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-xl">
        <motion.div className="text-center" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-5xl mb-2">🎨</p>
          <h1 className="text-4xl font-['Fredoka_One'] text-[#C39BD3]">Sketch It!</h1>
          <div className="flex items-center justify-center gap-2 mt-1">
            {isSecretMode
              ? <span className="px-3 py-1 rounded-full bg-[#C39BD3]/20 text-[#C39BD3] text-xs font-['Nunito'] font-bold uppercase tracking-widest">✦ Secret Words</span>
              : <span className="px-3 py-1 rounded-full bg-[#FFE66D]/20 text-[#FFE66D] text-xs font-['Nunito'] font-bold uppercase tracking-widest">Classic Mode</span>
            }
          </div>
        </motion.div>

        {!isSecretMode && (
          <div className="w-full bg-[#1A1A2E] border-2 border-[#C39BD3]/40 rounded-2xl p-5 text-center">
            <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-1">Word to draw</p>
            <p className="text-3xl font-['Fredoka_One'] text-[#FFE66D]">{drawData.word || '...'}</p>
          </div>
        )}
        {isSecretMode && (
          <div className="w-full bg-[#1A1A2E] border-2 border-[#C39BD3]/40 rounded-2xl p-5 text-center">
            <p className="text-sm font-['Nunito'] text-gray-400">Each player is drawing their own secret word 🤫</p>
          </div>
        )}

        <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">Drawings submitted</p>
            <p className="text-2xl font-['Fredoka_One'] text-white">
              {drawData.submittedCount}<span className="text-gray-500">/{total}</span>
            </p>
          </div>
          <ProgressBar value={drawData.submittedCount} total={total} color="#C39BD3" />
        </div>

        <TimerRing secondsLeft={drawData.secondsLeft ?? drawData.timeLimit ?? 90} total={drawData.timeLimit ?? 90} paused={false} size={100} />

        <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-4">
          <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-3 text-center">
            Round {drawData.round}/{drawData.totalRounds}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {activePlayers.map(p => <PlayerAvatar key={p.id} player={p} size="sm" status={drawData.submittedPlayerIds?.includes(p.id) ? 'answered' : 'waiting'} />)}
          </div>
        </div>
      </div>
    );
  }

  // ── VOTING PHASE ─────────────────────────────────────────────────────────
  if (isVotingPhase) {
    const submissions = drawData.submissions || [];
    const total = drawData.totalVoters || activePlayers.length;
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-5xl">
        <motion.div className="text-center" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-['Fredoka_One'] text-[#C39BD3]">🗳️ Vote for the Best!</h1>
          {isSecretMode
            ? <p className="text-gray-400 font-['Nunito'] mt-1">✦ Secret Words — each player drew a different word</p>
            : <p className="text-gray-400 font-['Nunito'] mt-1">Word: <span className="text-[#FFE66D] font-bold">{drawData.word}</span></p>
          }
        </motion.div>

        {submissions.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full">
            {submissions.map(sub => (
              <motion.div
                key={sub.playerId}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#1A1A2E] border-2 border-[#C39BD3]/30 rounded-2xl overflow-hidden"
              >
                <div className="bg-white">
                  <ReplayCanvas strokes={sub.strokes} cssWidth="100%" cssHeight={150} className="w-full" />
                </div>
                <div className="p-3 text-center">
                  {isSecretMode && (
                    <p className="text-[#FFE66D] font-['Fredoka_One'] text-lg">{sub.word}</p>
                  )}
                  <p className="text-white font-['Fredoka_One'] text-base">{sub.name}</p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-8 text-center">
            <p className="text-gray-400 font-['Nunito']">Getting submissions ready...</p>
          </div>
        )}

        <div className="w-full max-w-md">
          <ProgressBar
            value={drawData.voteCount}
            total={total}
            color="#C39BD3"
            label="Votes in"
            sublabel={true}
          />
          <div className="flex flex-wrap gap-3 justify-center mt-4">
            {activePlayers.map(p => (
              <PlayerAvatar key={p.id} player={p} size="sm" status={drawData.votedPlayerIds?.includes(p.id) ? 'voted' : 'waiting'} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── RESULTS PHASE ────────────────────────────────────────────────────────
  if (isResultsPhase) {
    const results = drawData.results || [];
    const medals = ['🥇', '🥈', '🥉'];
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-3xl">
        <motion.div className="text-center" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-['Fredoka_One'] text-[#FFE66D]">Round Results</h1>
          {isSecretMode
            ? <span className="mt-1 inline-block px-3 py-1 rounded-full bg-[#C39BD3]/20 text-[#C39BD3] text-sm font-['Nunito']">✦ Secret Words Mode</span>
            : <p className="text-gray-400 font-['Nunito'] mt-1">Word: <span className="text-[#FFE66D] font-bold">{drawData.word}</span></p>
          }
        </motion.div>

        {/* Flat ranked list with drawing thumbnails */}
        <div className="w-full flex flex-col gap-3">
          {results.map((r, i) => (
            <motion.div
              key={r.playerId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-4 bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-3"
            >
              <span className="text-2xl w-10 text-center flex-shrink-0">{medals[i] || `${i + 1}.`}</span>
              {r.strokes && (
                <div className="rounded-xl overflow-hidden border border-[#C39BD3]/30 bg-white flex-shrink-0" style={{ width: 80 }}>
                  <ReplayCanvas strokes={r.strokes} cssWidth="80px" cssHeight={60} className="w-full" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-['Fredoka_One'] text-lg truncate">{r.name}</p>
                {isSecretMode && r.word && <p className="text-[#FFE66D] font-['Nunito'] text-sm italic">"{r.word}"</p>}
              </div>
              <span className="text-[#4ECDC4] font-['Fredoka_One'] text-xl flex-shrink-0">
                {r.votes} vote{r.votes !== 1 ? 's' : ''}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // ── END PHASE (final leaderboard with podium) ─────────────────────────────
  if (isEndPhase) {
    const leaderboard = drawData.leaderboard || [];
    const medals = ['🥇', '🥈', '🥉'];
    const top3 = leaderboard.slice(0, 3);
    const rest = leaderboard.slice(3);
    // Podium order: 2nd (left), 1st (centre), 3rd (right)
    const podiumOrder = top3.length >= 3
      ? [top3[1], top3[0], top3[2]]
      : top3.length === 2
        ? [null, top3[0], top3[1]]
        : [null, top3[0], null];
    const podiumHeights = ['h-24', 'h-36', 'h-16'];
    const podiumColors = ['#C0C0C033', '#FFE66D33', '#CD7F3233'];

    return (
      <div className="flex flex-col items-center gap-8 w-full max-w-3xl">
        <motion.div className="text-center" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
          <p className="text-6xl mb-3">🎨</p>
          <h1 className="text-5xl font-['Fredoka_One'] text-[#C39BD3] mb-2">Sketch It!</h1>
          <p className="text-2xl font-['Fredoka_One'] text-[#FFE66D]">Game Over!</p>
        </motion.div>

        {/* Podium */}
        {top3.length > 0 && (
          <div className="w-full flex items-end justify-center gap-4">
            {podiumOrder.map((entry, idx) => entry ? (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.15 }}
                className="flex flex-col items-center gap-2 flex-1 max-w-xs"
              >
                <p className="text-3xl mb-1">{medals[idx === 1 ? 0 : idx === 0 ? 1 : 2]}</p>
                <p className="text-white font-['Fredoka_One'] text-xl text-center">{entry.name}</p>
                <p className={`font-['Fredoka_One'] text-2xl ${idx === 1 ? 'text-[#FFE66D]' : 'text-[#4ECDC4]'}`}>{entry.score}</p>
                <div className={`w-full rounded-t-xl ${podiumHeights[idx]} flex items-end justify-center pb-2`}
                  style={{ backgroundColor: podiumColors[idx] }}>
                  <span className="font-['Fredoka_One'] text-2xl text-white">
                    {idx === 1 ? '1st' : idx === 0 ? '2nd' : '3rd'}
                  </span>
                </div>
              </motion.div>
            ) : (
              <div key={`empty-${idx}`} className="flex-1 max-w-xs" />
            ))}
          </div>
        )}

        {/* Remaining players */}
        {rest.length > 0 && (
          <div className="w-full flex flex-col gap-2">
            {rest.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.45 + i * 0.07 }}
                className="flex items-center gap-4 rounded-2xl px-5 py-3 bg-[#1A1A2E] border border-[#2D2D44]"
              >
                <span className="text-xl w-8 text-center text-gray-400 font-['Fredoka_One']">{i + 4}.</span>
                <span className="flex-1 text-white font-['Fredoka_One'] text-xl">{entry.name}</span>
                <span className="font-['Fredoka_One'] text-xl text-[#4ECDC4]">{entry.score}</span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-5xl">🎨</p>
      <h1 className="text-4xl font-['Fredoka_One'] text-[#C39BD3]">Sketch It!</h1>
    </div>
  );
}

// ─── Draw Telephone Host Panel ───────────────────────────────────────────────
function DtHostPanel({ dtData, players, status, onRevealNext }) {
  const { phase, promptsSubmittedCount, totalPrompts, totalChains, chainsCompletedCount, chainProgress, guessedCount, totalGuessers, reveal, leaderboard } = dtData;

  // ── PROMPTING phase ─────────────────────────────────────────────────────
  if (status === 'dt-prompting') {
    const activePlayers = players.filter(p => p.isPlaying && p.isConnected);
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg">
        <motion.div className="text-center" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-6xl mb-2">📞</p>
          <h1 className="text-4xl font-['Fredoka_One'] text-[#FF6B6B]">Drawing in Chain</h1>
          <p className="text-xl text-gray-300 font-['Nunito'] mt-1">Players are writing prompts…</p>
        </motion.div>
        <div className="w-full bg-[#1A1A2E] rounded-2xl p-6 border border-[#FF6B6B]/30">
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-400 font-['Nunito']">Prompts submitted</span>
            <span className="text-[#FF6B6B] font-['Fredoka_One'] text-2xl">{promptsSubmittedCount}<span className="text-gray-500">/{totalPrompts}</span></span>
          </div>
          <ProgressBar value={promptsSubmittedCount} total={totalPrompts} color="#FF6B6B" />
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {activePlayers.map(p => <PlayerAvatar key={p.id} player={p} size="sm" status={(dtData.submittedPlayerIds || []).includes(p.id) ? 'answered' : 'waiting'} />)}
          </div>
        </div>
      </div>
    );
  }

  // ── SELFIE phase ────────────────────────────────────────────────────────
  if (status === 'dt-selfie') {
    const activePlayers = players.filter(p => p.isPlaying && p.isConnected);
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg">
        <motion.div className="text-center" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-6xl mb-2">📸</p>
          <h1 className="text-4xl font-['Fredoka_One'] text-[#FF6B6B]">Smile for the Camera</h1>
          <p className="text-xl text-gray-300 font-['Nunito'] mt-1">Take a selfie to start the chain...</p>
        </motion.div>
        <div className="w-full bg-[#1A1A2E] rounded-2xl p-6 border border-[#FF6B6B]/30">
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-400 font-['Nunito']">Selfies submitted</span>
            <span className="text-[#FF6B6B] font-['Fredoka_One'] text-2xl">{(dtData.submittedPlayerIds || []).length}<span className="text-gray-500">/{totalPrompts}</span></span>
          </div>
          <ProgressBar value={(dtData.submittedPlayerIds || []).length} total={totalPrompts} color="#FF6B6B" />
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {activePlayers.map(p => <PlayerAvatar key={p.id} player={p} size="sm" status={(dtData.submittedPlayerIds || []).includes(p.id) ? 'answered' : 'waiting'} />)}
          </div>
        </div>
      </div>
    );
  }

  // ── DRAWING phase ────────────────────────────────────────────────────────
  if (status === 'dt-drawing') {
    const activePlayers = players.filter(p => p.isPlaying && p.isConnected);
    const chainEntries = Object.entries(chainProgress);
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg">
        <motion.div className="text-center" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-6xl mb-2">🎨</p>
          <h1 className="text-4xl font-['Fredoka_One'] text-[#FF6B6B]">Drawing Phase</h1>
          <p className="text-gray-300 font-['Nunito'] mt-1">Each player draws the same prompt step-by-step</p>
        </motion.div>
        <div className="w-full bg-[#1A1A2E] rounded-2xl p-5 border border-[#FF6B6B]/30">
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-400 font-['Nunito']">Chains completed</span>
            <span className="text-[#FF6B6B] font-['Fredoka_One'] text-2xl">{chainsCompletedCount}<span className="text-gray-500">/{totalChains}</span></span>
          </div>
          <ProgressBar value={chainsCompletedCount} total={totalChains} color="#FF6B6B" />
          {chainEntries.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {chainEntries.map(([id, cp]) => (
                <div key={id} className="flex items-center gap-3 bg-[#0D0D1A] rounded-xl px-3 py-2">
                  <span className="text-gray-400 text-sm font-['Nunito'] flex-1 truncate">
                    ✏️ {cp.drawerName} drawing ({cp.stepsDone}/{cp.totalSteps})
                  </span>
                  <ProgressBar value={cp.stepsDone} total={cp.totalSteps} color="#FF6B6B" />
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {activePlayers.map(p => <PlayerAvatar key={p.id} player={p} size="sm" status="waiting" />)}
          </div>
        </div>
      </div>
    );
  }

  // ── GUESSING phase ───────────────────────────────────────────────────────
  if (status === 'dt-guessing') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg">
        <motion.div className="text-center" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-6xl mb-2">🤔</p>
          <h1 className="text-4xl font-['Fredoka_One'] text-[#FF6B6B]">Guessing Phase</h1>
          <p className="text-gray-300 font-['Nunito'] mt-1">Each target player guesses the original prompt</p>
        </motion.div>
        <div className="w-full bg-[#1A1A2E] rounded-2xl p-6 border border-[#FF6B6B]/30">
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-400 font-['Nunito']">Guesses received</span>
            <span className="text-[#FF6B6B] font-['Fredoka_One'] text-2xl">{guessedCount}<span className="text-gray-500">/{totalGuessers}</span></span>
          </div>
          <ProgressBar value={guessedCount} total={totalGuessers} color="#FF6B6B" />
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {players.filter(p => p.isPlaying && p.isConnected).map(p => (
              <PlayerAvatar key={p.id} player={p} size="sm" status={(dtData.guessedPlayerIds || []).includes(p.id) ? 'answered' : 'waiting'} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── REVEAL phase ─────────────────────────────────────────────────────────
  if (status === 'dt-reveal') {
    const { step, promptIndex, totalPrompts: total, templateText, targetName, targetColor,
      originalSelfieData, authorName, finalText, drawingSteps, guessText,
      voteCount, totalVoters, success, correctCount, closeCount, wrongCount } = reveal;
    const N = (drawingSteps || []).length;

    // Determine which drawing step to show (0-indexed within drawingSteps)
    const drawingStepIdx = step >= 4 && step <= 3 + N ? step - 4 : -1;
    const showDrawing = drawingStepIdx >= 0;
    const showGuess = step === N + 4;
    const showVote = step >= N + 5;
    const showTemplate = step === 0;
    const showTarget = step === 1;
    const showSelfie = step === 2;
    const showFinalText = step === 3;

    const currentStep = drawingStepIdx >= 0 ? (drawingSteps[drawingStepIdx] || null) : null;

    return (
      <div className="flex flex-col items-center gap-4 w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between w-full">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={promptIndex}>
            <p className="text-[#FF6B6B] font-['Fredoka_One'] text-lg">📖 Chain {(promptIndex || 0) + 1} of {total}</p>
          </motion.div>
          <span className="text-gray-400 font-['Nunito'] text-sm">Step {step + 1}</span>
        </div>

        {/* Content card */}
        <motion.div
          key={`${promptIndex}-${step}`}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="w-full bg-[#1A1A2E] rounded-2xl p-6 border border-[#FF6B6B]/30 flex flex-col items-center gap-4"
        >
          {showTemplate && (
            <>
              <p className="text-gray-400 font-['Nunito'] text-sm uppercase tracking-widest">Original Prompt Template</p>
              <p className="text-2xl font-['Fredoka_One'] text-[#FFE66D] text-center">"{templateText}"</p>
              <p className="text-gray-500 font-['Nunito'] text-sm">written by <span className="text-white">{authorName}</span></p>
            </>
          )}
          {showTarget && (
            <>
              <p className="text-gray-400 font-['Nunito'] text-sm uppercase tracking-widest">Target Player</p>
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl font-['Fredoka_One'] text-white" style={{ backgroundColor: targetColor || '#FF6B6B' }}>
                {(targetName || '?')[0].toUpperCase()}
              </div>
              <p className="text-3xl font-['Fredoka_One'] text-white">{targetName}</p>
            </>
          )}
          {showSelfie && (
            <>
              <p className="text-gray-400 font-['Nunito'] text-sm uppercase tracking-widest">{targetName}'s Selfie</p>
              {originalSelfieData
                ? <img src={originalSelfieData} alt={targetName} className="w-40 h-40 rounded-2xl object-cover border-2 border-[#FF6B6B]/40" />
                : <div className="w-40 h-40 rounded-2xl bg-[#0D0D1A] flex items-center justify-center text-6xl">🤳</div>
              }
            </>
          )}
          {showFinalText && (
            <>
              <p className="text-gray-400 font-['Nunito'] text-sm uppercase tracking-widest">What they had to draw</p>
              <p className="text-2xl font-['Fredoka_One'] text-[#4ECDC4] text-center">"{finalText}"</p>
            </>
          )}
          {showDrawing && currentStep && (
            <>
              <p className="text-gray-400 font-['Nunito'] text-sm uppercase tracking-widest">
                Drawing {drawingStepIdx + 1} of {N} — by <span className="text-white">{currentStep.playerName}</span>
              </p>
              <div className="rounded-2xl overflow-hidden border-2 border-[#FF6B6B]/30 bg-white">
                <ReplayCanvas strokes={currentStep.strokes || []} cssWidth={280} photoData={originalSelfieData || null} />
              </div>
            </>
          )}
          {showGuess && (
            <>
              <p className="text-gray-400 font-['Nunito'] text-sm uppercase tracking-widest">{targetName}'s Guess</p>
              <p className="text-2xl font-['Fredoka_One'] text-[#FFE66D] text-center">"{guessText || '…'}"</p>
              <p className="text-gray-500 font-['Nunito'] text-sm">Players are voting on how close this guess is…</p>
            </>
          )}
          {showVote && (
            <>
              <p className="text-gray-400 font-['Nunito'] text-sm uppercase tracking-widest">Vote Results</p>
              <p className="text-2xl font-['Fredoka_One'] text-[#FFE66D] text-center">"{guessText || '…'}"</p>
              <div className="flex gap-6 mt-2">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-3xl">✅</span>
                  <span className="font-['Fredoka_One'] text-xl text-green-400">{correctCount}</span>
                  <span className="text-xs text-gray-400 font-['Nunito']">Correct</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-3xl">🤏</span>
                  <span className="font-['Fredoka_One'] text-xl text-yellow-400">{closeCount}</span>
                  <span className="text-xs text-gray-400 font-['Nunito']">Close</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-3xl">❌</span>
                  <span className="font-['Fredoka_One'] text-xl text-red-400">{wrongCount}</span>
                  <span className="text-xs text-gray-400 font-['Nunito']">Wrong</span>
                </div>
              </div>
              {voteCount < totalVoters && (
                <p className="text-gray-500 font-['Nunito'] text-sm mt-1">{voteCount}/{totalVoters} votes received</p>
              )}
              {(reveal.votedPlayerIds || []).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 justify-center">
                  {players.filter(p => p.isPlaying && p.isConnected && p.id !== reveal.targetPlayerId).map(p => (
                    <PlayerAvatar key={p.id} player={p} size="sm" status={(reveal.votedPlayerIds || []).includes(p.id) ? 'voted' : 'waiting'} />
                  ))}
                </div>
              )}
              {success !== null && (
                <p className={`font-['Fredoka_One'] text-xl mt-1 ${success ? 'text-green-400' : 'text-red-400'}`}>
                  {success ? '🎉 Success!' : '😬 Not quite…'}
                </p>
              )}
            </>
          )}
        </motion.div>

        {/* Next button */}
        <motion.button
          onClick={onRevealNext}
          className="px-8 py-3 rounded-2xl font-['Fredoka_One'] text-xl text-white"
          style={{ backgroundColor: '#FF6B6B' }}
          whileTap={{ scale: 0.95 }}
        >
          ▶ Next
        </motion.button>
      </div>
    );
  }

  // ── END phase ────────────────────────────────────────────────────────────
  if (status === 'dt-end') {
    const medals = ['🥇', '🥈', '🥉'];
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg">
        <motion.div className="text-center" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-6xl mb-2">📞</p>
          <h1 className="text-4xl font-['Fredoka_One'] text-[#FF6B6B]">Drawing in Chain</h1>
          <p className="text-2xl font-['Fredoka_One'] text-[#FFE66D] mt-1">Game Over!</p>
        </motion.div>
        <div className="w-full flex flex-col gap-3">
          {(leaderboard || []).map((entry, i) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex items-center gap-4 bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl px-5 py-3"
            >
              <span className="text-2xl w-10 text-center">{medals[i] || `${i + 1}.`}</span>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-['Fredoka_One'] text-white flex-shrink-0"
                style={{ backgroundColor: entry.color || '#FF6B6B' }}>
                {(entry.name || '?')[0].toUpperCase()}
              </div>
              <p className="text-white font-['Fredoka_One'] text-lg flex-1 truncate">{entry.name}</p>
              <span className="text-[#FF6B6B] font-['Fredoka_One'] text-xl">{entry.score}</span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function FitbHostPanel({ fitbData, players, onSkipToVote, onShowResults, onNextRound }) {
  const activePlayers = players.filter(p => p.isPlaying && p.isConnected);
  if (fitbData.phase === 'end') {
    return (
      <div className="flex flex-col items-center gap-8 w-full max-w-lg">
        <div className="text-center">
          <p className="text-6xl mb-3">✏️</p>
          <h1 className="text-5xl font-['Fredoka_One'] text-[#F9CA24]">Fill in the Blank</h1>
          <p className="text-2xl font-['Fredoka_One'] text-[#FFE66D] mt-2">Game Over!</p>
        </div>
        <div className="w-full flex flex-col gap-3">
          {(fitbData.leaderboard || []).map((entry, i) => (
            <motion.div key={entry.playerId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
              className="flex items-center gap-4 rounded-2xl px-5 py-4"
              style={i === 0 ? { background: 'linear-gradient(135deg, #F9CA2420, #FFE66D20)', border: '2px solid #F9CA24' } : { background: '#1A1A2E', border: '1px solid #2D2D44' }}>
              <span className="text-2xl w-10 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
              <span className="flex-1 text-white font-['Fredoka_One'] text-xl">{entry.name}</span>
              <span className="font-['Fredoka_One'] text-2xl text-[#FFE66D]">{entry.score}</span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }
  if (fitbData.phase === 'results') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-3xl">
        <div className="text-center">
          <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest mb-2">Results · Round {fitbData.round}/{fitbData.totalRounds}</p>
          <h2 className="text-2xl font-['Fredoka_One'] text-[#F9CA24] leading-snug">{fitbData.question}</h2>
        </div>
        <div className="w-full flex flex-col gap-3">
          {(fitbData.answers || []).sort((a, b) => (b.votes || 0) - (a.votes || 0)).map((ans, i) => (
            <div key={ans.playerId} className="flex items-start gap-3 rounded-2xl px-5 py-4 bg-[#1A1A2E] border border-[#2D2D44]">
              <span className="font-['Fredoka_One'] text-[#FFE66D] w-6">{ans.votes || 0}★</span>
              <div className="flex-1">
                <p className="text-white font-['Nunito'] italic">"{ans.text}"</p>
                <p className="text-xs text-gray-400 mt-1">— {ans.playerName}</p>
              </div>
            </div>
          ))}
        </div>
        {onNextRound && (
          <button onClick={onNextRound} className="px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl bg-[#F9CA24] text-black hover:opacity-90 active:scale-95 transition">
            Next Round →
          </button>
        )}
      </div>
    );
  }
  if (fitbData.phase === 'voting') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-3xl">
        <h1 className="text-3xl font-['Fredoka_One'] text-[#F9CA24]">✏️ Fill in the Blank — Vote!</h1>
        <h2 className="text-xl font-['Nunito'] text-[#FFE66D] text-center">{fitbData.question}</h2>
        <div className="w-full max-w-md bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">Votes in</p>
            <p className="text-2xl font-['Fredoka_One'] text-white">{fitbData.voteCount}/{fitbData.totalVoters}</p>
          </div>
          <ProgressBar value={fitbData.voteCount} total={fitbData.totalVoters} color="#F9CA24" />
          <div className="flex flex-wrap gap-3 justify-center mt-4">
            {activePlayers.map(p => (
              <PlayerAvatar key={p.id} player={p} size="sm" status={fitbData.votedPlayerIds?.includes(p.id) ? 'voted' : 'waiting'} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-3xl">
      <div className="text-center">
        <p className="text-5xl mb-2">✏️</p>
        <h1 className="text-3xl font-['Fredoka_One'] text-[#F9CA24]">Fill in the Blank</h1>
        <p className="text-sm font-['Nunito'] text-gray-400 mt-1">Round {fitbData.round} of {fitbData.totalRounds}</p>
      </div>
      <div className="w-full bg-[#1A1A2E] border-2 border-[#F9CA24]/50 rounded-3xl p-8 text-center">
        <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-3">Complete the sentence</p>
        <h2 className="text-3xl font-['Fredoka_One'] text-[#FFE66D] leading-snug">{fitbData.question}</h2>
      </div>
      <div className="w-full max-w-md bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">Answers submitted</p>
          <p className="text-2xl font-['Fredoka_One'] text-white">{fitbData.answeredCount}/{fitbData.totalAnswerers || activePlayers.length}</p>
        </div>
        <ProgressBar value={fitbData.answeredCount} total={fitbData.totalAnswerers || activePlayers.length} color="#F9CA24" />
        <div className="flex flex-wrap gap-3 justify-center mt-4">
          {activePlayers.map(p => (
            <PlayerAvatar key={p.id} player={p} size="sm" status={fitbData.answeredPlayerIds?.includes(p.id) ? 'answered' : 'waiting'} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PhotoVoteHostPanel({ photoVoteData, players }) {
  const {
    subType = 'pmatch', phase = 'waiting', prompt = '', photos = [],
    votedPlayerIds = [], submittedPlayerIds = [], voteResults = [],
    round = 0, totalRounds = 5, leaderboard = [],
  } = photoVoteData || {};
  const activePlayers = players.filter(p => p.isPlaying !== false && p.isConnected !== false);
  const label = subType === 'photoassoc' ? '🎯 Prompt Match' : '🎭 Selfie Challenge';
  const color = subType === 'photoassoc' ? '#A29BFE' : '#FDCB6E';

  if (phase === 'photo') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
        <h1 className="text-3xl font-['Fredoka_One']" style={{ color }}>{label}</h1>
        <p className="text-gray-400 font-['Nunito']">Players are submitting their selfies...</p>
        <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
          <ProgressBar value={submittedPlayerIds.length} total={activePlayers.length} color={color} label="Photos submitted" sublabel />
          <div className="flex flex-wrap gap-3 justify-center mt-4">
            {activePlayers.map(p => (
              <PlayerAvatar key={p.id} player={p} size="sm" status={submittedPlayerIds.includes(p.id) ? 'answered' : 'waiting'} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'voting') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
        <h1 className="text-3xl font-['Fredoka_One']" style={{ color }}>{label} — Round {round}/{totalRounds}</h1>
        {prompt && (
          <div className="w-full bg-[#1A1A2E] border-2 rounded-2xl p-5 text-center" style={{ borderColor: color }}>
            <p className="text-2xl font-['Fredoka_One'] text-white">{prompt}</p>
          </div>
        )}
        <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">Votes in</p>
            <p className="text-2xl font-['Fredoka_One'] text-white">{votedPlayerIds.length}/{activePlayers.length}</p>
          </div>
          <ProgressBar value={votedPlayerIds.length} total={activePlayers.length} color={color} />
          <div className="flex flex-wrap gap-3 justify-center mt-4">
            {activePlayers.map(p => (
              <PlayerAvatar key={p.id} player={p} size="sm" status={votedPlayerIds.includes(p.id) ? 'voted' : 'waiting'} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'results') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
        <h1 className="text-3xl font-['Fredoka_One']" style={{ color }}>{label} — Round {round} Results</h1>
        {prompt && (
          <div className="w-full bg-[#1A1A2E] rounded-2xl px-4 py-2 text-center mb-1">
            <p className="font-['Nunito'] text-sm font-semibold" style={{ color: '#FFE66D' }}>{prompt}</p>
          </div>
        )}
        <div className="flex flex-col gap-3 w-full">
          {voteResults.map((r, i) => (
            <motion.div key={r.playerId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
              className={`flex items-center gap-4 rounded-2xl p-4 border ${r.isWinner ? 'border-yellow-400 bg-yellow-400/10' : 'border-[#2D2D44] bg-[#1A1A2E]'}`}>
              <span className="text-2xl w-8 text-center">{r.isWinner ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
              {r.photoData ? (
                <img src={r.photoData} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" alt="" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-[#2D2D44] flex items-center justify-center text-2xl flex-shrink-0">🤷</div>
              )}
              <p className="flex-1 font-['Fredoka_One'] text-white text-lg">{r.playerName}</p>
              <span className="font-['Fredoka_One'] text-xl" style={{ color }}>{r.voteCount} vote{r.voteCount !== 1 ? 's' : ''}</span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'ended') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
        <h1 className="text-3xl font-['Fredoka_One']" style={{ color }}>🏆 {label} — Final Results!</h1>
        <div className="flex flex-col gap-3 w-full">
          {leaderboard.map((entry, i) => (
            <motion.div key={entry.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
              className="flex items-center gap-4 rounded-2xl px-5 py-4"
              style={i === 0 ? { background: 'linear-gradient(135deg, #FFE66D20, #FDCB6E20)', border: `2px solid ${color}` } : { background: '#1A1A2E', border: '1px solid #2D2D44' }}>
              <span className="text-2xl w-10 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
              <span className="flex-1 text-white font-['Fredoka_One'] text-xl">{entry.name}</span>
              <span className="font-['Fredoka_One'] text-2xl" style={{ color }}>{entry.pts} pts</span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-xl">
      <p className="text-6xl">{subType === 'photoassoc' ? '🏆' : '🎯'}</p>
      <h1 className="text-3xl font-['Fredoka_One']" style={{ color }}>{label}</h1>
      <p className="text-gray-400 font-['Nunito']">Starting game...</p>
    </div>
  );
}

function SimplePhotoHostPanel({ label, phase, players, onSkipToResults, onNextRound }) {
  const activePlayers = players.filter(p => p.isPlaying && p.isConnected);
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-xl">
      <h1 className="text-3xl font-['Fredoka_One'] text-[#FFE66D]">{label}</h1>
      <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
        <p className="text-lg font-['Fredoka_One'] text-white mb-2 capitalize">Phase: {phase || '—'}</p>
        <p className="text-sm font-['Nunito'] text-gray-400">{activePlayers.length} active players</p>
      </div>

      {(phase === 'voting') && (
        <button onClick={onSkipToResults} className="w-full py-3 rounded-2xl bg-[#FFE66D] text-black font-['Fredoka_One'] text-lg">
          🏆 Show Results
        </button>
      )}

      {(phase === 'results') && (
        <button onClick={onNextRound} className="w-full py-3 rounded-2xl bg-[#4ECDC4] text-black font-['Fredoka_One'] text-lg">
          Next Round ▶️
        </button>
      )}
    </div>
  );
}

function CaptionHostPanel({ captionData, players }) {
  const phase = captionData?.phase;
  const roundLabel = captionData?.totalRounds > 1 ? ` — Round ${captionData.round || 1}/${captionData.totalRounds}` : '';

  const photoBlock = captionData?.featuredPhotoData ? (
    <div className="w-full rounded-2xl overflow-hidden border border-[#2D2D44]" style={{ aspectRatio: '4/3' }}>
      <img src={captionData.featuredPhotoData} alt="featured" className="w-full h-full object-cover" />
    </div>
  ) : null;

  if (phase === 'photo') {
    const activePlayers = players.filter(p => p.isPlaying && p.isConnected);
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-xl">
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8]">💬 Selfie Captions{roundLabel}</h1>
        <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5 text-center">
          <p className="text-lg font-['Fredoka_One'] text-white mb-1">📸 Taking selfies…</p>
          <p className="text-sm font-['Nunito'] text-gray-400">{activePlayers.length} players</p>
        </div>
      </div>
    );
  }

  if (phase === 'writing') {
    const written = captionData.captionCount || 0;
    const total = captionData.totalWriters || players.filter(p => p.isPlaying && p.isConnected).length;
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-xl">
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8]">💬 Selfie Captions{roundLabel}</h1>
        {photoBlock}
        {captionData.featuredOwnerName && (
          <p className="text-sm font-['Nunito'] text-gray-400">📸 {captionData.featuredOwnerName}'s photo</p>
        )}
        {captionData.prompt && (
          <div className="w-full bg-[#1A1A2E] border border-[#FD79A8]/40 rounded-2xl p-4 text-center">
            <p className="text-lg font-['Fredoka_One'] text-[#FD79A8]">✏️ {captionData.prompt}</p>
          </div>
        )}
        <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-4">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-['Nunito'] text-gray-400">Captions written</span>
            <span className="text-sm font-['Fredoka_One'] text-white">{written}/{total}</span>
          </div>
          <div className="w-full bg-[#2D2D44] rounded-full h-2">
            <div className="bg-[#FD79A8] h-2 rounded-full transition-all" style={{ width: total ? `${(written / total) * 100}%` : '0%' }} />
          </div>
          <div className="flex flex-wrap gap-3 justify-center mt-4">
            {players.filter(p => p.isPlaying && p.isConnected).map(p => (
              <PlayerAvatar key={p.id} player={p} size="sm" status={(captionData.captionSubmittedPlayerIds || []).includes(p.id) ? 'answered' : 'waiting'} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'voting') {
    const voted = captionData.voteCount || 0;
    const total = captionData.totalVoters || players.filter(p => p.isPlaying && p.isConnected).length;
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-xl">
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8]">💬 Selfie Captions{roundLabel}</h1>
        {photoBlock}
        {captionData.prompt && (
          <div className="w-full bg-[#1A1A2E] border border-[#FD79A8]/40 rounded-2xl p-4 text-center">
            <p className="text-base font-['Nunito'] text-[#FD79A8]">✏️ {captionData.prompt}</p>
          </div>
        )}
        <div className="w-full flex flex-col gap-2">
          {(captionData.captions || []).map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 bg-[#1A1A2E] border border-[#2D2D44] rounded-xl px-4 py-2">
              <span className="text-xs font-['Fredoka_One'] text-gray-500 w-5">{i + 1}</span>
              <span className="flex-1 text-sm font-['Nunito'] text-white">{c.text}</span>
            </div>
          ))}
        </div>
        <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-4">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-['Nunito'] text-gray-400">Votes in</span>
            <span className="text-sm font-['Fredoka_One'] text-white">{voted}/{total}</span>
          </div>
          <div className="w-full bg-[#2D2D44] rounded-full h-2">
            <div className="bg-[#FFE66D] h-2 rounded-full transition-all" style={{ width: total ? `${(voted / total) * 100}%` : '0%' }} />
          </div>
          <div className="flex flex-wrap gap-3 justify-center mt-4">
            {players.filter(p => p.isPlaying && p.isConnected).map(p => (
              <PlayerAvatar key={p.id} player={p} size="sm" status={captionData.votedPlayerIds?.includes(p.id) ? 'voted' : 'waiting'} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'results') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-xl">
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8]">💬 Results{roundLabel}</h1>
        {photoBlock}
        {captionData.featuredOwnerName && (
          <p className="text-sm font-['Nunito'] text-gray-400">📸 {captionData.featuredOwnerName}'s photo</p>
        )}
        {captionData.prompt && (
          <div className="w-full bg-[#1A1A2E] border border-[#FD79A8]/40 rounded-2xl p-4 text-center">
            <p className="text-base font-['Nunito'] text-[#FD79A8]">✏️ {captionData.prompt}</p>
          </div>
        )}
        <div className="w-full flex flex-col gap-2">
          {(captionData.captionResults || []).map((c, i) => (
            <div key={c.id} className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${i === 0 ? 'bg-[#FFE66D]/10 border-[#FFE66D]/60' : 'bg-[#1A1A2E] border-[#2D2D44]'}`}>
              <span className="text-lg w-8 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-['Nunito'] text-white leading-tight">{c.text}</p>
                <p className="text-xs font-['Nunito'] text-gray-400 mt-0.5">— {c.playerName}</p>
              </div>
              <span className="text-base font-['Fredoka_One'] text-[#FFE66D] shrink-0">{c.voteCount} 🗳️</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fallback
  const activePlayers = players.filter(p => p.isPlaying && p.isConnected);
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-xl">
      <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8]">💬 Selfie Captions{roundLabel}</h1>
      <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5 text-center">
        <p className="text-sm font-['Nunito'] text-gray-400">{activePlayers.length} active players</p>
      </div>
    </div>
  );
}

function SelfieHostPanel({ selfieData, players, onSkipToVote, onShowResults }) {
  const activePlayers = players.filter(p => p.isPlaying && p.isConnected);
  const roundLabel = selfieData.totalRounds > 1 ? ` — Round ${selfieData.round}/${selfieData.totalRounds}` : '';
  if (selfieData.phase === 'results') {
    return (
      <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
        <h1 className="text-4xl font-['Fredoka_One'] text-[#FD79A8]">🎨 Selfie Artist — Results{roundLabel}!</h1>
        <div className="w-full flex flex-col gap-3">
          {(selfieData.leaderboard || []).map((entry, i) => (
            <motion.div key={entry.playerId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
              className="flex items-center gap-4 rounded-2xl px-5 py-4"
              style={i === 0 ? { background: 'linear-gradient(135deg, #FD79A820, #FFE66D20)', border: '2px solid #FD79A8' } : { background: '#1A1A2E', border: '1px solid #2D2D44' }}>
              <span className="text-2xl w-10 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
              <span className="flex-1 text-white font-['Fredoka_One'] text-xl">{entry.name}</span>
              <span className="font-['Fredoka_One'] text-2xl text-[#FFE66D]">{entry.score}</span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }
  if (selfieData.phase === 'voting') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-xl">
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8]">📸 Vote for the Funniest!</h1>
        <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">Votes in</p>
            <p className="text-2xl font-['Fredoka_One'] text-white">{selfieData.voteCount}/{selfieData.totalVoters}</p>
          </div>
          <ProgressBar value={selfieData.voteCount} total={selfieData.totalVoters} color="#FD79A8" />
          <div className="flex flex-wrap gap-3 justify-center mt-4">
            {activePlayers.map(p => (
              <PlayerAvatar key={p.id} player={p} size="sm" status={selfieData.votedPlayerIds?.includes(p.id) ? 'voted' : 'waiting'} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (selfieData.phase === 'drawing') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-xl">
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8]">📸 Roasting in Progress...</h1>
        {selfieData.promptTemplate && (
          <div className="w-full bg-[#1A1A2E] border border-[#FD79A8]/40 rounded-2xl p-4 text-center">
            <p className="text-lg font-['Fredoka_One'] text-[#FD79A8]">🎨 {selfieData.promptTemplate}</p>
          </div>
        )}
        <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">Drawings submitted</p>
            <p className="text-2xl font-['Fredoka_One'] text-white">{selfieData.drawingCount}/{selfieData.totalDrawers || activePlayers.length}</p>
          </div>
          <ProgressBar value={selfieData.drawingCount} total={selfieData.totalDrawers || activePlayers.length} color="#FD79A8" />
          <div className="flex flex-wrap gap-3 justify-center mt-4">
            {activePlayers.map(p => (
              <PlayerAvatar key={p.id} player={p} size="sm" status={selfieData.drawnPlayerIds?.includes(p.id) ? 'answered' : 'waiting'} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-xl">
      <p className="text-5xl">📸</p>
      <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8]">Selfie Artist</h1>
      <p className="text-gray-400 font-['Nunito']">Players are taking their selfies...</p>
      <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">Selfies submitted</p>
          <p className="text-2xl font-['Fredoka_One'] text-white">{selfieData.photoCount}/{selfieData.totalPhotographers || activePlayers.length}</p>
        </div>
        <ProgressBar value={selfieData.photoCount} total={selfieData.totalPhotographers || activePlayers.length} color="#FD79A8" />
        <div className="flex flex-wrap gap-3 justify-center mt-4">
          {activePlayers.map(p => (
            <PlayerAvatar key={p.id} player={p} size="sm" status={selfieData.submittedPlayerIds?.includes(p.id) ? 'answered' : 'waiting'} />
          ))}
        </div>
      </div>
    </div>
  );
}

const GAME_TYPES_FOR_CREATE = [
  { id: 'most-likely-to',    label: '👑 Most Likely To',      desc: 'Who fits the prompt?',           accent: '#4ECDC4' },
  { id: 'who-said-that',     label: '🤔 Who Said That?',      desc: 'Guess who wrote it!',            accent: '#FFE66D' },
  { id: 'situational',       label: ' Situational',         desc: 'Answer for someone!',            accent: '#A8E6CF' },
  { id: 'this-or-that',      label: '⚡ This or That',        desc: 'Pick a side!',                   accent: '#6C5CE7' },
  { id: 'drawing',           label: '🎨 Pictionary Battle',    desc: 'Draw and guess!',                accent: '#C39BD3' },
  { id: 'fill-in-the-blank', label: '✏️ Fill in the Blank',  desc: 'Finish the sentence!',           accent: '#F9CA24' },
  { id: 'draw-telephone',    label: '📞 Drawing in Chain',    desc: 'Draw step by step, guess the prompt!', accent: '#FF6B6B' },
  { id: 'selfie-roast',      label: '📸 Selfie Artist',       desc: "Draw on someone's selfie!",     accent: '#FD79A8' },
  { id: 'caption',           label: '💬 Selfie Captions',     desc: 'Write funny captions!',          accent: '#FD79A8' },
  { id: 'pmatch',            label: '🎭 Selfie Challenge',    desc: 'Act out a prompt — best selfie wins!', accent: '#FDCB6E' },
  { id: 'photoassoc',        label: '🎯 Prompt Match',        desc: 'Vote who matches the vibe!',     accent: '#A29BFE' },
  { id: 'mixed',             label: '🎲 Mixed',               desc: 'All modes shuffled!',            accent: '#FF8B94' },
  { id: 'playlist',          label: '📋 Playlist',            desc: 'Play multiple games in order!',  accent: '#FDCB6E', colSpan: 2 },
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

const MIXED_SUB_GAMES = [
  { id: 'who-said-that', label: '🤔 Who Said That?', accent: '#FFE66D' },
  { id: 'situational',   label: ' Situational',   accent: '#A8E6CF' },
  { id: 'this-or-that',  label: '⚡ This or That',  accent: '#6C5CE7' },
  { id: 'drawing',       label: '🎨 Pictionary Battle',  accent: '#C39BD3' },
];

const DEFAULT_SUB_GAMES = ['who-said-that', 'situational', 'this-or-that', 'drawing'];

function CreateRoomForm({ onSubmit, onBack }) {
  const [gameType, setGameType] = React.useState('most-likely-to');
  const [gameName, setGameName] = React.useState('');
  const [rounds, setRounds] = React.useState(5);
  const [selectedSubGames, setSelectedSubGames] = React.useState(DEFAULT_SUB_GAMES);
  const [roundsPerSubGame, setRoundsPerSubGame] = React.useState(3);
  const [drawMode, setDrawMode] = React.useState('classic');
  const [roundDurationSecs, setRoundDurationSecs] = React.useState(60);
  const [queueItems, setQueueItems] = React.useState([
    { type: 'most-likely-to', rounds: 5 },
  ]);

  const toggleSubGame = (id) => {
    setSelectedSubGames(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(g => g !== id) : prev) : [...prev, id]
    );
  };

  const addQueueItem = (type) => {
    setQueueItems(prev => [...prev, { type, rounds: 5 }]);
  };

  const removeQueueItem = (idx) => {
    setQueueItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  };

  const moveQueueItem = (idx, dir) => {
    setQueueItems(prev => {
      const next = [...prev];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  const updateQueueRounds = (idx, val) => {
    setQueueItems(prev => prev.map((item, i) => i === idx ? { ...item, rounds: val } : item));
  };

  const handleSubmit = () => {
    const roomConfig = { roundDurationSecs };
    if (gameType === 'playlist') {
      const firstGame = queueItems[0];
      onSubmit({ gameType: firstGame.type, gameName: gameName.trim(), rounds: firstGame.rounds, drawMode, roomConfig, gameQueue: queueItems });
    } else if (gameType === 'mixed') {
      onSubmit({ gameType, gameName: gameName.trim(), rounds, selectedSubGames, roundsPerSubGame, roomConfig });
    } else if (gameType === 'drawing') {
      onSubmit({ gameType, gameName: gameName.trim(), rounds, drawMode, roomConfig });
    } else {
      onSubmit({ gameType, gameName: gameName.trim(), rounds, roomConfig });
    }
  };

  const PLAYLIST_GAME_OPTIONS = [
    { id: 'most-likely-to', label: '👑 Most Likely To', accent: '#4ECDC4' },
    { id: 'who-said-that',  label: '🤔 Who Said That?', accent: '#FFE66D' },
    { id: 'situational',   label: ' Situational',   accent: '#A8E6CF' },
    { id: 'this-or-that',  label: '⚡ This or That',  accent: '#6C5CE7' },
    { id: 'drawing',       label: '🎨 Pictionary Battle',  accent: '#C39BD3' },
    { id: 'fill-in-the-blank', label: '✏️ Fill in the Blank', accent: '#F9CA24' },
    { id: 'selfie-roast',  label: '📸 Draw on Friends', accent: '#FD79A8' },
    { id: 'caption',       label: '💬 Selfie Captions', accent: '#FD79A8' },
    { id: 'pmatch',        label: '🎭 Selfie Challenge', accent: '#FDCB6E' },
    { id: 'photoassoc',    label: '🎯 Prompt Match',     accent: '#A29BFE' },
  ];

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
                className={`rounded-2xl p-4 text-left border-2 transition active:scale-95 ${(g.id === 'mixed' || g.colSpan === 2) ? 'col-span-2' : ''}`}
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

        {gameType === 'mixed' && (
          <div className="mb-6">
            <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-3">Mini Games to Include</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {MIXED_SUB_GAMES.map(sg => {
                const active = selectedSubGames.includes(sg.id);
                return (
                  <button
                    key={sg.id}
                    onClick={() => toggleSubGame(sg.id)}
                    className="rounded-xl px-4 py-2.5 text-left border-2 transition active:scale-95 font-['Fredoka_One'] text-sm"
                    style={active
                      ? { backgroundColor: sg.accent + '22', borderColor: sg.accent, color: sg.accent }
                      : { borderColor: '#2D2D44', color: '#666', backgroundColor: 'transparent' }}
                  >
                    {active ? '✓ ' : ''}{sg.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-2">Rounds per Game</p>
            <div className="flex gap-2">
              {[3, 4, 5].map(r => (
                <button
                  key={r}
                  onClick={() => setRoundsPerSubGame(r)}
                  className="px-5 py-2 rounded-xl font-['Fredoka_One'] text-sm border-2 transition active:scale-95"
                  style={roundsPerSubGame === r
                    ? { borderColor: '#FDCB6E', color: '#FDCB6E', backgroundColor: '#FDCB6E18' }
                    : { borderColor: '#2D2D44', color: '#666', backgroundColor: 'transparent' }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {gameType === 'playlist' && (
          <div className="mb-6">
            <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-3">Game Queue</p>
            <div className="flex flex-col gap-2 mb-4">
              {queueItems.map((item, idx) => {
                const meta = PLAYLIST_GAME_OPTIONS.find(g => g.id === item.type) || { label: item.type, accent: '#aaa' };
                return (
                  <div key={idx} className="flex items-center gap-2 rounded-xl p-3 border-2" style={{ borderColor: meta.accent + '55', backgroundColor: meta.accent + '11' }}>
                    <span className="font-['Fredoka_One'] text-sm flex-1" style={{ color: meta.accent }}>{idx + 1}. {meta.label}</span>
                    <div className="flex items-center gap-1 mr-2">
                      <span className="text-xs text-gray-500">Rounds</span>
                      {[3, 5, 8].map(r => (
                        <button key={r} onClick={() => updateQueueRounds(idx, r)} className={`px-2 py-0.5 rounded text-xs font-['Fredoka_One'] border transition ${item.rounds === r ? 'border-[#4ECDC4] text-[#4ECDC4] bg-[#4ECDC4]/10' : 'border-[#2D2D44] text-gray-500'}`}>{r}</button>
                      ))}
                    </div>
                    <button onClick={() => moveQueueItem(idx, -1)} disabled={idx === 0} className="text-gray-500 hover:text-white disabled:opacity-30 px-1">↑</button>
                    <button onClick={() => moveQueueItem(idx, 1)} disabled={idx === queueItems.length - 1} className="text-gray-500 hover:text-white disabled:opacity-30 px-1">↓</button>
                    <button onClick={() => removeQueueItem(idx)} className="text-gray-500 hover:text-red-400 px-1">✕</button>
                  </div>
                );
              })}
            </div>
            <p className="text-xs font-['Nunito'] text-gray-500 mb-2">Add game →</p>
            <div className="flex flex-wrap gap-2">
              {PLAYLIST_GAME_OPTIONS.map(g => (
                <button key={g.id} onClick={() => addQueueItem(g.id)} className="px-3 py-1.5 rounded-xl border-2 font-['Fredoka_One'] text-xs transition active:scale-95" style={{ borderColor: g.accent + '66', color: g.accent, backgroundColor: g.accent + '11' }}>
                  + {g.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {gameType === 'drawing' && (
          <div className="mb-6">
            <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-3">Drawing Mode</p>
            <div className="flex gap-3">
              {[
                { id: 'classic', label: '🎨 Classic', desc: 'Everyone draws the same word' },
                { id: 'secret', label: '✦ Secret Words', desc: 'Each player gets a unique word' },
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setDrawMode(m.id)}
                  className="flex-1 rounded-2xl p-4 text-left border-2 transition active:scale-95"
                  style={drawMode === m.id
                    ? { backgroundColor: '#C39BD320', borderColor: '#C39BD3', boxShadow: '0 0 12px #C39BD344' }
                    : { borderColor: '#2D2D44', backgroundColor: '#0D0D1A60' }}
                >
                  <p className="font-['Fredoka_One'] text-sm" style={{ color: drawMode === m.id ? '#C39BD3' : '#ccc' }}>{m.label}</p>
                  <p className="font-['Nunito'] text-xs text-gray-400 mt-1">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

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

        <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-3 mt-6">Answer Time Limit</p>
        <div className="flex gap-2 mb-6">
          {[30, 45, 60, 90, 120].map(s => (
            <button
              key={s}
              onClick={() => setRoundDurationSecs(s)}
              className={`flex-1 py-2 rounded-xl font-['Fredoka_One'] text-sm border-2 transition active:scale-95 ${roundDurationSecs === s
                ? 'bg-[#6C5CE7]/20 border-[#6C5CE7] text-[#6C5CE7]'
                : 'border-[#2D2D44] text-gray-400 hover:border-[#6C5CE7]/50'}`}
            >
              {s}s
            </button>
          ))}
        </div>

        <button
          onClick={handleSubmit}
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
// QUEUE_GAME_LABELS imported from '../config/hostControls'

function HostControlBar({ status, isRoomCreator, players, mlt, votingData, fitbData, photoVoteData, captionData, isMixedMode, onStart, onMltPauseResume, onMltChangeQuestion, onMltSkip, onMltNext, onNextRound, onSkipQuestion, onSkipMiniGame, onTotNext, onSitNext, onNextAnswer, onDrawSkipToVote, onDrawShowResults, onDrawNextRound, onDrawNewWord, onDrawRestart, onNextQueueGame, onNewGame, onPlayAgain, onNewPartyPack, gameQueue, queueIndex, onSelfieNextRound, onSelfieSkipQuestion, onShowSelfieResults, onFitbChangeQuestion, onFitbSkipToVote, onFitbShowResults, onFitbNextRound, onPhotoVoteChangeQuestion, onPhotoVoteSkipToResults, onPhotoVoteNextRound, onCaptionChangeQuestion, onCaptionSkipToVoting, onCaptionSkipToResults, onCaptionNextRound }) {
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
        <button onClick={onMltChangeQuestion} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#4ECDC4] hover:text-[#4ECDC4] active:scale-95 transition">
          🔄 Change Question
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'mlt-results') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onMltNext} className="px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl bg-[#4ECDC4] text-black hover:bg-[#3dbdb5] active:scale-95 transition" style={{ boxShadow: '0 0 20px #4ECDC440' }}>
          Next Round →
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'question') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onSkipQuestion} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FFE66D] hover:text-[#FFE66D] active:scale-95 transition">
          ⏭ Skip Question
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'sit-voting') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onSkipQuestion} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FFE66D] hover:text-[#FFE66D] active:scale-95 transition">
          ⏭ Skip Question
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'round-end') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onNextRound} className="px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl bg-[#4ECDC4] text-black hover:bg-[#3dbdb5] active:scale-95 transition" style={{ boxShadow: '0 0 20px #4ECDC440' }}>
          Next Round →
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'tot') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onTotNext} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#6C5CE7] hover:text-[#6C5CE7] active:scale-95 transition">
          ⏭ Skip / Next →
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'sit-results') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onSitNext} className="px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl bg-[#A8E6CF] text-black hover:bg-[#8fd4b8] active:scale-95 transition" style={{ boxShadow: '0 0 20px #A8E6CF40' }}>
          Next Round →
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'voting') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onSkipQuestion} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FFE66D] hover:text-[#FFE66D] active:scale-95 transition">
          ⏭ Skip Question
        </button>
        <button
          onClick={onNextAnswer}
          disabled={!votingData?.allVotesIn}
          className={`px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl transition ${votingData?.allVotesIn ? 'bg-[#6C5CE7] text-white hover:bg-[#7d6fd4] active:scale-95' : 'bg-[#2D2D44] text-gray-500 cursor-not-allowed'}`}
          style={votingData?.allVotesIn ? { boxShadow: '0 0 20px #6C5CE760' } : {}}
        >
          {votingData?.allVotesIn ? 'Next Answer →' : '⏳ Waiting for votes...'}
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'drawing') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onDrawNewWord} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FFE66D] hover:text-[#FFE66D] active:scale-95 transition">
          🔄 New Word
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'draw-voting') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onDrawShowResults} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#C39BD3] text-[#C39BD3] hover:bg-[#C39BD3]/10 active:scale-95 transition">
          🏆 Show Results
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'draw-results') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onDrawNextRound} className="px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl bg-[#C39BD3] text-black hover:bg-[#b085c4] active:scale-95 transition" style={{ boxShadow: '0 0 20px #C39BD340' }}>
          Next Round →
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'fitb') {
    const fitbPhase = fitbData?.phase;
    if (fitbPhase === 'answering') {
      controls = (
        <div className="flex gap-3">
          <button onClick={onFitbChangeQuestion} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#F9CA24] hover:text-[#F9CA24] active:scale-95 transition">
            🔄 Change Question
          </button>
          <button onClick={onFitbSkipToVote} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FFE66D] hover:text-[#FFE66D] active:scale-95 transition">
            ⏭ Skip to Vote
          </button>
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        </div>
      );
    } else if (fitbPhase === 'voting') {
      controls = (
        <div className="flex gap-3">
          <button onClick={onFitbShowResults} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#F9CA24] text-[#F9CA24] hover:bg-[#F9CA24]/10 active:scale-95 transition">
            🏆 Show Results
          </button>
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        </div>
      );
    } else if (fitbPhase === 'results') {
      controls = (
        <div className="flex gap-3">
          <button onClick={onFitbNextRound} className="px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl bg-[#F9CA24] text-black hover:opacity-90 active:scale-95 transition" style={{ boxShadow: '0 0 20px #F9CA2440' }}>
            Next Round →
          </button>
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        </div>
      );
    }
  } else if (status === 'caption') {
    const capPhase = captionData?.phase;
    if (capPhase === 'writing') {
      controls = (
        <div className="flex gap-3">
          <button onClick={onCaptionChangeQuestion} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FD79A8] hover:text-[#FD79A8] active:scale-95 transition">
            🔄 Change Question
          </button>
          <button onClick={onCaptionSkipToVoting} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FD79A8] hover:text-[#FD79A8] active:scale-95 transition">
            🗳️ Start Voting
          </button>
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        </div>
      );
    } else if (capPhase === 'voting') {
      controls = (
        <div className="flex gap-3">
          <button onClick={onCaptionSkipToResults} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FFE66D] hover:text-[#FFE66D] active:scale-95 transition">
            🏆 Show Results
          </button>
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        </div>
      );
    } else if (capPhase === 'results') {
      controls = (
        <div className="flex gap-3">
          <button onClick={onCaptionNextRound} className="px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl bg-[#FD79A8] text-black hover:opacity-90 active:scale-95 transition" style={{ boxShadow: '0 0 20px #FD79A840' }}>
            Next Round →
          </button>
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        </div>
      );
    } else {
      controls = (
        <div className="flex gap-3">
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        </div>
      );
    }
  } else if (status === 'photovote') {
    const pvPhase = photoVoteData?.phase;
    if (pvPhase === 'voting') {
      controls = (
        <div className="flex gap-3">
          <button onClick={onPhotoVoteChangeQuestion} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FDCB6E] hover:text-[#FDCB6E] active:scale-95 transition">
            🔄 Change Question
          </button>
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        </div>
      );
    } else if (pvPhase === 'results') {
      controls = (
        <div className="flex gap-3">
          <button onClick={onPhotoVoteNextRound} className="px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl bg-[#FDCB6E] text-black hover:opacity-90 active:scale-95 transition" style={{ boxShadow: '0 0 20px #FDCB6E40' }}>
            Next Round →
          </button>
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        </div>
      );
    } else if (pvPhase === 'ended') {
      controls = (
        <div className="flex gap-3 flex-wrap justify-center">
          <button onClick={onPlayAgain} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#4ECDC4] text-[#4ECDC4] hover:bg-[#4ECDC4]/10 active:scale-95 transition">
            🔄 Play Again
          </button>
          <button onClick={onNewPartyPack} className="px-8 py-2.5 rounded-xl font-['Fredoka_One'] text-base bg-[#FFE66D] text-black hover:bg-[#ffdd33] active:scale-95 transition" style={{ boxShadow: '0 0 16px #FFE66D40' }}>
            🎮 New Party Pack
          </button>
        </div>
      );
    } else {
      controls = (
        <div className="flex gap-3">
          <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
            🔀 Skip Mini Game
          </button>
        </div>
      );
    }
  } else if (status === 'selfie') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onSelfieSkipQuestion} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FD79A8] hover:text-[#FD79A8] active:scale-95 transition">
          🔄 Change Question
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'selfie-vote') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onShowSelfieResults} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#FD79A8] text-[#FD79A8] hover:bg-[#FD79A8]/10 active:scale-95 transition">
          🏆 Show Results
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'selfie-round-results') {
    controls = (
      <div className="flex gap-3">
        <button onClick={onSelfieNextRound} className="px-10 py-3 rounded-2xl font-['Fredoka_One'] text-xl bg-[#FD79A8] text-black hover:bg-[#e8628f] active:scale-95 transition" style={{ boxShadow: '0 0 20px #FD79A840' }}>
          Next Round →
        </button>
        <button onClick={onSkipMiniGame} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF8B94] hover:text-[#FF8B94] active:scale-95 transition">
          🔀 Skip Mini Game
        </button>
      </div>
    );
  } else if (status === 'game-end' || status === 'mlt-end' || status === 'tot-end' || status === 'draw-end' || status === 'fitb-end' || status === 'selfie-results') {
    const hasNextInQueue = gameQueue && gameQueue.length > 1 && queueIndex < gameQueue.length - 1;
    const nextGame = hasNextInQueue ? gameQueue[queueIndex + 1] : null;
    controls = (
      <div className="flex gap-3 flex-wrap justify-center">
        <button onClick={onPlayAgain} className="px-6 py-2.5 rounded-xl font-['Fredoka_One'] text-base border-2 border-[#4ECDC4] text-[#4ECDC4] hover:bg-[#4ECDC4]/10 active:scale-95 transition">
          🔄 Play Again
        </button>
        {hasNextInQueue && (
          <button onClick={onNextQueueGame} className="px-8 py-2.5 rounded-xl font-['Fredoka_One'] text-base bg-[#6C5CE7] text-white hover:bg-[#5a4bd0] active:scale-95 transition" style={{ boxShadow: '0 0 16px #6C5CE740' }}>
            ▶ Next: {QUEUE_GAME_LABELS[nextGame.type] || nextGame.type}
          </button>
        )}
        <button
          onClick={onNewPartyPack}
          className="px-8 py-2.5 rounded-xl font-['Fredoka_One'] text-base bg-[#FFE66D] text-black hover:bg-[#ffdd33] active:scale-95 transition"
          style={{ boxShadow: '0 0 16px #FFE66D40' }}
        >
          🎮 New Party Pack
        </button>
      </div>
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
    voteCount: 0, totalVoters: 0, votedPlayerIds: [], secondsLeft: 30, paused: false,
    results: [], majorityIds: [], jokersUsed: [], scores: {}, prevScores: {}, leaderboard: [], gameName: '',
  });

  const [questionData, setQuestionData] = useState({
    text: '', round: 0, totalRounds: 0, type: 'wst', target: null,
    answeredCount: 0, totalAnswerers: 0, answeredPlayerIds: [], roundDuration: 60,
  });

  const [votingData, setVotingData] = useState({
    answers: [], currentIndex: 0, voteCount: 0, totalPlayers: 0, allVotesIn: false, votedPlayerIds: [],
  });

  const [roundEndData, setRoundEndData] = useState({ scores: {}, prevScores: {}, players: [], answers: [] });
  const [gameEndData, setGameEndData] = useState({ finalScores: {}, players: [] });

  const [totData, setTotData] = useState({
    question: '', a: '', b: '', round: 0, totalRounds: 0,
    voteCount: 0, totalVoters: 0, votedPlayerIds: [], countA: 0, countB: 0, pctA: 0, pctB: 0,
    majorityChoice: null, scores: {}, leaderboard: [], resultsVisible: false,
  });

  const [sitData, setSitData] = useState({
    question: '', target: null, answers: [],
    voteCount: 0, totalVoters: 0, hasResults: false, votingStarted: false, winners: [], scores: {}, votedPlayerIds: [],
  });

  const [drawData, setDrawData] = useState({
    word: '', round: 0, totalRounds: 0, phase: 'drawing', mode: 'classic',
    submittedCount: 0, submittedPlayerIds: [], totalDrawers: 0, voteCount: 0, totalVoters: 0,
    submissions: [], results: [], scores: {}, leaderboard: [], secondsLeft: 90, timeLimit: 90,
  });

  const DT_INITIAL = {
    phase: 'waiting',
    promptsSubmittedCount: 0, totalPrompts: 0, submittedPlayerIds: [],
    totalChains: 0, chainsCompletedCount: 0, chainProgress: {},
    guessedCount: 0, totalGuessers: 0, guessedPlayerIds: [],
    selfiePhotoCount: 0, selfieTotalPhotographers: 0,
    reveal: {
      promptIndex: 0, totalPrompts: 0, step: 0, promptId: null,
      templateText: '', targetName: '', targetColor: '#fff',
      originalSelfieData: null, authorName: '', finalText: '',
      drawingSteps: [], guessText: '',
      votes: {}, voteCount: 0, totalVoters: 0, votedPlayerIds: [],
      success: null, correctCount: 0, closeCount: 0, wrongCount: 0,
    },
    scores: {}, leaderboard: [],
  };
  const [dtData, setDtData] = useState(DT_INITIAL);

  const [fitbData, setFitbData] = useState({
    phase: 'waiting', round: 0, totalRounds: 0, question: null,
    answeredCount: 0, totalAnswerers: 0, answeredPlayerIds: [],
    voteCount: 0, totalVoters: 0, votedPlayerIds: [],
    answers: [], scores: {}, leaderboard: [],
  });

  const [selfieData, setSelfieData] = useState({
    phase: 'waiting', round: 1, totalRounds: 1, isFinal: false,
    photoCount: 0, totalPhotographers: 0, submittedPlayerIds: [],
    drawingCount: 0, totalDrawers: 0, drawnPlayerIds: [],
    voteCount: 0, totalVoters: 0, votedPlayerIds: [],
    submissions: [], scores: {}, leaderboard: [],
  });

  const [captionData, setCaptionData] = useState({ phase: 'waiting', round: 0, totalRounds: 3, votedPlayerIds: [], captionSubmittedPlayerIds: [] });
  const [photoVoteData, setPhotoVoteData] = useState({
    subType: 'pmatch', phase: 'waiting', round: 0, totalRounds: 5,
    prompt: '', photos: [], votedPlayerIds: [], submittedPlayerIds: [],
    voteResults: [], voteCount: 0, totalVoters: 0, leaderboard: [],
  });

  // Queue state for "Game Playlist" mode
  const [gameQueue, setGameQueue] = useState([]); // [{type, rounds, mode?}]
  const [queueIndex, setQueueIndex] = useState(0);

  // Change Game picker overlay
  const [showGamePicker, setShowGamePicker] = useState(false);
  // Main menu overlay
  const [showMainMenu, setShowMainMenu] = useState(false);
  const [mainMenuKeepPoints, setMainMenuKeepPoints] = useState(true);

  const socketRef = useRef(null);

  // ─── Attach game event handlers to a socket ──────────────────────────────
  const attachGameHandlers = useCallback((sock) => {
    // isActiveSock: returns false when this socket has been superseded by a newer one.
    // Stale handlers must not overwrite state after a reconnect / room-re-creation.
    const isActiveSock = () => socketRef.current === sock;

    sock.on('player_joined', ({ players: p }) => { if (isActiveSock()) setPlayers(p); });

    sock.on('options_updated', ({ gameType, selectedSubGames }) => {
      if (!isActiveSock()) return;
      if (gameType) {
        setGameInfo(prev => ({ ...prev, gameType }));
        setCreatorSettings(prev => ({ ...prev, gameType }));
      }
    });

    sock.on('mlt:prompt', (data) => {
      setMlt(prev => ({
        ...prev,
        prompt: data.prompt, round: data.round, totalRounds: data.totalRounds,
        voteCount: 0, totalVoters: data.players?.length || 0,
        secondsLeft: 30, paused: false, results: [], majorityIds: [], votedPlayerIds: [],
        gameName: data.gameName || prev.gameName,
      }));
      setStatus('mlt-voting');
    });

    sock.on('mlt:timer', ({ secondsLeft }) => setMlt(prev => ({ ...prev, secondsLeft })));
    sock.on('mlt:question_changed', (data) => setMlt(prev => ({ ...prev, currentPrompt: data.currentPrompt })));
    sock.on('mlt:paused', () => setMlt(prev => ({ ...prev, paused: true })));
    sock.on('mlt:resumed', ({ secondsLeft }) => setMlt(prev => ({ ...prev, paused: false, secondsLeft })));
    sock.on('mlt:vote_received', ({ voteCount, totalVoters, votedPlayerIds }) => setMlt(prev => ({ ...prev, voteCount, totalVoters, votedPlayerIds: votedPlayerIds || prev.votedPlayerIds })));

    sock.on('mlt:results', (data) => {
      setMlt(prev => ({
        ...prev,
        results: data.results || [], majorityIds: data.majorityPlayerIds || [],
        jokersUsed: data.jokersUsed || [],
        prevScores: { ...prev.scores }, scores: data.scores || prev.scores,
      }));
      setStatus('mlt-results');
    });

    sock.on('mlt:end', (data) => {
      setMlt(prev => ({ ...prev, leaderboard: data.leaderboard || [] }));
      setStatus('mlt-end');
    });

    sock.on('mlt:restarted', (data) => {
      if (!isActiveSock()) return;
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
          answeredCount: 0, totalAnswerers: 0, answeredPlayerIds: [], roundDuration: data.roundDuration || 60,
          startedAt: data.startedAt || Date.now(),
        });
        setStatus('question');
      }
    });

    sock.on('answer_received', ({ answeredCount, totalPlayers, answeredPlayerIds }) => {
      setQuestionData(prev => ({ ...prev, answeredCount, totalAnswerers: totalPlayers, answeredPlayerIds: answeredPlayerIds || [] }));
    });

    sock.on('voting_started', ({ answers, currentIndex, totalPlayers }) => {
      setVotingData({ answers, currentIndex, voteCount: 0, totalPlayers: totalPlayers || 0, votedPlayerIds: [] });
      setStatus('voting');
    });

    sock.on('vote_received', ({ votedCount, totalPlayers, votedPlayerIds }) => {
      setVotingData(prev => ({ ...prev, voteCount: votedCount, totalPlayers, votedPlayerIds: votedPlayerIds || [] }));
    });

    sock.on('all_votes_in', () => {
      setVotingData(prev => ({ ...prev, allVotesIn: true }));
    });

    sock.on('next_answer', ({ currentIndex }) => {
      setVotingData(prev => ({ ...prev, currentIndex, voteCount: 0, allVotesIn: false, votedPlayerIds: [] }));
    });

    sock.on('round_ended', (data) => {
      setRoundEndData(prev => ({ scores: data.scores || {}, prevScores: { ...prev.scores }, players: data.players || [], answers: data.answers || [] }));
      setStatus('round-end');
    });

    sock.on('game_ended', (data) => {
      setGameEndData({ finalScores: data.finalScores || {}, players: data.players || [] });
      setStatus('game-end');
    });

    sock.on('tot:vote_received', ({ voteCount, totalVoters, votedPlayerIds }) => setTotData(prev => ({ ...prev, voteCount, totalVoters, votedPlayerIds: votedPlayerIds || prev.votedPlayerIds })));

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
        hasResults: false, votingStarted: true, winners: [], votedPlayerIds: [],
      }));
      setStatus('sit-voting');
    });

    sock.on('sit:vote_received', ({ voteCount, totalVoters, votedPlayerIds }) => setSitData(prev => ({ ...prev, voteCount, totalVoters, votedPlayerIds: votedPlayerIds || [] })));

    sock.on('sit:results', (data) => {
      setSitData(prev => ({ ...prev, answers: data.answers || [], scores: data.scores || {}, winners: data.winners || [], hasResults: true }));
      setStatus('sit-results');
    });

    sock.on('draw:round_start', (data) => {
      setDrawData({
        word: data.word || '',
        round: data.round || 1,
        totalRounds: data.totalRounds || 1,
        phase: 'drawing',
        mode: data.mode || 'classic',
        submittedCount: 0,
        submittedPlayerIds: [],
        totalDrawers: data.players?.length || 0,
        voteCount: 0,
        totalVoters: 0,
        submissions: [],
        results: [],
        scores: {},
        leaderboard: [],
        timeLimit: data.timeLimit || 90,
        secondsLeft: data.timeLimit || 90,
      });
      setStatus('drawing');
    });

    sock.on('draw:timer', ({ secondsLeft }) => {
      setDrawData(prev => ({ ...prev, secondsLeft }));
    });

    sock.on('draw:submission_received', ({ submittedCount, totalDrawers, submittedPlayerIds }) => {
      setDrawData(prev => ({ ...prev, submittedCount, totalDrawers, submittedPlayerIds: submittedPlayerIds || [] }));
    });

    sock.on('draw:word_changed', (data) => {
      setDrawData(prev => ({ ...prev, word: data.word, submittedCount: 0, submittedPlayerIds: [] }));
    });

    sock.on('draw:voting_started', (data) => {
      setDrawData(prev => ({ ...prev, phase: 'voting', voteCount: 0, totalVoters: data.totalVoters || 0, submissions: data.submissions || [], mode: data.mode || prev.mode }));
      setStatus(prev => prev === 'drawing' ? 'draw-voting' : prev);
    });

    sock.on('draw:vote_received', ({ voteCount, totalVoters, votedPlayerIds }) => {
      setDrawData(prev => ({ ...prev, voteCount, totalVoters, votedPlayerIds: votedPlayerIds || prev.votedPlayerIds }));
    });

    sock.on('draw:results', (data) => {
      setDrawData(prev => ({ ...prev, phase: 'results', results: data.results || [], scores: data.scores || {}, leaderboard: data.leaderboard || [], mode: data.mode || prev.mode }));
      setStatus(prev => (prev === 'draw-voting' || prev === 'drawing') ? 'draw-results' : prev);
    });

    sock.on('draw:end', (data) => {
      setDrawData(prev => ({ ...prev, leaderboard: data.leaderboard || [] }));
      setStatus(prev => (prev === 'draw-results' || prev === 'draw-voting' || prev === 'drawing') ? 'draw-end' : prev);
    });

    // FITB handlers
    sock.on('fitb:round_start', (data) => {
      setFitbData(prev => ({
        ...prev, phase: 'answering', round: data.round, totalRounds: data.totalRounds,
        question: data.question, answeredCount: 0, totalAnswerers: data.totalAnswerers || 0,
        voteCount: 0, totalVoters: 0, answers: [],
      }));
      setStatus('fitb');
    });
    sock.on('fitb:answer_received', ({ answeredCount, totalAnswerers, answeredPlayerIds }) => {
      setFitbData(prev => ({ ...prev, answeredCount, totalAnswerers, answeredPlayerIds: answeredPlayerIds || prev.answeredPlayerIds }));
    });
    sock.on('fitb:voting_started', (data) => {
      setFitbData(prev => ({ ...prev, phase: 'voting', answers: data.answers || [], voteCount: 0, totalVoters: data.totalVoters || 0, votedPlayerIds: [] }));
    });
    sock.on('fitb:vote_received', ({ voteCount, totalVoters, votedPlayerIds }) => {
      setFitbData(prev => ({ ...prev, voteCount, totalVoters, votedPlayerIds: votedPlayerIds || prev.votedPlayerIds }));
    });
    sock.on('fitb:results', (data) => {
      setFitbData(prev => ({ ...prev, phase: 'results', answers: data.answers || [], scores: data.scores || {} }));
    });
    sock.on('fitb:end', (data) => {
      setFitbData(prev => ({ ...prev, phase: 'end', leaderboard: data.leaderboard || [] }));
      setStatus('fitb-end');
    });

    // Selfie handlers
    sock.on('selfie:photo_phase', (data) => {
      setSelfieData(prev => ({ ...prev, phase: 'photo', photoCount: 0, totalPhotographers: data.totalPhotographers || 0, round: data.round || prev.round, totalRounds: data.totalRounds || prev.totalRounds }));
      setStatus('selfie');
    });
    sock.on('selfie:photo_received', ({ photoCount, totalPhotographers, submittedPlayerIds }) => {
      setSelfieData(prev => ({ ...prev, photoCount, totalPhotographers, submittedPlayerIds: submittedPlayerIds || prev.submittedPlayerIds }));
    });
    sock.on('selfie:drawing_phase', (data) => {
      setSelfieData(prev => ({ ...prev, phase: 'drawing', drawingCount: 0, totalDrawers: data.totalDrawers || 0, drawnPlayerIds: [], promptTemplate: data.promptTemplate || '' }));
      setStatus('selfie'); // Ensure host shows selfie panel even when photo phase was skipped
    });
    sock.on('selfie:drawing_received', ({ drawingCount, totalDrawers, drawnPlayerIds }) => {
      setSelfieData(prev => ({ ...prev, drawingCount, totalDrawers, drawnPlayerIds: drawnPlayerIds || prev.drawnPlayerIds }));
    });
    sock.on('selfie:voting_started', (data) => {
      setSelfieData(prev => ({ ...prev, phase: 'voting', submissions: data.submissions || [], voteCount: 0, totalVoters: data.totalVoters || 0, votedPlayerIds: [] }));
      setStatus('selfie-vote');
    });
    sock.on('selfie:vote_received', ({ voteCount, totalVoters, votedPlayerIds }) => {
      setSelfieData(prev => ({ ...prev, voteCount, totalVoters, votedPlayerIds: votedPlayerIds || prev.votedPlayerIds }));
    });
    sock.on('selfie:results', (data) => {
      setSelfieData(prev => ({ ...prev, phase: 'results', submissions: data.submissions || [], scores: data.scores || {}, leaderboard: data.leaderboard || [], round: data.round || prev.round, totalRounds: data.totalRounds || prev.totalRounds, isFinal: !!data.isFinal }));
      setStatus(data.isFinal ? 'selfie-results' : 'selfie-round-results');
    });

    sock.on('caption:photo_phase', (data) => {
      setCaptionData({ phase: 'photo', round: data.round, totalRounds: data.totalRounds, prompt: '', featuredPhotoData: null, featuredOwnerName: '', captions: [], captionCount: 0, totalWriters: 0, voteCount: 0, totalVoters: 0, captionResults: [], votedPlayerIds: [], captionSubmittedPlayerIds: [] });
      setStatus('caption');
    });
    sock.on('caption:writing_phase', (data) => {
      setCaptionData(prev => ({ ...prev, phase: 'writing', round: data.round, totalRounds: data.totalRounds || prev.totalRounds, prompt: data.prompt || '', featuredOwnerId: data.featuredOwnerId, featuredOwnerName: data.featuredOwnerName || '', featuredPhotoData: data.featuredPhotoData || null, totalWriters: (data.writers || []).length, captionCount: 0, captionSubmittedPlayerIds: [] }));
    });
    sock.on('caption:caption_submitted', (data) => {
      setCaptionData(prev => ({ ...prev, captionCount: data.submittedCount, totalWriters: data.totalCount, captionSubmittedPlayerIds: data.submittedPlayerIds || prev.captionSubmittedPlayerIds }));
    });
    sock.on('caption:voting_phase', (data) => {
      setCaptionData(prev => ({ ...prev, phase: 'voting', captions: data.captions || [], featuredPhotoData: data.featuredPhotoData || prev.featuredPhotoData, featuredOwnerName: data.featuredOwnerName || prev.featuredOwnerName, voteCount: 0, totalVoters: 0, votedPlayerIds: [] }));
    });
    sock.on('caption:vote_received', (data) => {
      setCaptionData(prev => ({ ...prev, voteCount: data.voteCount, totalVoters: data.totalVoters, votedPlayerIds: data.votedPlayerIds || prev.votedPlayerIds }));
    });
    sock.on('caption:round_results', (data) => {
      setCaptionData(prev => ({ ...prev, phase: 'results', round: data.round, featuredPhotoData: data.featuredPhotoData || prev.featuredPhotoData, featuredOwnerName: data.featuredOwnerName || prev.featuredOwnerName, prompt: data.prompt || prev.prompt, captionResults: data.captionResults || [] }));
    });
    sock.on('caption:game_over', () => {
      setCaptionData(prev => ({ ...prev, phase: 'ended' }));
    });
    sock.on('caption:restarted', ({ players: p }) => {
      setPlayers(p || []);
      setCaptionData({ phase: 'waiting', round: 0, totalRounds: 3 });
      setStatus('lobby');
    });

    sock.on('photovote:photo_phase', (data) => {
      setPhotoVoteData({
        subType: data.subType || 'pmatch', phase: 'photo',
        round: data.round, totalRounds: data.totalRounds,
        prompt: '', photos: [], votedPlayerIds: [], submittedPlayerIds: [],
        voteResults: [], voteCount: 0, totalVoters: (data.players || []).length, leaderboard: [],
      });
      if (data.players && data.players.length > 0) setPlayers(data.players);
      setStatus('photovote');
    });
    sock.on('photovote:photo_submitted', (data) => {
      setPhotoVoteData(prev => ({
        ...prev,
        submittedPlayerIds: [...(prev.submittedPlayerIds || []).filter(id => id !== data.playerId), data.playerId],
      }));
    });
    sock.on('photovote:voting_phase', (data) => {
      setPhotoVoteData(prev => ({
        ...prev, phase: 'voting', round: data.round,
        prompt: data.prompt || '', photos: data.photos || [],
        totalRounds: data.totalRounds || prev.totalRounds,
        votedPlayerIds: [], voteCount: 0,
        totalVoters: (data.photos || []).length || prev.totalVoters,
      }));
      setStatus('photovote'); // also set status here in case photo phase was skipped
    });
    sock.on('photovote:vote_received', (data) => {
      setPhotoVoteData(prev => ({
        ...prev, voteCount: data.voteCount, totalVoters: data.totalVoters,
        votedPlayerIds: data.votedPlayerIds || prev.votedPlayerIds,
      }));
    });
    sock.on('photovote:round_results', (data) => {
      setPhotoVoteData(prev => ({
        ...prev, phase: 'results', round: data.round,
        voteResults: data.voteResults || [],
        prompt: data.prompt || prev.prompt,
        roundScores: data.roundScores || {},
      }));
    });
    sock.on('photovote:game_over', (data) => {
      setPhotoVoteData(prev => ({
        ...prev, phase: 'ended',
        leaderboard: data?.leaderboard || [],
        scores: data?.scores || {},
      }));
    });
    sock.on('photovote:restarted', ({ players: p }) => {
      setPlayers(p || []);
      setPhotoVoteData({
        subType: 'pmatch', phase: 'waiting', round: 0, totalRounds: 5,
        prompt: '', photos: [], votedPlayerIds: [], submittedPlayerIds: [],
        voteResults: [], voteCount: 0, totalVoters: 0, leaderboard: [],
      });
      setStatus('lobby');
    });

    sock.on('draw:restarted', ({ players: p }) => {
      setPlayers(p || []);
      setDrawData({ word: '', round: 0, totalRounds: 0, phase: 'drawing', mode: 'classic', submittedCount: 0, submittedPlayerIds: [], totalDrawers: 0, voteCount: 0, totalVoters: 0, submissions: [], results: [], scores: {}, leaderboard: [] });
      setStatus('lobby');
    });

    // ─── Draw Telephone events ────────────────────────────────────────────────
    sock.on('dt:selfie_phase', ({ players: p, photoCount, totalPhotographers }) => {
      if (!isActiveSock()) return;
      if (p && p.length > 0) setPlayers(p);
      setDtData(prev => ({ ...DT_INITIAL, phase: 'selfie', selfiePhotoCount: photoCount || 0, selfieTotalPhotographers: totalPhotographers || 0 }));
      setStatus('dt-selfie');
    });
    sock.on('dt:photo_received', ({ photoCount, totalPhotographers, submittedPlayerIds }) => {
      if (!isActiveSock()) return;
      setDtData(prev => ({ ...prev, selfiePhotoCount: photoCount, selfieTotalPhotographers: totalPhotographers, selfieSubmittedPlayerIds: submittedPlayerIds || prev.selfieSubmittedPlayerIds }));
    });
    sock.on('dt:prompt_phase', ({ players: p, totalPrompts }) => {
      if (!isActiveSock()) return;
      if (p && p.length > 0) setPlayers(p);
      setDtData(prev => ({ ...DT_INITIAL, phase: 'prompting', totalPrompts }));
      setStatus('dt-prompting');
    });
    sock.on('dt:prompt_received', ({ submittedCount, totalPrompts, submittedPlayerIds }) => {
      if (!isActiveSock()) return;
      setDtData(prev => ({ ...prev, promptsSubmittedCount: submittedCount, totalPrompts, submittedPlayerIds: submittedPlayerIds || prev.submittedPlayerIds }));
    });
    sock.on('dt:drawing_phase', ({ totalChains, players: p }) => {
      if (!isActiveSock()) return;
      if (p && p.length > 0) setPlayers(p);
      setDtData(prev => ({ ...prev, phase: 'drawing', totalChains, chainsCompletedCount: 0, chainProgress: {} }));
      setStatus('dt-drawing');
    });
    sock.on('dt:chain_progress', ({ chainsCompleted, totalChains }) => {
      if (!isActiveSock()) return;
      setDtData(prev => ({ ...prev, chainsCompletedCount: chainsCompleted, totalChains }));
    });
    sock.on('dt:drawing_progress', ({ promptId, stepsDone, totalSteps, drawerName }) => {
      if (!isActiveSock()) return;
      setDtData(prev => ({
        ...prev,
        chainProgress: { ...prev.chainProgress, [promptId]: { stepsDone, totalSteps, drawerName } },
      }));
    });
    sock.on('dt:guessing_phase', ({ totalGuessers }) => {
      if (!isActiveSock()) return;
      setDtData(prev => ({ ...prev, phase: 'guessing', totalGuessers, guessedCount: 0, guessedPlayerIds: [] }));
      setStatus('dt-guessing');
    });
    sock.on('dt:guess_received', ({ guessedCount, totalGuessers, guessedPlayerIds }) => {
      if (!isActiveSock()) return;
      setDtData(prev => ({ ...prev, guessedCount, totalGuessers, guessedPlayerIds: guessedPlayerIds || prev.guessedPlayerIds }));
    });
    sock.on('dt:reveal_phase', ({ totalPrompts }) => {
      if (!isActiveSock()) return;
      setDtData(prev => ({ ...prev, phase: 'reveal', reveal: { ...DT_INITIAL.reveal, totalPrompts } }));
      setStatus('dt-reveal');
    });
    sock.on('dt:reveal_update', (data) => {
      if (!isActiveSock()) return;
      setDtData(prev => ({ ...prev, phase: 'reveal', reveal: { ...data } }));
    });
    sock.on('dt:vote_received', ({ promptId, voteCount, totalVoters, votedPlayerIds }) => {
      if (!isActiveSock()) return;
      setDtData(prev => ({ ...prev, reveal: { ...prev.reveal, voteCount, totalVoters, votedPlayerIds: votedPlayerIds || prev.reveal.votedPlayerIds } }));
    });
    sock.on('dt:end', ({ scores, leaderboard }) => {
      if (!isActiveSock()) return;
      setDtData(prev => ({ ...prev, phase: 'end', scores: scores || {}, leaderboard: leaderboard || [] }));
      setStatus('dt-end');
    });
    sock.on('dt:restarted', ({ players: p }) => {
      if (!isActiveSock()) return;
      setPlayers(p || []);
      setDtData(DT_INITIAL);
      setStatus('lobby');
    });
    sock.on('dt:error', ({ message }) => {
      if (!isActiveSock()) return;
      setErrorMsg(message);
      setStatus('error');
    });

    sock.on('game_changed', ({ gameType, players: p, gameName }) => {
      if (!isActiveSock()) return;
      setGameInfo(prev => ({ ...prev, gameType: gameType || prev.gameType, gameName: gameName || prev.gameName }));
      setPlayers(p || []);
      setCreatorSettings(prev => ({ ...prev, gameType: gameType || prev.gameType }));
      setStatus('lobby');
    });

    sock.on('error', ({ message }) => {
      if (!isActiveSock()) return;
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
      if (roomPhase === 'drawing') {
        if (roomData?.draw?.phase === 'voting') return 'draw-voting';
        if (roomData?.draw?.phase === 'results') return 'draw-results';
        return 'drawing';
      }
      if (roomPhase === 'drawEnd') return 'draw-end';
      return 'lobby';
    };

    const sock = io(SERVER_URL, { autoConnect: false });
    socketRef.current = sock;

    sock.on('connect', () => sock.emit('join_spectator', { code: roomCodeParam }));

    sock.on('spectator_joined', ({ room }) => {
      setIsRoomCreator(true); // TV screen always has full host control
      setCreatorSettings(prev => ({ ...prev, gameType: room.gameType || prev.gameType }));
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
  const handleCreateRoom = useCallback(({ gameType, gameName, rounds, selectedSubGames, roundsPerSubGame, drawMode, roomConfig, gameQueue: queue }) => {
    setCreatorSettings({ gameType, rounds, drawMode: drawMode || 'classic' });
    if (queue && queue.length > 1) {
      setGameQueue(queue);
      setQueueIndex(0);
    } else {
      setGameQueue([]);
      setQueueIndex(0);
    }
    setStatus('connecting');

    // Disconnect any existing socket so its stale event handlers can't overwrite state
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const sock = io(SERVER_URL, { autoConnect: false });
    socketRef.current = sock;

    // Use once() so reconnects don't re-emit create_room and create a second room
    sock.once('connect', () => {
      const payload = { playerName: 'Screen Cast', gameType, gameName, hostIsPlaying: false };
      if (gameType === 'mixed' && selectedSubGames) payload.selectedSubGames = selectedSubGames;
      if (gameType === 'mixed' && roundsPerSubGame) payload.roundsPerSubGame = roundsPerSubGame;
      if (roomConfig) payload.roomConfig = roomConfig;
      sock.emit('create_room', payload);
    });

    sock.on('room_created', ({ code, players: initialPlayers, gameType: gt, gameName: gn }) => {
      // Guard: ignore if this socket has been superseded
      if (socketRef.current !== sock) return;
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
    } else if (creatorSettings.gameType === 'drawing') {
      sock.emit('draw:start', { code: gameInfo.code, rounds: creatorSettings.rounds, mode: creatorSettings.drawMode || 'classic' });
    } else if (creatorSettings.gameType === 'fill-in-the-blank') {
      sock.emit('fitb:start', { code: gameInfo.code, rounds: creatorSettings.rounds });
    } else if (creatorSettings.gameType === 'selfie-roast') {
      sock.emit('selfie:start', { code: gameInfo.code, rounds: creatorSettings.rounds });
    } else if (creatorSettings.gameType === 'caption') {
      sock.emit('caption:start', { code: gameInfo.code, rounds: creatorSettings.rounds });
    } else if (creatorSettings.gameType === 'pmatch') {
      sock.emit('photovote:start', { code: gameInfo.code, subType: 'pmatch', rounds: creatorSettings.rounds });
    } else if (creatorSettings.gameType === 'photoassoc') {
      sock.emit('photovote:start', { code: gameInfo.code, subType: 'photoassoc', rounds: creatorSettings.rounds });
    } else if (creatorSettings.gameType === 'draw-telephone') {
      sock.emit('dt:start', { code: gameInfo.code });
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

  // "Change Question" in MLT replaces the current round's prompt without advancing the round counter
  const handleMltChangeQuestion = () => socketRef.current?.emit('mlt:change_question', { code: gameInfo.code });
  const handleMltSkip = () => socketRef.current?.emit('mlt:skip', { code: gameInfo.code });

  const handleFitbChangeQuestion = () => socketRef.current?.emit('fitb:change_question', { code: gameInfo.code });
  const handleMltNext = () => socketRef.current?.emit('mlt:next_round', { code: gameInfo.code });
  const handleNextRound = () => socketRef.current?.emit('ready_next_round', { code: gameInfo.code });
  const handleSkipQuestion = () => socketRef.current?.emit('skip_question', { code: gameInfo.code });
  const handleSelfieNextRound = () => socketRef.current?.emit('selfie:next_round', { code: gameInfo.code });
  const handleSelfieSkipQuestion = () => socketRef.current?.emit('selfie:skip_question', { code: gameInfo.code });
  const handleSkipMiniGame = () => {
    // If there's a next game in the playlist queue, advance to it
    if (gameQueue && gameQueue.length > 1 && queueIndex + 1 < gameQueue.length) {
      handleNextQueueGame();
    } else {
      socketRef.current?.emit('skip_mini_game', { code: gameInfo.code });
    }
  };
  const handleKickPlayer = (playerId) => socketRef.current?.emit('kick_player', { code: gameInfo.code, targetPlayerId: playerId });
  const handleTotNext = () => socketRef.current?.emit('tot:next_round', { code: gameInfo.code });
  const handleSitNext = () => socketRef.current?.emit('sit:next', { code: gameInfo.code });
  const handleNextAnswer = () => socketRef.current?.emit('next_answer_request', { code: gameInfo.code });
  const handleDrawNewWord = () => socketRef.current?.emit('draw:skip_word', { code: gameInfo.code });
  const handleDrawRestart = () => socketRef.current?.emit('draw:restart', { code: gameInfo.code });
  const handleNextQueueGame = () => {
    const nextIdx = queueIndex + 1;
    if (nextIdx >= gameQueue.length) return;
    const nextGame = gameQueue[nextIdx];
    const code = gameInfo.code;
    const sock = socketRef.current;
    if (!sock || !code) return;
    setQueueIndex(nextIdx);
    const nextRounds = nextGame.rounds || 5;
    const nextMode = nextGame.mode || 'classic';
    setCreatorSettings({ gameType: nextGame.type, rounds: nextRounds, drawMode: nextMode });
    setGameInfo(prev => ({ ...prev, gameType: nextGame.type }));
    // Start the next game directly — server start handlers cancel previous timers and reset state
    // (no change_game needed; players navigate on receiving the new game's first event)
    const t = nextGame.type;
    if (t === 'most-likely-to') sock.emit('mlt:start', { code, rounds: nextRounds, allowSelfVote: true });
    else if (t === 'drawing') sock.emit('draw:start', { code, rounds: nextRounds, mode: nextMode });
    else if (t === 'fill-in-the-blank') sock.emit('fitb:start', { code, rounds: nextRounds });
    else if (t === 'selfie-roast') sock.emit('selfie:start', { code, rounds: nextRounds });
    else if (t === 'caption') sock.emit('caption:start', { code, rounds: nextRounds });
    else if (t === 'pmatch') sock.emit('photovote:start', { code, subType: 'pmatch', rounds: nextRounds });
    else if (t === 'photoassoc') sock.emit('photovote:start', { code, subType: 'photoassoc', rounds: nextRounds });
    else if (t === 'draw-telephone') sock.emit('dt:start', { code });
    else sock.emit('start_game', { code });
  };

  const handleNewGame = () => {
    // Reset room to lobby keeping all players connected, so group can play again
    socketRef.current?.emit('change_game', { code: gameInfo.code, newGameType: gameInfo.gameType || 'who-said-that' });
    setGameQueue([]);
    setQueueIndex(0);
  };

  const handlePlayAgain = () => {
    const code = gameInfo.code;
    const sock = socketRef.current;
    if (!sock || !code) return;
    const gameType = creatorSettings.gameType || gameInfo.gameType;
    // Reset everyone to lobby — they'll start again from the lobby screen
    sock.emit('change_game', { code, newGameType: gameType });
    setGameQueue([]);
    setQueueIndex(0);
  };

  const handleNewPartyPack = () => {
    // Create a brand-new room — navigate to the setup/create screen
    setGameQueue([]);
    setQueueIndex(0);
    setStatus('creating');
  };

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

  const joinBase = CLIENT_URL || window.location.origin;
  const joinUrl = `${joinBase}/?join=${gameInfo.code || roomCodeParam || ''}`;
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
        return <LobbyPanel gameInfo={gameInfo} players={players} joinUrl={joinUrl} onKickPlayer={isRoomCreator ? handleKickPlayer : null} />;
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
      case 'drawing':
      case 'draw-voting':
      case 'draw-results':
      case 'draw-end':
        return <DrawingHostPanel drawData={drawData} players={players} status={status} />;
      case 'dt-prompting':
      case 'dt-selfie':
      case 'dt-drawing':
      case 'dt-guessing':
      case 'dt-reveal':
      case 'dt-end':
        return <DtHostPanel dtData={dtData} players={players} status={status} onRevealNext={() => socketRef.current?.emit('dt:reveal_next', { code: gameInfo.code })} />;
      case 'fitb':
      case 'fitb-end':
        return <FitbHostPanel fitbData={fitbData} players={players} onSkipToVote={() => socketRef.current?.emit('fitb:skip_to_vote', { code: gameInfo.code })} onShowResults={() => socketRef.current?.emit('fitb:show_results', { code: gameInfo.code })} onNextRound={() => socketRef.current?.emit('fitb:next_round', { code: gameInfo.code })} />;
      case 'selfie':
      case 'selfie-vote':
      case 'selfie-round-results':
      case 'selfie-results':
        return <SelfieHostPanel selfieData={selfieData} players={players} onSkipToVote={() => socketRef.current?.emit('selfie:skip_to_vote', { code: gameInfo.code })} onShowResults={() => socketRef.current?.emit('selfie:show_results', { code: gameInfo.code })} />;
      case 'caption':
        return <CaptionHostPanel captionData={captionData} players={players} />;
      case 'photovote':
        return <PhotoVoteHostPanel photoVoteData={photoVoteData} players={players} />
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
          <div className="bg-white p-1 rounded">
            <QRCodeSVG value={joinUrl} size={36} />
          </div>
          {headerRoomCode && (
            <button
              onClick={() => {
                const hostUrl = window.location.origin + '/host?room=' + headerRoomCode;
                navigator.clipboard.writeText(hostUrl).catch(() => {});
              }}
              title="Copy host URL"
              className="px-3 py-1 rounded-lg text-xs font-['Nunito'] border border-[#2D2D44] text-gray-400 hover:border-[#FFE66D] hover:text-[#FFE66D] active:scale-95 transition"
            >
              📋 Host URL
            </button>
          )}
          {isRoomCreator && status !== 'setup' && status !== 'creating' && status !== 'connecting' && status !== 'error' && (
            <button
              onClick={() => setShowGamePicker(true)}
              className="px-3 py-1 rounded-lg text-xs font-['Fredoka_One'] border border-[#2D2D44] text-gray-400 hover:border-[#4ECDC4] hover:text-[#4ECDC4] active:scale-95 transition"
            >
              🎮 Change Game
            </button>
          )}
          {isRoomCreator && status !== 'setup' && status !== 'creating' && status !== 'connecting' && status !== 'error' && (
            <button
              onClick={() => setShowMainMenu(true)}
              className="px-3 py-1 rounded-lg text-xs font-['Fredoka_One'] border border-[#2D2D44] text-gray-400 hover:border-[#FF6B6B] hover:text-[#FF6B6B] active:scale-95 transition"
            >
              🏠 Main Menu
            </button>
          )}
        </div>
      </div>

      {['game-end', 'mlt-end', 'tot-end', 'draw-end', 'fitb-end', 'selfie-results'].includes(status) && (
        <Confetti width={window.innerWidth} height={window.innerHeight} recycle={false} numberOfPieces={400} />
      )}

      {/* Main Menu overlay */}
      {showMainMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowMainMenu(false)}>
          <div
            className="relative bg-[#1A1A2E] border border-[#2D2D44] rounded-3xl p-6 w-full max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-['Fredoka_One'] text-[#F7F7F7]">🏠 Main Menu</h2>
              <button onClick={() => setShowMainMenu(false)} className="text-gray-500 hover:text-white text-2xl leading-none transition">✕</button>
            </div>

            {/* Points toggle */}
            <div className="flex gap-2 mb-5">
              <button
                onClick={() => setMainMenuKeepPoints(true)}
                className={`flex-1 py-2 rounded-xl font-['Fredoka_One'] text-sm transition active:scale-95 ${mainMenuKeepPoints ? 'bg-[#4ECDC4] text-black' : 'bg-[#2D2D44] text-gray-400 hover:text-white'}`}
              >
                🏆 Keep Points
              </button>
              <button
                onClick={() => setMainMenuKeepPoints(false)}
                className={`flex-1 py-2 rounded-xl font-['Fredoka_One'] text-sm transition active:scale-95 ${!mainMenuKeepPoints ? 'bg-[#FF6B6B] text-white' : 'bg-[#2D2D44] text-gray-400 hover:text-white'}`}
              >
                🔄 Start Fresh
              </button>
            </div>

            <p className="text-xs font-['Nunito'] text-gray-500 mb-4 text-center">Choose the next mini game — same room &amp; players</p>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'most-likely-to',    label: '👑 Most Likely To',      accent: '#4ECDC4' },
                { id: 'who-said-that',     label: '🤔 Who Said That?',      accent: '#FFE66D' },
                { id: 'situational',       label: '💭 Situational',         accent: '#6C5CE7' },
                { id: 'this-or-that',      label: '🆚 This or That',        accent: '#A29BFE' },
                { id: 'drawing',           label: '🎨 Pictionary Battle',   accent: '#C39BD3' },
                { id: 'fill-in-the-blank', label: '✏️ Fill in the Blank',  accent: '#55EFC4' },
                { id: 'draw-telephone',    label: '📞 Drawing in Chain',   accent: '#FF6B6B' },
                { id: 'selfie-roast',      label: '📸 Draw on Friends',     accent: '#FD79A8' },
                { id: 'caption',           label: '💬 Selfie Captions',     accent: '#FD79A8' },
                { id: 'pmatch',            label: '🎭 Selfie Challenge',    accent: '#FDCB6E' },
                { id: 'photoassoc',        label: '🎯 Prompt Match',        accent: '#A29BFE' },
                { id: 'mixed',             label: '🎲 Mixed Pack',          accent: '#FDCB6E', colSpan: true },
              ].map(g => (
                <button
                  key={g.id}
                  onClick={() => {
                    const sock = socketRef.current;
                    const code = gameInfo.code;
                    if (!sock || !code) return;
                    if (!mainMenuKeepPoints) sock.emit('reset_global_scores', { code });
                    sock.emit('change_game', { code, newGameType: g.id });
                    setCreatorSettings(prev => ({ ...prev, gameType: g.id }));
                    setGameQueue([]);
                    setQueueIndex(0);
                    setShowMainMenu(false);
                  }}
                  className={`py-3 px-4 rounded-2xl font-['Fredoka_One'] text-sm text-black active:scale-95 hover:opacity-90 transition text-left${g.colSpan ? ' col-span-2 text-center' : ''}`}
                  style={{ backgroundColor: g.accent }}
                >
                  {g.label}
                  {g.id === gameInfo.gameType && <span className="ml-1 text-xs opacity-60">(current)</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Change Game picker overlay */}
      {showGamePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowGamePicker(false)}>
          <div
            className="relative bg-[#1A1A2E] border border-[#2D2D44] rounded-3xl p-6 w-full max-w-lg mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl font-['Fredoka_One'] text-[#F7F7F7]">🎮 Change Game</h2>
              <button onClick={() => setShowGamePicker(false)} className="text-gray-500 hover:text-white text-2xl leading-none transition">✕</button>
            </div>
            <p className="text-sm font-['Nunito'] text-gray-400 mb-4 text-center">Same room &amp; players — new game starts immediately</p>
            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">
              {[
                { id: 'most-likely-to',    label: '👑 Most Likely To',      accent: '#4ECDC4' },
                { id: 'who-said-that',     label: '🤔 Who Said That?',      accent: '#FFE66D' },
                { id: 'situational',       label: '💭 Situational',         accent: '#6C5CE7' },
                { id: 'this-or-that',      label: '🆚 This or That',        accent: '#A29BFE' },
                { id: 'drawing',           label: '🎨 Pictionary Battle',   accent: '#C39BD3' },
                { id: 'fill-in-the-blank', label: '✏️ Fill in the Blank',  accent: '#55EFC4' },
                { id: 'draw-telephone',    label: '📞 Drawing in Chain',   accent: '#FF6B6B' },
                { id: 'selfie-roast',      label: '📸 Draw on Friends',     accent: '#FD79A8' },
                { id: 'caption',           label: '💬 Selfie Captions',     accent: '#FD79A8' },
                { id: 'pmatch',            label: '🎭 Selfie Challenge',    accent: '#FDCB6E' },
                { id: 'photoassoc',        label: '🎯 Prompt Match',        accent: '#A29BFE' },
                { id: 'mixed',             label: '🎲 Mixed Pack',          accent: '#FDCB6E' },
              ].map(g => (
                <button
                  key={g.id}
                  onClick={() => {
                    const code = gameInfo.code;
                    const sock = socketRef.current;
                    if (!sock || !code) return;
                    sock.emit('change_game', { code, newGameType: g.id });
                    setCreatorSettings(prev => ({ ...prev, gameType: g.id }));
                    setGameQueue([]);
                    setQueueIndex(0);
                    setShowGamePicker(false);
                  }}
                  className="py-3 px-4 rounded-2xl font-['Fredoka_One'] text-base text-black active:scale-95 hover:opacity-90 transition text-left"
                  style={{ backgroundColor: g.accent }}
                >
                  {g.label}
                  {g.id === gameInfo.gameType && <span className="ml-1 text-xs opacity-60">(current)</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
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
        fitbData={fitbData}
        onStart={handleStartGame}
        onMltPauseResume={handleMltPauseResume}
        onMltChangeQuestion={handleMltChangeQuestion}
        onMltSkip={handleMltSkip}
        onMltNext={handleMltNext}
        onNextRound={handleNextRound}
        onSkipQuestion={handleSkipQuestion}
        onSkipMiniGame={handleSkipMiniGame}
        isMixedMode={gameInfo.gameType === 'mixed'}
        onTotNext={handleTotNext}
        onSitNext={handleSitNext}
        onNextAnswer={handleNextAnswer}
        onDrawSkipToVote={() => socketRef.current?.emit('draw:skip_to_vote', { code: gameInfo.code })}
        onDrawShowResults={() => socketRef.current?.emit('draw:show_results', { code: gameInfo.code })}
        onDrawNextRound={() => socketRef.current?.emit('draw:next_round', { code: gameInfo.code })}
        onDrawNewWord={handleDrawNewWord}
        onDrawRestart={handleDrawRestart}
        onNextQueueGame={handleNextQueueGame}
        onNewGame={handleNewGame}
        onPlayAgain={handlePlayAgain}
        onNewPartyPack={handleNewPartyPack}
        gameQueue={gameQueue}
        queueIndex={queueIndex}
        onSelfieNextRound={handleSelfieNextRound}
        onSelfieSkipQuestion={handleSelfieSkipQuestion}
        onShowSelfieResults={() => socketRef.current?.emit('selfie:show_results', { code: gameInfo.code })}
        onFitbChangeQuestion={handleFitbChangeQuestion}
        onFitbSkipToVote={() => socketRef.current?.emit('fitb:skip_to_vote', { code: gameInfo.code })}
        onFitbShowResults={() => socketRef.current?.emit('fitb:show_results', { code: gameInfo.code })}
        onFitbNextRound={() => socketRef.current?.emit('fitb:next_round', { code: gameInfo.code })}
        photoVoteData={photoVoteData}
        onPhotoVoteChangeQuestion={() => socketRef.current?.emit('photovote:change_question', { code: gameInfo.code })}
        onPhotoVoteSkipToResults={() => socketRef.current?.emit('photovote:skip_to_results', { code: gameInfo.code })}
        onPhotoVoteNextRound={() => socketRef.current?.emit('photovote:next_round', { code: gameInfo.code })}
        captionData={captionData}
        onCaptionChangeQuestion={() => socketRef.current?.emit('caption:change_question', { code: gameInfo.code })}
        onCaptionSkipToVoting={() => socketRef.current?.emit('caption:skip_to_voting', { code: gameInfo.code })}
        onCaptionSkipToResults={() => socketRef.current?.emit('caption:skip_to_results', { code: gameInfo.code })}
        onCaptionNextRound={() => socketRef.current?.emit('caption:next_round', { code: gameInfo.code })}
      />
    </div>
  );
}



