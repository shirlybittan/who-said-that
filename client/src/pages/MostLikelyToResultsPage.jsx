import React, { useEffect, useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import { motion } from 'framer-motion';

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
      delay: 0.4 + cardIndex * 0.25 + coinIndex * 0.12,
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

  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleNextRound = () => {
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
      <motion.div
        className="w-full max-w-lg space-y-4 mb-6"
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } } }}
      >
        {mlt.results.map((player, idx) => {
          const isMajority = majorityIds.includes(player.playerId);
          const usedJoker = (mlt.jokersUsed || []).includes(player.playerId);
          const barWidth = revealed && maxCount > 0 ? `${(player.count / maxCount) * 100}%` : '0%';

          return (
            <motion.div
              key={player.playerId}
              className="rounded-2xl p-4 border-2"
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}
              style={isMajority
                ? { borderColor: '#FFE66D', backgroundColor: '#1A1A2E', boxShadow: '0 0 20px rgba(255,230,109,0.25)' }
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
                <div
                  className="h-3 rounded-full transition-all duration-700 ease-out"
                  style={{ width: barWidth, backgroundColor: isMajority ? '#FFE66D' : '#4ECDC4' }}
                />
              </div>
            </motion.div>
          );
        })}

        {majorityIds.length === 0 && mlt.results.length > 0 && (
          <p className="text-center text-gray-500 italic font-['Nunito']">{t.noVotesCast}</p>
        )}
      </motion.div>

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
              <div className="space-y-2">
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
                    <div key={p.id} className="flex items-center gap-3">
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
                          <div
                            className="h-2 rounded-full transition-all duration-700"
                            style={{ width: barW, backgroundColor: isTop ? '#FFE66D' : '#4ECDC4' }}
                          />
                        </div>
                        <span className={`font-['Fredoka_One'] text-base w-6 text-right ${isTop ? 'text-[#FFE66D]' : 'text-white'}`}>
                          {pts}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
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
