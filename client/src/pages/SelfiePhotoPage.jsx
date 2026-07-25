import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import SelfieCapture from '../components/game/SelfieCapture.jsx';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

/**
 * Attempt a presigned PUT upload to cloud storage.
 * Returns the public URL on success, or null if the server doesn't have
 * storage configured (falls back to base64 socket path).
 */
async function tryCloudUpload(roomCode, playerId, dataUrl, uploadToken) {
  const mimeMatch = dataUrl.match(/^data:(image\/[a-z]+);base64,/);
  if (!mimeMatch) return null;
  const mimeType = mimeMatch[1];

  try {
    const res = await fetch(`${SERVER_URL}/api/upload-photo-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, playerId, mimeType, uploadToken }),
    });
    if (!res.ok) return null; // storage not configured

    const { uploadUrl, publicUrl } = await res.json();
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });

    const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: blob });
    if (!putRes.ok) return null;
    return publicUrl;
  } catch {
    return null; // network error — fall back to base64
  }
}

export default function SelfiePhotoPage() {
  const { state, dispatch } = useGame();
  const selfie = state.selfie;
  const sounds = useSounds();

  // Async submit: try cloud upload, fall back to base64. Throwing surfaces the
  // shared "Upload failed" message in SelfieCapture.
  const handleSubmit = async (photoData) => {
    sounds.answer?.();
    const cloudUrl = await tryCloudUpload(state.roomCode, state.playerId, photoData, state.uploadToken);
    const toSend = cloudUrl || photoData;
    if (!toSend) throw new Error('no photo to send');
    socket.emit('selfie:submit_photo', { code: state.roomCode, photoData: toSend });
    dispatch({ type: 'SELFIE_MARK_PHOTO_SUBMITTED' });
    dispatch({ type: 'SAVED_SELFIE_STORED', payload: photoData }); // cache the base64 locally for reuse
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
