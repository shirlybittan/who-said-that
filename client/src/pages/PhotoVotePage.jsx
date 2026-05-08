import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

export default function PhotoVotePage() {
  const { state, dispatch } = useGame();
  const pv = state.photoVote;
  const sounds = useSounds();

  const modeColor = pv.subType === 'photoassoc' ? '#A29BFE' : '#FDCB6E';

  const handleVote = (targetPlayerId) => {
    if (pv.hasVoted || targetPlayerId === state.playerId) return;
    sounds.vote?.();
    socket.emit('photovote:vote', { code: state.roomCode, targetPlayerId });
    dispatch({ type: 'PHOTOVOTE_MARK_VOTED', payload: { targetPlayerId } });
  };

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <p className="text-gray-400 font-['Nunito'] text-sm mt-4 mb-2">Round {pv.round} of {pv.totalRounds}</p>
      <h1 className="text-2xl font-['Fredoka_One'] text-[#FFE66D] text-center mb-6 px-2">{pv.prompt}</h1>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {(pv.photos || []).map((photo) => {
          const isMe = photo.playerId === state.playerId;
          const isVoted = pv.myVote === photo.playerId;
          const isDimmed = pv.hasVoted && !isVoted;

          return (
            <button
              key={photo.playerId}
              onClick={() => handleVote(photo.playerId)}
              disabled={pv.hasVoted || isMe}
              className={`relative flex flex-col items-center rounded-2xl overflow-hidden border-2 transition-all ${
                isVoted
                  ? 'border-[#4ECDC4] scale-105'
                  : isMe
                  ? 'border-gray-700 opacity-50 cursor-not-allowed'
                  : pv.hasVoted
                  ? 'border-gray-700 opacity-40'
                  : 'border-gray-600 hover:border-yellow-400 active:scale-95'
              }`}
            >
              {photo.photoData ? (
                <img src={photo.photoData} className="w-full aspect-square object-cover" alt={photo.playerName} />
              ) : (
                <div className="w-full aspect-square bg-gray-800 flex items-center justify-center">
                  <span className="text-4xl">🤷</span>
                </div>
              )}
              <div className="w-full bg-[#0D0D1A]/80 py-1 px-2 text-center">
                <span className="font-['Nunito'] text-xs text-white">{photo.playerName}</span>
                {isVoted && <span className="ml-1">✅</span>}
                {isMe && <span className="ml-1 text-gray-500 text-xs">(you)</span>}
              </div>
            </button>
          );
        })}
      </div>

      {pv.hasVoted && (
        <p className="text-gray-500 font-['Nunito'] text-sm mt-5">
          {pv.voteCount} / {pv.totalVoters} votes in — waiting…
        </p>
      )}
    </motion.div>
  );
}
