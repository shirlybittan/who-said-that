import React, { useState, useEffect } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

export default function ThisOrThatPage() {
  const { state, dispatch } = useGame();
  const t = translations[state.lang].tot;
  const { tot, isHost, roomCode, playerId, players } = state;
  const sounds = useSounds();

  const [localChoice, setLocalChoice] = useState(null); // 'a' | 'b'

  // Reset local choice on new question
  useEffect(() => {
    setLocalChoice(null);
    sounds.reveal();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tot.question]);

  const handleVote = (choice) => {
    if (tot.hasVoted || tot.resultsVisible) return;
    sounds.vote();
    setLocalChoice(choice);
    socket.emit('tot:vote', { code: roomCode, choice });
    dispatch({ type: 'TOT_MARK_VOTED', payload: { choice } });
  };

  const handleNextRound = () => {
    socket.emit('tot:next_round', { code: roomCode });
  };

  const handleSkip = () => {
    socket.emit('tot:skip', { code: roomCode });
  };

  const isLastRound = tot.round >= tot.totalRounds;

  // Helper: get who voted for which option
  const aVoters = (tot.voteDetails || []).filter(v => v.choice === 'a');
  const bVoters = (tot.voteDetails || []).filter(v => v.choice === 'b');

  const myPlayerObj = players.find(p => p.id === playerId);

  return (
    <motion.div className="flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-32" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
      {/* Round header */}
      <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest mb-1">
        {t.round} {tot.round} {t.of} {tot.totalRounds}
      </p>

      {/* Mode badge */}
      <div className="mb-4">
        <span className="text-xs px-3 py-1 rounded-full font-['Nunito'] font-bold uppercase tracking-wider bg-[#6C5CE7]/20 text-[#6C5CE7] border border-[#6C5CE7]/40">
          ⚡ This or That
        </span>
      </div>

      {/* Question */}
      <div className="w-full max-w-lg bg-[#1A1A2E] border-2 border-[#6C5CE7] rounded-2xl p-6 mb-6 text-center">
        <h1 className="text-2xl md:text-3xl font-['Fredoka_One'] text-[#FFE66D] leading-snug">
          {tot.question}
        </h1>
      </div>

      {/* A/B Choices */}
      {!tot.resultsVisible ? (
        <div className="w-full max-w-lg flex flex-col gap-4 mb-6">
          {state.isPlaying ? (<>
          {/* Choice A */}
          <button
            onClick={() => handleVote('a')}
            disabled={tot.hasVoted}
            className={`w-full rounded-2xl p-5 text-xl font-['Fredoka_One'] transition-all border-2 active:scale-95
              ${localChoice === 'a'
                ? 'bg-[#FF6B6B] border-[#FF6B6B] text-white scale-[1.02] shadow-[0_0_20px_rgba(255,107,107,0.4)]'
                : tot.hasVoted
                  ? 'bg-[#1A1A2E] border-[#2D2D44] text-gray-500 cursor-not-allowed'
                  : 'bg-[#1A1A2E] border-[#FF6B6B]/60 text-white hover:border-[#FF6B6B] hover:bg-[#FF6B6B]/10'
              }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-['Nunito'] text-gray-400 bg-[#2D2D44] px-2 py-0.5 rounded-full">A</span>
              <span className="flex-1 text-center">{tot.a}</span>
            </div>
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="h-px bg-[#2D2D44] flex-1" />
            <span className="mx-4 text-gray-500 font-['Fredoka_One'] text-lg">{t.or}</span>
            <div className="h-px bg-[#2D2D44] flex-1" />
          </div>

          {/* Choice B */}
          <button
            onClick={() => handleVote('b')}
            disabled={tot.hasVoted}
            className={`w-full rounded-2xl p-5 text-xl font-['Fredoka_One'] transition-all border-2 active:scale-95
              ${localChoice === 'b'
                ? 'bg-[#4ECDC4] border-[#4ECDC4] text-black scale-[1.02] shadow-[0_0_20px_rgba(78,205,196,0.4)]'
                : tot.hasVoted
                  ? 'bg-[#1A1A2E] border-[#2D2D44] text-gray-500 cursor-not-allowed'
                  : 'bg-[#1A1A2E] border-[#4ECDC4]/60 text-white hover:border-[#4ECDC4] hover:bg-[#4ECDC4]/10'
              }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-['Nunito'] text-gray-400 bg-[#2D2D44] px-2 py-0.5 rounded-full">B</span>
              <span className="flex-1 text-center">{tot.b}</span>
            </div>
          </button>

          {tot.hasVoted && (
            <div className="text-center mt-2">
              <p className="text-[#FFE66D] font-['Fredoka_One'] text-lg">{t.voteLocked}</p>
              <p className="text-gray-400 font-['Nunito'] text-sm mt-1">
                {tot.voteCount} / {tot.totalVoters} {t.votesIn}
              </p>
            </div>
          )}

          {!tot.hasVoted && (
            <p className="text-center text-gray-500 font-['Nunito'] text-sm mt-2 animate-pulse">
              {t.waitingReveal.replace('waiting', 'Pick one!')}
            </p>
          )}
          </>) : (
            // Cast-screen spectator: show vote progress only
            <div className="w-full bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-8 text-center">
              <p className="text-4xl font-['Fredoka_One'] text-[#FFE66D]">
                {tot.voteCount} <span className="text-gray-400 text-2xl">/ {tot.totalVoters}</span>
              </p>
              <p className="text-sm font-['Nunito'] text-gray-400 mt-2 uppercase tracking-wider">{t.votesIn}</p>
              <div className="mt-4 w-full bg-[#2D2D44] rounded-full h-2">
                <div className="bg-[#4ECDC4] h-2 rounded-full transition-all duration-500"
                  style={{ width: tot.totalVoters > 0 ? `${(tot.voteCount / tot.totalVoters) * 100}%` : '0%' }} />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Results view ── */
        <div className="w-full max-w-lg space-y-4 mb-6">
          {/* Split header */}
          <div className="text-center mb-4">
            <p className="font-['Fredoka_One'] text-2xl text-white">
              {tot.majorityChoice === null ? t.tied : t.majority}
            </p>
            {t.score && (
              <p className="text-gray-400 font-['Nunito'] text-sm mt-1">{t.score}</p>
            )}
          </div>

          {/* Bar A */}
          <ResultBar
            label="A"
            choice={tot.a}
            count={tot.countA}
            pct={tot.pctA}
            isMajority={tot.majorityChoice === 'a'}
            myChoice={tot.myChoice}
            choiceKey="a"
            voters={aVoters}
            colorClass="bg-[#FF6B6B]"
            borderClass="border-[#FF6B6B]"
          />

          {/* Bar B */}
          <ResultBar
            label="B"
            choice={tot.b}
            count={tot.countB}
            pct={tot.pctB}
            isMajority={tot.majorityChoice === 'b'}
            myChoice={tot.myChoice}
            choiceKey="b"
            voters={bVoters}
            colorClass="bg-[#4ECDC4]"
            borderClass="border-[#4ECDC4]"
          />

          {/* Scores */}
          {Object.keys(tot.scores).length > 0 && (
            <ScoreBoard scores={tot.scores} prevScores={tot.prevScores} players={tot.scorePlayers} t={t} />
          )}
        </div>
      )}

      {/* Host controls */}
      {isHost && (
        <div className="fixed bottom-0 w-full bg-[#1A1A2E] p-4 border-t-2 border-[#6C5CE7] flex flex-col items-center shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-50 gap-3">
          {tot.resultsVisible ? (
            <button
              onClick={handleNextRound}
              className="w-full max-w-sm bg-[#6C5CE7] hover:bg-[#5a4fd4] text-white font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] shadow-lg uppercase"
            >
              {isLastRound ? t.seeScores : t.nextRound}
            </button>
          ) : (
            <>
              <p className="text-gray-400 font-['Nunito'] text-sm">
                {tot.voteCount} / {tot.totalVoters} {t.votesIn}
              </p>
              <button
                onClick={handleSkip}
                className="text-gray-500 hover:text-white font-['Nunito'] text-sm underline transition"
              >
                {t.skip}
              </button>
            </>
          )}
        </div>
      )}

      {!isHost && (
        <div className="fixed bottom-0 w-full bg-[#1A1A2E] p-4 border-t border-[#2D2D44] flex flex-col items-center z-50">
          <p className="text-[#6C5CE7] font-['Fredoka_One'] text-lg animate-pulse">{t.waitingHost}</p>
        </div>
      )}
    </motion.div>
  );
}

function ResultBar({ label, choice, count, pct, isMajority, myChoice, choiceKey, voters, colorClass, borderClass }) {
  const [animWidth, setAnimWidth] = useState('0%');

  useEffect(() => {
    const id = setTimeout(() => setAnimWidth(`${pct}%`), 100);
    return () => clearTimeout(id);
  }, [pct]);

  const isMyChoice = myChoice === choiceKey;

  return (
    <div
      className={`rounded-2xl p-4 border-2 transition-all ${isMajority ? `${borderClass} shadow-lg` : 'border-[#2D2D44]'} bg-[#1A1A2E]`}
      style={isMajority ? { boxShadow: `0 0 20px color-mix(in srgb, ${choiceKey === 'a' ? '#FF6B6B' : '#4ECDC4'} 30%, transparent)` } : {}}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {isMajority && <span className="text-lg">👑</span>}
          {isMyChoice && <span className="text-lg">✋</span>}
          <span className="text-sm font-['Nunito'] text-gray-400 bg-[#2D2D44] px-2 py-0.5 rounded-full">{label}</span>
          <span className={`font-['Fredoka_One'] text-lg ${isMajority ? 'text-white' : 'text-gray-300'}`}>{choice}</span>
        </div>
        <div className="text-right">
          <span className={`font-['Fredoka_One'] text-2xl ${isMajority ? 'text-white' : 'text-gray-400'}`}>{count}</span>
          <span className="text-gray-500 text-xs ml-2 font-['Nunito']">({pct}%)</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-[#2D2D44] rounded-full h-3 overflow-hidden mb-3">
        <div
          className={`h-3 rounded-full transition-all duration-700 ease-out ${colorClass}`}
          style={{ width: animWidth }}
        />
      </div>

      {/* Voter avatars */}
      {voters.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {voters.map(v => (
            <div
              key={v.playerId}
              className="flex items-center gap-1 bg-black/30 rounded-full px-2 py-1 text-xs font-['Nunito']"
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-black font-bold text-xs border border-white/20"
                style={{ backgroundColor: v.color }}
              >
                {v.name?.charAt(0).toUpperCase()}
              </div>
              <span className="text-gray-300">{v.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreBoard({ scores, prevScores, players, t }) {
  const sorted = [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  const topScore = Math.max(1, ...sorted.map(p => scores[p.id] || 0));

  return (
    <div className="w-full max-w-lg bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-4 mt-2">
      <p className="text-xs font-['Nunito'] uppercase tracking-widest text-gray-500 mb-3 text-center">
        {t.scoreboardTitle}
      </p>
      <div className="space-y-2">
        {sorted.map((p, i) => {
          const score = scores[p.id] || 0;
          const prev = prevScores[p.id] || 0;
          const delta = score - prev;
          const barPct = topScore > 0 ? (score / topScore) * 100 : 0;
          return (
            <div key={p.id} className="flex items-center gap-3">
              <span className="text-gray-500 text-xs w-4 font-['Nunito']">{i + 1}</span>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-black font-bold text-xs border border-white/20" style={{ backgroundColor: p.color }}>
                {p.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-0.5">
                  <span className="font-['Nunito'] text-white">{p.name}</span>
                  <span className="font-['Fredoka_One'] text-white">
                    {score} {t.pts}
                    {delta > 0 && <span className="text-green-400 text-xs ml-1">+{delta}</span>}
                  </span>
                </div>
                <div className="w-full bg-[#2D2D44] rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full bg-[#6C5CE7] transition-all duration-700" style={{ width: `${barPct}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
