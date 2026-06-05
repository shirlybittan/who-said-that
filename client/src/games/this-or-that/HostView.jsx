import React from 'react';
import HostGameLayout from '../../game-core/layouts/HostGameLayout';
import { useHostGameFrame } from '../../game-core/hooks/useHostGameFrame';

// ─── Center content: voting view ─────────────────────────────────────────────

function TotVotingCenter({ prompt, roundLabel, a, b }) {
  return (
    <div className="w-full flex flex-col items-center gap-6">
      <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest">
        ⚡ This or That · {roundLabel}
      </p>
      <div
        className="w-full bg-[#1A1A2E] border-2 border-[#6C5CE7] rounded-3xl p-8 text-center"
        style={{ boxShadow: '0 0 40px #6C5CE720' }}
      >
        <h1 className="text-3xl md:text-4xl font-['Fredoka_One'] text-[#FFE66D] leading-snug">{prompt}</h1>
      </div>
      <div className="flex gap-6 w-full">
        {[{ key: 'a', label: a, color: '#FF6B6B' }, { key: 'b', label: b, color: '#4ECDC4' }].map(({ key, label, color }) => (
          <div
            key={key}
            className="flex-1 bg-[#1A1A2E] border-2 rounded-3xl p-8 text-center"
            style={{ borderColor: color, boxShadow: `0 0 20px ${color}20` }}
          >
            <p className="text-5xl font-['Fredoka_One'] mb-2" style={{ color }}>{key.toUpperCase()}</p>
            <p className="font-['Fredoka_One'] text-xl text-white">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Center content: results view ────────────────────────────────────────────

function TotResultsCenter({ prompt, roundLabel, a, b, pctA, pctB, countA, countB, majorityChoice }) {
  return (
    <div className="w-full flex flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-sm font-['Nunito'] text-gray-400 uppercase tracking-widest mb-2">
          Results · {roundLabel}
        </p>
        <h2 className="text-2xl font-['Fredoka_One'] text-[#FFE66D]">{prompt}</h2>
      </div>
      <div className="flex gap-6 w-full">
        {[
          { key: 'a', label: a, pct: pctA, count: countA, isMajority: majorityChoice === 'a' },
          { key: 'b', label: b, pct: pctB, count: countB, isMajority: majorityChoice === 'b' },
        ].map(({ key, label, pct, count, isMajority }) => (
          <div
            key={key}
            className="flex-1 flex flex-col items-center gap-3 rounded-3xl p-6"
            style={
              isMajority
                ? { background: '#6C5CE720', border: '2px solid #6C5CE7', boxShadow: '0 0 30px #6C5CE730' }
                : { background: '#1A1A2E', border: '1px solid #2D2D44' }
            }
          >
            <p className="font-['Fredoka_One'] text-xl text-white text-center">{label}</p>
            <p className="text-5xl font-['Fredoka_One'] text-[#FFE66D]">{pct}%</p>
            <p className="text-sm font-['Nunito'] text-gray-400">
              {count} vote{count !== 1 ? 's' : ''}
            </p>
            <div className="w-full bg-[#2D2D44] rounded-full h-3">
              <div
                className="h-3 rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: isMajority ? '#6C5CE7' : '#4ECDC4' }}
              />
            </div>
            {isMajority && <p className="text-[#6C5CE7] font-['Fredoka_One'] text-sm">✓ Majority</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main host view ───────────────────────────────────────────────────────────

export default function ThisOrThatHostView({ state, socket, onOpenGamePicker, onOpenMainMenu, onSkipMiniGame }) {
  const { frame, actions } = useHostGameFrame({ gameKey: 'this-or-that', state, socket });

  const handleCopyHostUrl = () => {
    if (!frame.roomCode) return;
    const hostUrl = `${window.location.origin}/host?room=${frame.roomCode}`;
    navigator.clipboard.writeText(hostUrl).catch(() => {});
  };

  const handlePauseToggle = () => {
    actions.togglePauseResume(frame.paused);
  };

  const centerContent = frame.resultsVisible ? (
    <TotResultsCenter
      prompt={frame.prompt}
      roundLabel={frame.roundLabel}
      a={frame.a}
      b={frame.b}
      pctA={frame.pctA}
      pctB={frame.pctB}
      countA={frame.countA}
      countB={frame.countB}
      majorityChoice={frame.majorityChoice}
    />
  ) : (
    <TotVotingCenter
      prompt={frame.prompt}
      roundLabel={frame.roundLabel}
      a={frame.a}
      b={frame.b}
    />
  );

  return (
    <HostGameLayout
      frame={frame}
      onPauseToggle={handlePauseToggle}
      onChangeQuestion={actions.changeQuestion}
      onSkipMiniGame={onSkipMiniGame || actions.skipMiniGame}
      onOpenGamePicker={onOpenGamePicker}
      onOpenMainMenu={onOpenMainMenu}
      onCopyHostUrl={handleCopyHostUrl}
      centerContent={centerContent}
    />
  );
}
