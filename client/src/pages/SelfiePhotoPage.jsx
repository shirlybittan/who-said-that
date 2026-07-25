import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import SelfieCapture from '../components/game/SelfieCapture.jsx';
import { uploadPhoto } from '../utils/photoUpload.js';

export default function SelfiePhotoPage() {
  const { state, dispatch } = useGame();
  const selfie = state.selfie;
  const sounds = useSounds();

  // Async submit: upload to cloud when configured (falls back to base64). A
  // thrown error surfaces the shared "Upload failed" message in SelfieCapture.
  const handleSubmit = async (photoData) => {
    sounds.answer?.();
    const toSend = await uploadPhoto(photoData, { roomCode: state.roomCode, playerId: state.playerId, uploadToken: state.uploadToken });
    socket.emit('selfie:submit_photo', { code: state.roomCode, photoData: toSend });
    dispatch({ type: 'SELFIE_MARK_PHOTO_SUBMITTED' });
    dispatch({ type: 'SAVED_SELFIE_STORED', payload: photoData }); // cache base64 locally for reuse
  };

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <h1 className="text-3xl font-['Fredoka_One'] text-[#FF6B6B] mt-6 mb-2">Selfie Time! 📸</h1>
      <p className="text-gray-400 font-['Nunito'] text-sm text-center mb-6">
        Take a selfie — someone else will draw on it!
      </p>

      <SelfieCapture
        accent="#FF6B6B"
        savedPhoto={state.savedSelfie}
        hasSubmitted={selfie.hasSubmittedPhoto}
        photoCount={selfie.photoCount}
        totalPhotographers={selfie.totalPhotographers}
        onSubmit={handleSubmit}
      />
    </motion.div>
  );
}
