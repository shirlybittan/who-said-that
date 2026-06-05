import React from 'react';
import { useGame } from '../../store/gameStore.jsx';
import { socket } from '../../socket';
import { useSounds } from '../../hooks/useSounds';
import PlayerGameLayout from '../../game-core/layouts/PlayerGameLayout';
import { usePlayerGameFrame } from '../../game-core/hooks/usePlayerGameFrame';
import { useVoteConfirmation } from '../../game-core/hooks/useVoteConfirmation';
import ConfirmVoteCard from '../../game-core/player/ConfirmVoteCard';
import JokerButton from '../../game-core/player/JokerButton';

function ChoiceList({ choices, onSelect }) {
  return (
    <>
      <p className="text-center text-gray-400 font-['Nunito'] text-sm mb-4">Tap the person you think fits best!</p>
      <div className="flex flex-col gap-3 mb-5">
        {choices.map((choice) => (
          <button
            key={choice.id}
            onClick={() => onSelect(choice)}
            className="flex items-center gap-4 w-full bg-[#1A1A2E] hover:bg-[#2D2D44] border-2 border-[#2D2D44] hover:border-[#4ECDC4] rounded-2xl p-4 transition"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-black font-bold text-lg flex-shrink-0 border-2 border-white/20"
              style={{ backgroundColor: choice.color }}
            >
              {choice.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-['Fredoka_One'] text-xl text-white">{choice.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function LockedVoteCard({ choice, voteCount, totalVoters }) {
  if (!choice) return null;

  return (
    <div className="flex flex-col items-center gap-4 mt-4">
      <div className="w-full rounded-2xl p-8 text-center border-2 bg-[#1A1A2E] border-[#4ECDC4]">
        <p className="text-3xl font-['Fredoka_One'] mb-2 text-[#4ECDC4]">Vote locked in! 🔒</p>
        <p className="text-gray-400 font-['Nunito'] text-sm">
          You voted for <span className="text-white font-bold">{choice.name}</span>
        </p>
      </div>
      <p className="text-gray-400 font-['Nunito'] text-sm animate-pulse">{voteCount} / {totalVoters} votes in</p>
    </div>
  );
}

export default function MostLikelyToPlayerView() {
  const { state, dispatch } = useGame();
  const sounds = useSounds();
  const { frame, actions } = usePlayerGameFrame({
    gameKey: 'most-likely-to',
    state,
    socket,
    dispatch,
    context: { sounds },
  });

  const vote = useVoteConfirmation({
    onConfirmSubmit: actions.submitChoice,
    resetKey: `${state.mlt.round}-${state.mlt.prompt}`,
  });

  const selectionUI = frame.hasSubmitted ? (
    <LockedVoteCard choice={frame.submittedChoice} voteCount={state.mlt.voteCount} totalVoters={state.mlt.totalVoters} />
  ) : (
    <ChoiceList
      choices={frame.choices}
      onSelect={(choice) => {
        actions.chooseChoice(choice);
        vote.choose(choice);
      }}
    />
  );

  return (
    <PlayerGameLayout
      frame={frame}
      selectionUI={selectionUI}
      confirmUI={vote.pending && !vote.confirmed && !frame.hasSubmitted ? <ConfirmVoteCard vote={vote.pending} onConfirm={vote.confirm} onChange={vote.change} /> : null}
      jokerUI={<JokerButton left={frame.joker.left} active={frame.joker.active} onClick={actions.toggleJoker} />}
    />
  );
}
