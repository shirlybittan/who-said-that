import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import SelfieCapture from '../components/game/SelfieCapture.jsx';
import { uploadPhoto } from '../utils/photoUpload.js';

export default function PhotoVotePhotoPage() {
  const { state, dispatch } = useGame();
  const pv = state.photoVote;
  const sounds = useSounds();

  const modeLabel = pv.subType === 'photoassoc' ? 'Prompt Match 🎯' : 'Selfie Challenge 🎭';
  const modeColor = pv.subType === 'photoassoc' ? '#A29BFE' : '#FDCB6E';

  const handleSubmit = async (photoData) => {
    sounds.answer?.();
    const toSend = await uploadPhoto(photoData, { roomCode: state.roomCode, playerId: state.playerId, uploadToken: state.uploadToken });
    socket.emit('photovote:submit_photo', { code: state.roomCode, photoData: toSend });
    dispatch({ type: 'PHOTOVOTE_MARK_PHOTO_SUBMITTED' });
    dispatch({ type: 'SAVED_SELFIE_STORED', payload: photoData });
  };

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <h1 style={{ color: modeColor }} className="text-3xl font-['Fredoka_One'] mt-6 mb-1">{modeLabel}</h1>
      <p className="text-gray-400 font-['Nunito'] text-sm text-center mb-2">
        Round {pv.round} of {pv.totalRounds}
      </p>
      {pv.prompt ? (
        <div
          className="w-full max-w-sm rounded-2xl p-4 mb-5 text-center"
          style={{ backgroundColor: modeColor + '22', border: `2px solid ${modeColor}66` }}
        >
          <p className="text-xs font-['Nunito'] text-gray-400 uppercase tracking-widest mb-1">Your Challenge</p>
          <p style={{ color: modeColor }} className="font-['Fredoka_One'] text-lg leading-snug">{pv.prompt}</p>
        </div>
      ) : (
        <p className="text-gray-400 font-['Nunito'] text-sm text-center mb-6">
          Take a selfie — everyone will vote on who fits each prompt best!
        </p>
      )}

      <SelfieCapture
        accent={modeColor}
        savedPhoto={state.savedSelfie}
        hasSubmitted={pv.hasSubmittedPhoto}
        photoCount={pv.photoSubmittedCount}
        totalPhotographers={pv.totalPhotographers}
        onSubmit={handleSubmit}
      />
    </motion.div>
  );
}
