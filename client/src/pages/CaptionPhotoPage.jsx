import React, { useRef, useState, useEffect } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

const MAX_SIZE = 640;
const JPEG_QUALITY = 0.4;

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_SIZE || height > MAX_SIZE) {
        if (width > height) { height = Math.round((height / width) * MAX_SIZE); width = MAX_SIZE; }
        else { width = Math.round((width / height) * MAX_SIZE); height = MAX_SIZE; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function CaptionPhotoPage() {
  const { state, dispatch } = useGame();
  const caption = state.caption;
  const sounds = useSounds();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [compressed, setCompressed] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [usingSaved, setUsingSaved] = useState(false);

  // Pre-fill with saved selfie if available
  useEffect(() => {
    if (state.savedSelfie && !caption.hasSubmittedPhoto && !compressed) {
      setCompressed(state.savedSelfie);
      setPreview(state.savedSelfie);
      setUsingSaved(true);
    }
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setUsingSaved(false);
    try {
      const dataUrl = await compressPhoto(file);
      setCompressed(dataUrl);
      setPreview(dataUrl);
    } catch {
      alert('Could not process that image. Please try another.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmit = () => {
    if (!compressed || caption.hasSubmittedPhoto) return;
    sounds.answer?.();
    socket.emit('caption:submit_photo', { code: state.roomCode, photoData: compressed });
    dispatch({ type: 'CAPTION_MARK_PHOTO_SUBMITTED' });
    dispatch({ type: 'SAVED_SELFIE_STORED', payload: compressed });
  };

  const handleRetake = () => {
    setPreview(null);
    setCompressed(null);
    setUsingSaved(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <h1 className="text-3xl font-['Fredoka_One'] text-[#FD79A8] mt-6 mb-2">Caption Me! 💬</h1>
      <p className="text-gray-400 font-['Nunito'] text-sm text-center mb-2">
        Round {caption.round} of {caption.totalRounds}
      </p>
      <p className="text-gray-400 font-['Nunito'] text-sm text-center mb-6">
        Take a selfie — everyone else will write a caption for it!
      </p>

      {!caption.hasSubmittedPhoto ? (
        <div className="w-full max-w-sm flex flex-col items-center gap-4">
          {preview ? (
            <>
              {usingSaved && (
                <div className="w-full py-2 px-3 rounded-xl bg-[#FD79A8]/15 border border-[#FD79A8]/40 text-center">
                  <span className="text-[#FD79A8] font-['Fredoka_One'] text-sm">✅ Using your saved selfie</span>
                </div>
              )}
              <img src={preview} className="w-64 h-64 object-cover rounded-2xl border-2 border-[#FD79A8]" alt="preview" />
              <div className="flex gap-3 w-full">
                <button
                  onClick={handleRetake}
                  className="flex-1 py-3 rounded-2xl bg-gray-700 text-white font-['Fredoka_One'] text-lg"
                >
                  {usingSaved ? '📷 New Photo' : 'Retake 🔄'}
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 py-3 rounded-2xl bg-[#FD79A8] text-white font-['Fredoka_One'] text-lg"
                >
                  {usingSaved ? 'Use This ✓' : 'Submit! ✅'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div
                className="w-64 h-64 rounded-2xl border-2 border-dashed border-gray-600 flex items-center justify-center cursor-pointer hover:border-[#FD79A8] transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {processing ? (
                  <span className="text-gray-400 font-['Nunito']">Processing…</span>
                ) : (
                  <span className="text-gray-500 font-['Nunito'] text-center px-4">Tap to choose or take a photo 📸</span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={handleFileChange}
              />
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="text-6xl">✅</div>
          <p className="text-[#FD79A8] font-['Fredoka_One'] text-xl">Photo submitted!</p>
          <p className="text-gray-400 font-['Nunito'] text-sm text-center">
            {caption.photoSubmittedCount} / {caption.totalPhotographers} photos in
          </p>
          <p className="text-gray-500 font-['Nunito'] text-xs">Waiting for everyone…</p>
        </div>
      )}
    </motion.div>
  );
}
