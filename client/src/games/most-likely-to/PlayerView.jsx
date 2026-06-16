import React, { useState } from 'react';
import { useGame } from '../../store/gameStore.jsx';
import { socket } from '../../socket';
import { useSounds } from '../../hooks/useSounds';
import { translations } from '../../locales/translations';
import PlayerGameLayout from '../../game-core/layouts/PlayerGameLayout';
import { usePlayerGameFrame } from '../../game-core/hooks/usePlayerGameFrame';
import JokerButton from '../../game-core/player/JokerButton';
import ConfirmVoteCard from '../../game-core/player/ConfirmVoteCard';

/**
 * Keeps every choice visible at all times.
 * Tapping a card highlights it; a sticky Confirm button appears at the bottom.
 * Tapping a different card swaps the highlight. Confirm fires onConfirm(selected).
 */
function ChoiceList({ choices, selectedChoice, onSelect, helperText }) {
  return (
    <>
      <p className="text-center text-gray-400 font-['Nunito'] text-sm mb-4">{helperText}</p>
      <div className="flex flex-col gap-3 mb-4">
        {choices.map((choice) => {
          const isSelected = selectedChoice?.id === choice.id;
          return (
            <button
              key={choice.id}
              onClick={() => onSelect(choice)}
              className={`flex items-center gap-4 w-full rounded-2xl p-4 transition border-2 ${
                isSelected
                  ? 'bg-[#4ECDC4]/15 border-[#4ECDC4]'
                  : 'bg-[#1A1A2E] border-[#2D2D44] hover:border-[#4ECDC4]/60'
              }`}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-black font-bold text-lg flex-shrink-0 border-2 border-white/20"
                style={{ backgroundColor: choice.color }}
              >
                {choice.name.charAt(0).toUpperCase()}
              </div>
              <span className={`font-['Fredoka_One'] text-xl flex-1 text-left ${isSelected ? 'text-[#4ECDC4]' : 'text-white'}`}>
                {choice.name}
              </span>
              {isSelected && (
                <span className="text-[#4ECDC4] text-xl leading-none">✓</span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function LockedVoteCard({ choice, voteCount, totalVoters, voteLockedLabel, youVotedForLabel, votesInLabel, jokerActive, jokerWillDoubleLabel }) {
  if (!choice) return null;

  return (
    <div className="flex flex-col items-center gap-4 mt-4">
      <div
        className="w-full rounded-2xl p-8 text-center border-2"
        style={jokerActive
          ? { backgroundColor: '#FF6B6B22', borderColor: '#FF6B6B' }
          : { backgroundColor: '#1A1A2E', borderColor: '#4ECDC4' }}
      >
        <p className="text-3xl font-['Fredoka_One'] mb-2" style={{ color: jokerActive ? '#FF6B6B' : '#4ECDC4' }}>
          {jokerActive ? `🔥 ${voteLockedLabel}` : voteLockedLabel}
        </p>
        <p className="text-gray-400 font-['Nunito'] text-sm">
          {youVotedForLabel} <span className="text-white font-bold">{choice.name}</span>
        </p>
        {jokerActive ? (
          <p className="text-[#FF6B6B] font-['Nunito'] text-xs mt-2 animate-pulse">🔥 {jokerWillDoubleLabel}</p>
        ) : null}
      </div>
      <p className="text-gray-400 font-['Nunito'] text-sm animate-pulse">{voteCount} / {totalVoters} {votesInLabel}</p>
    </div>
  );
}

export default function MostLikelyToPlayerView() {
  const { state, dispatch } = useGame();
  const t = translations[state.lang].mlt;
  const sounds = useSounds();
  const [pendingChoice, setPendingChoice] = useState(null);
  const { frame, actions } = usePlayerGameFrame({
    gameKey: 'most-likely-to',
    state,
    socket,
    dispatch,
    context: { sounds, labels: t },
  });

  const selectionUI = frame.hasSubmitted ? (
    <LockedVoteCard
      choice={frame.submittedChoice}
      voteCount={state.mlt.voteCount}
      totalVoters={state.mlt.totalVoters}
      voteLockedLabel={t.voteLocked}
      youVotedForLabel={t.youVotedFor}
      votesInLabel={t.votesIn}
      jokerActive={state.mlt.jokerActive}
      jokerWillDoubleLabel={t.jokerWillDouble}
    />
  ) : (
    <ChoiceList
      choices={frame.choices}
      selectedChoice={pendingChoice}
      helperText={t.tapToVote}
      onSelect={(choice) => {
        sounds.click?.();
        setPendingChoice(choice);
      }}
    />
  );

  const confirmUI = pendingChoice && !frame.hasSubmitted ? (
    <ConfirmVoteCard
      vote={pendingChoice}
      onConfirm={() => {
        actions.playChoiceClick(pendingChoice);
        actions.submitChoice(pendingChoice);
        setPendingChoice(null);
      }}
      onChange={() => setPendingChoice(null)}
      confirmLabel="✓ Confirm"
      changeLabel="← Change"
      titleLabel="Confirm your vote?"
    />
  ) : null;

  return (
    <PlayerGameLayout
      frame={frame}
      selectionUI={selectionUI}
      confirmUI={confirmUI}
      jokerUI={
        <JokerButton
          left={frame.joker.left}
          active={frame.joker.active}
          onClick={actions.toggleJoker}
          noJokersLabel={t.noJokersLeft}
          activeLabel={t.jokerActive}
          useLabel={t.useJoker}
          leftLabel={t.left}
        />
      }
    />
  );
}
