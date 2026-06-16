import React, { useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import ReplayCanvas from '../components/game/ReplayCanvas';
import ConfirmVoteCard from '../game-core/player/ConfirmVoteCard';

export default function SelfieVotePage() {
  const { state, dispatch } = useGame();
  const selfie = state.selfie;
  const sounds = useSounds();
  const [selected, setSelected] = useState(null);

  const handleSelect = (drawerId) => {
    if (selfie.hasVoted || drawerId === state.playerId) return;
    sounds.click?.();
    setSelected(drawerId);
  };

  const handleConfirm = () => {
    if (!selected || selfie.hasVoted) return;
    sounds.vote?.();
    socket.emit('selfie:vote', { code: state.roomCode, drawerId: selected });
    dispatch({ type: 'SELFIE_MARK_VOTED', payload: { drawerId: selected } });
  };

  const handleShowResults = () => {
    sounds.click?.();
    socket.emit('selfie:show_results', { code: state.roomCode });
  };

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <h1 className="text-2xl font-['Fredoka_One'] text-[#FF6B6B] mt-6 mb-2">Vote for Funniest! 😂</h1>
      {selfie.promptTemplate ? (
        <div className="bg-[#FFE66D]/10 border border-[#FFE66D]/30 rounded-xl px-4 py-2 mb-4 text-center">
          <p className="text-[#FFE66D] font-['Fredoka_One'] text-sm">
            {selfie.promptTemplate.replace('[Name]', '…')}
          </p>
        </div>
      ) : (
        <p className="text-gray-400 font-['Nunito'] text-sm mb-6">Which roast made you laugh?</p>
      )}

      <motion.div
        className="w-full max-w-md space-y-5 mb-6"
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } } }}
      >
        {selfie.submissions.map((sub) => {
          const isOwn = sub.drawerId === state.playerId;
          const selected = selfie.myVote === sub.drawerId;
          return (
            <motion.div
              key={sub.drawerId}
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } }}
              className={`rounded-2xl p-4 border-2 transition
                ${selected === sub.drawerId && !selfie.hasVoted ? 'border-yellow-400 bg-yellow-400/10' : ''}
                ${selfie.myVote === sub.drawerId ? 'border-[#FF6B6B] bg-[#FF6B6B]/10' : ''}
                ${selected !== sub.drawerId && selfie.myVote !== sub.drawerId ? 'border-[#2D2D44] bg-[#1A1A2E]' : ''}
                ${!selfie.hasVoted && !isOwn ? 'cursor-pointer hover:border-[#FF6B6B]/60' : ''}
                ${isOwn ? 'opacity-60' : ''}`}
              onClick={() => !selfie.hasVoted && !isOwn && handleSelect(sub.drawerId)}
            >
              <ReplayCanvas photoData={sub.photoData} strokes={sub.strokes} cssWidth="100%" className="rounded-xl overflow-hidden" />
              {sub.prompt && (
                <p className="mt-2 text-xs font-['Nunito'] text-[#FFE66D] italic">{sub.prompt}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selfie.hasVoted ? sub.drawerColor : '#6B7280' }} />
                <span className="font-['Nunito'] text-sm text-gray-300">
                  {selfie.hasVoted ? (
                    <>Drew: <span className="font-bold">{sub.drawerName}</span></>
                  ) : isOwn ? (
                    <span className="text-gray-500">Your drawing (can't vote)</span>
                  ) : (
                    <span className="text-gray-500">Anonymous Artist</span>
                  )}
                </span>
              </div>
              <span className="text-xs text-gray-500 font-['Nunito']">on {sub.ownerName}'s selfie</span>
              {selected === sub.drawerId && !selfie.hasVoted && <div className="mt-1 text-yellow-400 font-['Fredoka_One']">👆 Selected</div>}
              {selfie.myVote === sub.drawerId && <div className="mt-1 text-[#FF6B6B] font-['Fredoka_One']">✓ Your vote</div>}
            </motion.div>
          );
        })}
      </motion.div>

      {selected && !selfie.hasVoted && (() => {
        const selectedSub = selfie.submissions.find(s => s.drawerId === selected);
        return (
          <ConfirmVoteCard
            vote={{
              name: selectedSub ? `Drawing on ${selectedSub.ownerName}'s photo` : 'Anonymous Artist',
              color: '#6B7280'
            }}
            onConfirm={handleConfirm}
            onChange={() => setSelected(null)}
            confirmLabel="✓ Confirm"
            changeLabel="← Change"
            titleLabel="Confirm your vote?"
          />
        );
      })()}

      {selfie.hasVoted && (
        <p className="text-gray-400 font-['Nunito'] text-sm">
          Waiting for results… ({selfie.voteCount}/{selfie.totalVoters} voted)
        </p>
      )}

      {state.isHost && (
        <button
          onClick={handleShowResults}
          className="mt-4 text-sm text-gray-400 underline font-['Nunito'] hover:text-white transition"
        >
          Show results now
        </button>
      )}
    </motion.div>
  );
}
