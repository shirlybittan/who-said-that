import React, { useRef, useState } from 'react';
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

export default function SelfiePhotoPage() {
  const { state, dispatch } = useGame();
  const selfie = state.selfie;
  const sounds = useSounds();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [compressed, setCompressed] = useState(null);
  const [processing, setProcessing] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
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
    if (!compressed || selfie.hasSubmittedPhoto) return;
    sounds.answer?.();
    socket.emit('selfie:submit_photo', { code: state.roomCode, photoData: compressed });
    dispatch({ type: 'SELFIE_MARK_PHOTO_SUBMITTED' });
  };

  const handleRetake = () => {
    setPreview(null);
    setCompressed(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

      {!selfie.hasSubmittedPhoto ? (
        <>
          {!preview ? (
            <div className="w-full max-w-xs">
              <label
                htmlFor="selfie-input"
                className="flex flex-col items-center justify-center w-full h-64 rounded-2xl border-2 border-dashed border-[#4ECDC4]/60 bg-[#1A1A2E] cursor-pointer hover:border-[#4ECDC4] transition"
              >
                <span className="text-6xl mb-3">📷</span>
                <span className="font-['Fredoka_One'] text-[#4ECDC4] text-lg">Take / Choose Photo</span>
                <span className="text-gray-500 font-['Nunito'] text-xs mt-1">Tap to open camera</span>
              </label>
              <input
                ref={fileInputRef}
                id="selfie-input"
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={handleFileChange}
              />
              {processing && <p className="text-center text-gray-400 mt-3 font-['Nunito']">Processing…</p>}
            </div>
          ) : (
            <div className="w-full max-w-xs flex flex-col items-center gap-4">
              <img
                src={preview}
                alt="Preview"
                className="w-full rounded-2xl border-2 border-[#4ECDC4] object-cover"
                style={{ maxHeight: 320 }}
              />
              <div className="flex gap-3 w-full">
                <button
                  onClick={handleRetake}
                  className="flex-1 bg-[#1A1A2E] border border-[#2D2D44] text-gray-300 font-['Fredoka_One'] py-3 rounded-xl hover:bg-[#2D2D44] transition"
                >
                  Retake
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 bg-[#FF6B6B] text-white font-['Fredoka_One'] py-3 rounded-xl hover:bg-[#e05a5a] transition"
                >
                  Use This!
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="w-full max-w-xs bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-6 text-center">
          <p className="text-[#4ECDC4] font-['Fredoka_One'] text-xl mb-2">Photo submitted! ✓</p>
          <p className="text-gray-400 font-['Nunito'] text-sm">
            Waiting for everyone… ({selfie.photoCount}/{selfie.totalPhotographers})
          </p>
          {preview && (
            <img src={preview} alt="Your selfie" className="mt-4 w-full rounded-xl border border-[#2D2D44] opacity-75" />
          )}
        </div>
      )}

      {/* Progress */}
      {selfie.totalPhotographers > 0 && (
        <div className="mt-8 flex gap-2">
          {Array.from({ length: selfie.totalPhotographers }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${i < selfie.photoCount ? 'bg-[#FF6B6B]' : 'bg-[#2D2D44]'}`}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
