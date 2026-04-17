import React, { useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';

const TimerRing = ({ secondsLeft, total = 30, paused }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, secondsLeft / total);
  const offset = circumference * (1 - progress);
  const color = paused ? '#6C5CE7' : secondsLeft <= 8 ? '#FF6B6B' : secondsLeft <= 15 ? '#FFE66D' : '#4ECDC4';

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
        {paused ? '⏸' : secondsLeft}
      </text>
    </svg>
  );
};

export default function MostLikelyToVotingPage() {
  const { state, dispatch } = useGame();
  const t = translations[state.lang].mlt;
  const { mlt, isHost, roomCode, playerId } = state;

  const [pendingVote, setPendingVote] = useState(null); // { id, name, color }

  const handleSelectPlayer = (player) => {
    if (mlt.hasVoted) return;
    setPendingVote(player);
  };

  const handleConfirmVote = () => {
    if (!pendingVote || mlt.hasVoted) return;
    socket.emit('mlt:vote', { code: roomCode, targetPlayerId: pendingVote.id });
    dispatch({ type: 'MLT_MARK_VOTED', payload: { votedPlayerId: pendingVote.id } });
    setPendingVote(null);
  };

  const handleCancelVote = () => {
    setPendingVote(null);
  };

  const handleToggleJoker = () => {
    socket.emit('mlt:toggle_joker', { code: roomCode });
  };

  const handlePauseResume = () => {
    if (mlt.paused) {
      socket.emit('mlt:resume', { code: roomCode });
    } else {
      socket.emit('mlt:pause', { code: roomCode });
    }
  };

  const handleSkip = () => {
    socket.emit('mlt:skip', { code: roomCode });
  };

  // Players list comes pre-filtered (host excluded) from server
  const votablePlayers = mlt.players;

  const gameName = mlt.gameName || state.gameName || '';

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-8">
      {/* Game name + round header */}
      {gameName ? (
        <p className="text-lg font-['Fredoka_One'] text-[#4ECDC4] mb-1">{gameName}</p>
      ) : null}
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

      {/* ── Host / TV view ── */}
      {isHost ? (
        <div className="flex flex-col items-center gap-5 w-full max-w-lg">
          <TimerRing secondsLeft={mlt.secondsLeft} paused={mlt.paused} />

          {/* Vote progress */}
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

          {/* Host controls: Pause/Resume + Skip */}
          <div className="flex gap-3 w-full">
            <button
              onClick={handlePauseResume}
              className="flex-1 py-3 rounded-2xl font-['Fredoka_One'] text-lg transition active:scale-95 border-2"
              style={mlt.paused
                ? { backgroundColor: '#6C5CE722', borderColor: '#6C5CE7', color: '#6C5CE7' }
                : { backgroundColor: '#FFE66D22', borderColor: '#FFE66D', color: '#FFE66D' }}
            >
              {mlt.paused ? t.resume : t.pause}
            </button>
            <button
              onClick={handleSkip}
              className="flex-1 py-3 rounded-2xl font-['Fredoka_One'] text-lg border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF6B6B] hover:text-[#FF6B6B] transition active:scale-95"
            >
              {t.skip} ⏭
            </button>
          </div>
          <p className="text-gray-500 text-sm font-['Nunito'] italic">{t.waitingReveal}</p>
        </div>
      ) : (
        /* ── Player phone view ── */
        <div className="w-full max-w-md">
          {!mlt.hasVoted ? (
            <>
              {/* Confirm overlay */}
              {pendingVote ? (
                <div className="flex flex-col items-center gap-4 mt-2">
                  <p className="text-gray-400 font-['Nunito'] text-sm">{t.confirmVoteLabel || 'Confirm your vote?'}</p>
                  <div className="w-full bg-[#1A1A2E] border-2 border-[#4ECDC4] rounded-2xl p-5 flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-black font-bold text-xl flex-shrink-0 border-2 border-white/20"
                      style={{ backgroundColor: pendingVote.color }}
                    >
                      {pendingVote.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-['Fredoka_One'] text-2xl text-[#4ECDC4] flex-1">{pendingVote.name}</span>
                  </div>
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={handleCancelVote}
                      className="flex-1 py-3 rounded-2xl font-['Fredoka_One'] text-lg border-2 border-[#2D2D44] text-gray-400 hover:border-[#FF6B6B] hover:text-[#FF6B6B] transition active:scale-95"
                    >
                      {t.changeVote || '← Change'}
                    </button>
                    <button
                      onClick={handleConfirmVote}
                      className="flex-1 py-3 rounded-2xl font-['Fredoka_One'] text-lg border-2 border-[#4ECDC4] text-[#4ECDC4] bg-[#4ECDC4]/10 hover:bg-[#4ECDC4]/20 transition active:scale-95"
                    >
                      {t.confirmVote || '✓ Confirm'}
                    </button>
                  </div>
                  {/* Joker button still accessible while confirming */}
                  {(mlt.jokersLeft > 0 || mlt.jokerActive) && (
                    <button
                      onClick={handleToggleJoker}
                      className="w-full py-3 rounded-2xl font-['Fredoka_One'] text-lg transition active:scale-95 border-2"
                      style={mlt.jokerActive
                        ? { backgroundColor: '#FF6B6B22', borderColor: '#FF6B6B', color: '#FF6B6B', boxShadow: '0 0 20px #FF6B6B55' }
                        : { backgroundColor: '#2D2D44', borderColor: '#6C5CE7', color: '#A29BFE' }}
                    >
                      {mlt.jokerActive ? `🔥 ${t.jokerActive}` : `🃏 ${t.useJoker} (${mlt.jokersLeft} ${t.left})`}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-center text-gray-400 font-['Nunito'] text-sm mb-4">{t.tapToVote}</p>
                  <div className="flex flex-col gap-3 mb-5">
                    {votablePlayers.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleSelectPlayer(p)}
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

                  {/* Joker button */}
                  {mlt.jokersLeft > 0 || mlt.jokerActive ? (
                    <button
                      onClick={handleToggleJoker}
                      className="w-full py-4 rounded-2xl font-['Fredoka_One'] text-xl transition active:scale-95 border-2"
                      style={mlt.jokerActive
                        ? { backgroundColor: '#FF6B6B22', borderColor: '#FF6B6B', color: '#FF6B6B', boxShadow: '0 0 20px #FF6B6B55' }
                        : { backgroundColor: '#2D2D44', borderColor: '#6C5CE7', color: '#A29BFE' }}
                    >
                      {mlt.jokerActive ? `🔥 ${t.jokerActive}` : `🃏 ${t.useJoker} (${mlt.jokersLeft} ${t.left})`}
                    </button>
                  ) : (
                    <p className="text-center text-gray-600 font-['Nunito'] text-sm">{t.noJokersLeft}</p>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 mt-4">
              <div
                className="w-full rounded-2xl p-8 text-center border-2"
                style={mlt.jokerActive
                  ? { backgroundColor: '#FF6B6B22', borderColor: '#FF6B6B' }
                  : { backgroundColor: '#1A1A2E', borderColor: '#4ECDC4' }}
              >
                <p className="text-3xl font-['Fredoka_One'] mb-2" style={{ color: mlt.jokerActive ? '#FF6B6B' : '#4ECDC4' }}>
                  {mlt.jokerActive ? `🔥 ${t.voteLocked}` : t.voteLocked}
                </p>
                {mlt.votedPlayerId && (
                  <p className="text-gray-400 font-['Nunito'] text-sm mt-1">
                    {t.youVotedFor}{' '}
                    <span className="text-white font-bold">
                      {mlt.players.find(p => p.id === mlt.votedPlayerId)?.name}
                    </span>
                  </p>
                )}
                {mlt.jokerActive && (
                  <p className="text-[#FF6B6B] font-['Nunito'] text-xs mt-2 animate-pulse">🔥 {t.jokerWillDouble}</p>
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
