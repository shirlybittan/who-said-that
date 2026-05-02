import React, { useEffect, useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

const VoteCoin = ({ coinIndex, cardIndex, isJoker = false }) => (
  <motion.div
    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold select-none flex-shrink-0"
    style={isJoker ? {
      background: 'radial-gradient(circle at 35% 35%, #e879f9, #7c3aed)',
      border: '2px solid #d946ef',
      boxShadow: '0 0 10px rgba(217,70,239,0.6)',
      color: '#fff',
    } : {
      background: 'radial-gradient(circle at 35% 35%, #fef08a, #ca8a04)',
      border: '2px solid #facc15',
      boxShadow: '0 3px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)',
      color: '#713f12',
    }}
    initial={{ y: -64, opacity: 0, scale: 0.3, rotate: -40 }}
    animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
    transition={{
      delay: 1.1 + cardIndex * 0.25 + coinIndex * 0.12,
      type: 'spring',
      stiffness: 460,
      damping: 14,
      mass: 0.6,
    }}
  >
    {isJoker ? '🃏' : '★'}
  </motion.div>
);

export default function MostLikelyToResultsPage() {
  const { state } = useGame();
  const t = translations[state.lang].mlt;
  const { mlt, isHost, roomCode } = state;
  const sounds = useSounds();

  const [phase, setPhase] = useState(0); // 0=hidden, 1=bars grow, 2=winner highlight

  useEffect(() => {
    const t1 = setTimeout(() => { setPhase(1); sounds.roundEnd(); }, 500);
    const t2 = setTimeout(() => setPhase(2), 950);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNextRound = () => {
    sounds.click();
    socket.emit('mlt:next_round', { code: roomCode });
  };

  const isLastRound = mlt.round >= mlt.totalRounds;
  const maxCount = mlt.results[0]?.count || 1;
  const majorityIds = mlt.majorityPlayerIds || [];

  return (
    <motion.div className="flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-32" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
      {/* Round header */}
      <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest mb-3">
        {t.round} {mlt.round} {t.of} {mlt.totalRounds}
      </p>

      {/* Prompt recap */}
      <div className="w-full max-w-lg bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5 mb-6 text-center">
        <p className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest mb-1">{t.promptLabel}</p>
        <h2 className="text-xl font-['Fredoka_One'] text-[#FFE66D]">{mlt.prompt}</h2>
      </div>

      {/* Results */}
      <div className="w-full max-w-lg space-y-4 mb-6">
        {mlt.results.map((player, idx) => {
          const isMajority = majorityIds.includes(player.playerId);
          const usedJoker = (mlt.jokersUsed || []).includes(player.playerId);
          const barWidth = maxCount > 0 ? `${(player.count / maxCount) * 100}%` : '0%';

          return (
            <motion.div
              key={player.playerId}
              className="rounded-2xl p-4 border-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{
                opacity: phase >= 2 && majorityIds.length > 0 && !isMajority ? 0.62 : 1,
                y: 0,
                scale: phase >= 2 && isMajority ? 1.02 : 1,
              }}
              transition={{
                opacity: { duration: 0.35, delay: 0.1 + idx * 0.12 },
                y: { duration: 0.35, delay: 0.1 + idx * 0.12 },
                scale: { type: 'spring', stiffness: 200, damping: 16, delay: phase >= 2 ? 0.05 : 0 },
              }}
              style={isMajority
                ? { borderColor: '#FFE66D', backgroundColor: '#1A1A2E', boxShadow: phase >= 2 ? '0 0 28px rgba(255,230,109,0.4)' : '0 0 20px rgba(255,230,109,0.25)' }
                : { borderColor: '#2D2D44', backgroundColor: '#1A1A2E' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  {isMajority && <span className="text-lg">👑</span>}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-black font-bold flex-shrink-0 border-2 border-white/20"
                    style={{ backgroundColor: player.color }}
                  >
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className={`font-['Fredoka_One'] text-lg ${isMajority ? 'text-[#FFE66D]' : 'text-white'}`}>
                    {player.name}
                  </span>
                  {usedJoker && <span className="text-sm">🔥</span>}
                </div>
                <div className="text-right">
                  <span className={`font-['Fredoka_One'] text-2xl ${isMajority ? 'text-[#FFE66D]' : 'text-white'}`}>
                    {player.count}
                  </span>
                  <span className="text-gray-400 text-sm ml-1 font-['Nunito']">
                    {player.count === 1 ? t.vote : t.votes}
                  </span>
                  {player.pct > 0 && (
                    <span className="text-gray-500 text-xs ml-2 font-['Nunito']">({player.pct}%)</span>
                  )}
                </div>
              </div>

              {/* Vote coins */}
              {player.count > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2 mt-1">
                  {Array.from({ length: Math.min(player.count, 12) }).map((_, j) => (
                    <VoteCoin key={j} coinIndex={j} cardIndex={idx} isJoker={j === 0 && usedJoker} />
                  ))}
                  {player.count > 12 && (
                    <span className="text-xs text-gray-500 font-['Nunito'] self-center">+{player.count - 12}</span>
                  )}
                </div>
              )}

              {/* Vote bar */}
              <div className="w-full bg-[#2D2D44] rounded-full h-3 overflow-hidden">
                <motion.div
                  className="h-3 rounded-full"
                  style={{ backgroundColor: isMajority ? '#FFE66D' : '#4ECDC4' }}
                  initial={{ width: '0%' }}
                  animate={{ width: phase >= 1 ? barWidth : '0%' }}
                  transition={{ duration: 0.55, delay: 0.08 + idx * 0.15, ease: [0.2, 0.8, 0.2, 1] }}
                />
              </div>
            </motion.div>
          );
        })}

        {majorityIds.length === 0 && mlt.results.length > 0 && (
          <p className="text-center text-gray-500 italic font-['Nunito']">{t.noVotesCast}</p>
        )}
      </div>

      {/* Points key */}
      {majorityIds.length > 0 && (
        <div className="w-full max-w-lg bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-4 mb-6 text-sm font-['Nunito'] text-gray-400 space-y-1">
          <p>✅ {t.correctVoteGetsPoint}</p>
          {(mlt.jokersUsed || []).length > 0 && <p>🔥 {t.jokerDoubled}</p>}
        </div>
      )}

      {/* Scores dashboard */}
      {mlt.scorePlayers && mlt.scorePlayers.length > 0 && (
        <div className="w-full max-w-lg bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-4 mb-6">
          <p className="text-xs font-['Nunito'] uppercase tracking-widest text-gray-500 mb-3 text-center">
            {t.scoreboardTitle || 'Scores so far'}
          </p>
          {(() => {
            const prevScores = mlt.prevScores || {};
            const sorted = [...mlt.scorePlayers].sort((a, b) => (mlt.scores[b.id] || 0) - (mlt.scores[a.id] || 0));
            const prevSorted = [...mlt.scorePlayers].sort((a, b) => (prevScores[b.id] || 0) - (prevScores[a.id] || 0));
            const prevRankMap = {};
            prevSorted.forEach((p, i) => { prevRankMap[p.id] = i; });
            const topScore = Math.max(...sorted.map(p => mlt.scores[p.id] || 0));
            return (
              <motion.div
                className="space-y-2"
                initial="hidden"
                animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 1.3 } } }}
              >
                {sorted.map((p, i) => {
                  const pts = mlt.scores[p.id] || 0;
                  const barW = topScore > 0 ? `${(pts / topScore) * 100}%` : '0%';
                  const isTop = pts === topScore && topScore > 0;
                  const prevRank = prevRankMap[p.id] ?? i;
                  const delta = prevRank - i; // positive = moved up
                  const rankSign = delta > 0 ? { label: '▲', color: '#4ECDC4' }
                                 : delta < 0 ? { label: '▼', color: '#FF6B6B' }
                                 : { label: '●', color: '#6C6C8A' };
                  return (
                    <motion.div
                      key={p.id}
                      className="flex items-center gap-3"
                      variants={{ hidden: { opacity: 0, x: -14 }, show: { opacity: 1, x: 0, transition: { duration: 0.28 } } }}
                    >
                      <span className="text-gray-500 text-sm font-['Nunito'] w-4 text-right">{i + 1}</span>
                      <span className="text-xs w-3" style={{ color: rankSign.color }}>{rankSign.label}</span>
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-black font-bold text-xs flex-shrink-0"
                        style={{ backgroundColor: p.color }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className={`font-['Nunito'] text-sm flex-1 truncate ${isTop ? 'text-[#FFE66D]' : 'text-white'}`}>
                        {p.name}
                      </span>
                      <div className="flex items-center gap-2 w-28">
                        <div className="flex-1 bg-[#2D2D44] rounded-full h-2 overflow-hidden">
                          <motion.div
                            className="h-2 rounded-full"
                            style={{ backgroundColor: isTop ? '#FFE66D' : '#4ECDC4' }}
                            initial={{ width: '0%' }}
                            animate={{ width: phase >= 1 ? barW : '0%' }}
                            transition={{ duration: 0.6, delay: 1.4 + i * 0.08, ease: 'easeOut' }}
                          />
                        </div>
                        <span className={`font-['Fredoka_One'] text-base w-6 text-right ${isTop ? 'text-[#FFE66D]' : 'text-white'}`}>
                          {pts}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            );
          })()}
        </div>
      )}

      {/* Host controls */}
      {isHost && (
        <div className="fixed bottom-0 w-full bg-[#1A1A2E] p-4 border-t-2 border-[#FFE66D] flex justify-center shadow-xl z-50">
          <button
            onClick={handleNextRound}
            className="w-full max-w-sm bg-[#FFE66D] hover:bg-[#ffdd33] text-black font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] uppercase tracking-wide shadow-lg"
          >
            {isLastRound ? t.seeScores : t.nextRound}
          </button>
        </div>
      )}

      {!isHost && (
        <p className="text-gray-500 text-sm font-['Nunito'] italic animate-pulse mt-4">
          {t.waitingHost}
        </p>
      )}
    </motion.div>
  );
}
