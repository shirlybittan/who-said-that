import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';

const TimerRing = ({ secondsLeft, total = 15 }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, secondsLeft / total);
  const offset = circumference * (1 - progress);
  const color = secondsLeft <= 5 ? '#FF6B6B' : secondsLeft <= 10 ? '#FFE66D' : '#4ECDC4';

  return (
    <svg className="w-28 h-28" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="#2D2D44" strokeWidth="8" />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
      />
      <text x="50" y="57" textAnchor="middle" fill="white" fontSize="26" fontWeight="bold" fontFamily="Nunito">
        {secondsLeft}
      </text>
    </svg>
  );
};

export default function MostLikelyToVotingPage() {
  const { state, dispatch } = useGame();
  const t = translations[state.lang].mlt;
  const { mlt, isHost, roomCode, playerId } = state;

  const handleVote = (targetId) => {
    if (mlt.hasVoted) return;
    socket.emit('mlt:vote', { code: roomCode, targetPlayerId: targetId });
    dispatch({ type: 'MLT_MARK_VOTED', payload: { votedPlayerId: targetId } });
  };

  const votablePlayers = mlt.players.filter(p =>
    mlt.allowSelfVote ? true : p.id !== playerId
  );

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-8">
      {/* Round header */}
      <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest mb-3">
        {t.round} {mlt.round} {t.of} {mlt.totalRounds}
      </p>

      {/* Prompt */}
      <div className="w-full max-w-lg bg-[#1A1A2E] border-2 border-[#4ECDC4] rounded-2xl p-6 mb-6 text-center">
        <p className="text-xs font-['Nunito'] text-[#4ECDC4] uppercase tracking-widest mb-2">{t.promptLabel}</p>
        <h1 className="text-2xl md:text-3xl font-['Fredoka_One'] text-[#FFE66D] leading-snug">
          {mlt.prompt}
        </h1>
      </div>

      {/* Host TV view */}
      {isHost ? (
        <div className="flex flex-col items-center gap-6 w-full max-w-lg">
          <TimerRing secondsLeft={mlt.secondsLeft} />
          <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-5 text-center">
            <p className="text-4xl font-['Fredoka_One'] text-white mb-1">
              {mlt.voteCount} <span className="text-gray-400 text-2xl">/ {mlt.totalVoters}</span>
            </p>
            <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-wider">{t.votesIn}</p>
            <div className="mt-3 w-full bg-[#2D2D44] rounded-full h-2">
              <div
                className="bg-[#4ECDC4] h-2 rounded-full transition-all duration-500"
                style={{ width: mlt.totalVoters > 0 ? `${(mlt.voteCount / mlt.totalVoters) * 100}%` : '0%' }}
              />
            </div>
          </div>
          <p className="text-gray-500 text-sm font-['Nunito'] italic">{t.waitingReveal}</p>
        </div>
      ) : (
        /* Player phone view */
        <div className="w-full max-w-md">
          {!mlt.hasVoted ? (
            <>
              <p className="text-center text-gray-400 font-['Nunito'] text-sm mb-4">{t.tapToVote}</p>
              <div className="flex flex-col gap-3">
                {votablePlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleVote(p.id)}
                    className="flex items-center gap-4 w-full bg-[#1A1A2E] hover:bg-[#2D2D44] border-2 border-[#2D2D44] hover:border-[#4ECDC4] rounded-2xl p-4 transition active:scale-95"
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-black font-bold text-lg flex-shrink-0 border-2 border-white/20"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-['Fredoka_One'] text-xl text-white">{p.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 mt-4">
              <div className="bg-[#1A1A2E] border-2 border-[#4ECDC4] rounded-2xl p-8 w-full text-center">
                <p className="text-3xl font-['Fredoka_One'] text-[#4ECDC4] mb-2">{t.voteLocked}</p>
                {mlt.votedPlayerId && (
                  <p className="text-gray-400 font-['Nunito'] text-sm">
                    {t.youVotedFor}{' '}
                    <span className="text-white font-bold">
                      {mlt.players.find(p => p.id === mlt.votedPlayerId)?.name}
                    </span>
                  </p>
                )}
              </div>
              <p className="text-gray-400 font-['Nunito'] text-sm animate-pulse">
                {mlt.voteCount} / {mlt.totalVoters} {t.votesIn}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
