import React from 'react';
import { useGame } from '../../store/gameStore.jsx';
import { socket } from '../../socket';
import { useSounds } from '../../hooks/useSounds';
import PlayerGameLayout from '../../game-core/layouts/PlayerGameLayout';
import { usePlayerGameFrame } from '../../game-core/hooks/usePlayerGameFrame';
import { useVoteConfirmation } from '../../game-core/hooks/useVoteConfirmation';
import ConfirmVoteCard from '../../game-core/player/ConfirmVoteCard';

// ─── A/B choice buttons ──────────────────────────────────────────────────────

function TotChoiceButtons({ choices, onSelect, hasVoted }) {
  const [a, b] = choices;
  return (
    <div className="w-full flex flex-col gap-4">
      {choices.map((choice, i) => (
        <React.Fragment key={choice.id}>
          <button
            onClick={() => onSelect(choice)}
            disabled={hasVoted}
            className={`w-full rounded-2xl p-5 text-xl font-['Fredoka_One'] transition-colors border-2 active:scale-95
              ${hasVoted
                ? 'bg-[#1A1A2E] border-[#2D2D44] text-gray-500 cursor-not-allowed'
                : i === 0
                  ? 'bg-[#1A1A2E] border-[#FF6B6B]/60 text-white hover:border-[#FF6B6B] hover:bg-[#FF6B6B]/10'
                  : 'bg-[#1A1A2E] border-[#4ECDC4]/60 text-white hover:border-[#4ECDC4] hover:bg-[#4ECDC4]/10'
              }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-['Nunito'] text-gray-400 bg-[#2D2D44] px-2 py-0.5 rounded-full">
                {choice.badge}
              </span>
              <span className="flex-1 text-center">{choice.label}</span>
            </div>
          </button>
          {i === 0 && (
            <div className="relative flex items-center justify-center">
              <div className="h-px bg-[#2D2D44] flex-1" />
              <span className="mx-4 text-gray-500 font-['Fredoka_One'] text-lg">or</span>
              <div className="h-px bg-[#2D2D44] flex-1" />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Locked card ─────────────────────────────────────────────────────────────

function LockedTotCard({ choice, voteCount, totalVoters }) {
  if (!choice) return null;
  const accentColor = choice.id === 'a' ? '#FF6B6B' : '#4ECDC4';
  return (
    <div className="w-full flex flex-col items-center gap-3 mt-2">
      <div
        className="w-full bg-[#1A1A2E] rounded-2xl border-2 p-5 text-center"
        style={{ borderColor: accentColor }}
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <span
            className="w-10 h-10 rounded-full flex items-center justify-center font-['Fredoka_One'] text-lg text-white"
            style={{ backgroundColor: accentColor }}
          >
            {choice.badge}
          </span>
          <span className="font-['Fredoka_One'] text-2xl" style={{ color: accentColor }}>
            {choice.label}
          </span>
        </div>
        <p className="text-[#4ECDC4] font-['Fredoka_One'] text-base">Vote locked in! 🔒</p>
        <p className="text-gray-400 font-['Nunito'] text-sm mt-1">
          {voteCount}/{totalVoters} votes in
        </p>
      </div>
    </div>
  );
}

// ─── Main player view ─────────────────────────────────────────────────────────

export default function ThisOrThatPlayerView() {
  const { state, dispatch } = useGame();
  const sounds = useSounds();

  const { frame, actions } = usePlayerGameFrame({
    gameKey: 'this-or-that',
    state,
    socket,
    dispatch,
    context: { sounds },
  });

  const vote = useVoteConfirmation({
    onConfirmSubmit: actions.submitChoice,
    resetKey: `${state.tot.round}-${state.tot.question}`,
  });

  const selectionUI = frame.hasSubmitted ? (
    <LockedTotCard
      choice={frame.submittedChoice}
      voteCount={frame.voteCount}
      totalVoters={frame.totalVoters}
    />
  ) : (
    <TotChoiceButtons
      choices={frame.choices}
      hasVoted={!!vote.pending || vote.confirmed}
      onSelect={(choice) => {
        actions.playChoiceClick();
        vote.choose(choice);
      }}
    />
  );

  return (
    <PlayerGameLayout
      frame={frame}
      selectionUI={selectionUI}
      confirmUI={
        vote.pending && !vote.confirmed ? (
          <ConfirmVoteCard
            vote={vote.pending}
            onConfirm={vote.confirm}
            onChange={vote.change}
            titleLabel="Confirm your vote?"
            confirmLabel="✓ Confirm"
            changeLabel="← Change"
          />
        ) : null
      }
      jokerUI={null}
    />
  );
}
