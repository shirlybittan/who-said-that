import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import GamePageWrapper from '../components/GamePageWrapper.jsx';
import SelfieCapture from '../components/game/SelfieCapture.jsx';
import { uploadPhoto } from '../utils/photoUpload.js';
import { translations } from '../locales/translations';

export default function CaptionPhotoPage() {
  const { state, dispatch } = useGame();
  const caption = state.caption;
  const sounds = useSounds();
  const lang = translations[state.lang] || translations.en;
  const t = lang.photo || translations.en.photo;
  const tc = lang.common || translations.en.common;

  const handleSubmit = async (photoData) => {
    sounds.answer?.();
    const toSend = await uploadPhoto(photoData, { roomCode: state.roomCode, playerId: state.playerId, uploadToken: state.uploadToken });
    socket.emit('caption:submit_photo', { code: state.roomCode, photoData: toSend });
    dispatch({ type: 'CAPTION_MARK_PHOTO_SUBMITTED' });
    dispatch({ type: 'SAVED_SELFIE_STORED', payload: photoData });
  };

  return (
    <GamePageWrapper>
      <motion.div
        className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8] mt-6 mb-2">{t.captionTitle}</h1>
        <p className="text-gray-400 font-['Nunito'] text-sm text-center mb-2">
          {tc.round.replace('{current}', caption.round).replace('{total}', caption.totalRounds)}
        </p>
        <p className="text-gray-400 font-['Nunito'] text-sm text-center mb-6">
          {t.captionHint}
        </p>

        <SelfieCapture
          accent="#FD79A8"
          savedPhoto={state.savedSelfie}
          hasSubmitted={caption.hasSubmittedPhoto}
          photoCount={caption.photoSubmittedCount}
          totalPhotographers={caption.totalPhotographers}
          onSubmit={handleSubmit}
        />
      </motion.div>
    </GamePageWrapper>
  );
}
