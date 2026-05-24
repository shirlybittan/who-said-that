import React, { useRef, useState, useEffect } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import { compressPhoto } from '../utils/imageUtils';

export default function PhotoVotePhotoPage() {
  const { state, dispatch } = useGame();
  const pv = state.photoVote;
  const sounds = useSounds();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [compressed, setCompressed] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [usingSaved, setUsingSaved] = useState(false);

  const modeLabel = pv.subType === 'photoassoc' ? 'Prompt Match 🎯' : 'Selfie Challenge 🎭';
  const modeColor = pv.subType === 'photoassoc' ? '#A29BFE' : '#FDCB6E';

  // Pre-fill with saved selfie if available
  useEffect(() => {
    if (state.savedSelfie && !pv.hasSubmittedPhoto && !compressed) {
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
    if (!compressed || pv.hasSubmittedPhoto) return;
    sounds.answer?.();
    socket.emit('photovote:submit_photo', { code: state.roomCode, photoData: compressed });
    dispatch({ type: 'PHOTOVOTE_MARK_PHOTO_SUBMITTED' });
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

      {!pv.hasSubmittedPhoto ? (
        <div className="w-full max-w-sm flex flex-col items-center gap-4">
          {preview ? (
            <>
              {usingSaved && (
                <div className="w-full py-2 px-3 rounded-xl text-center" style={{ backgroundColor: modeColor + '22', border: `1px solid ${modeColor}66` }}>
                  <span style={{ color: modeColor }} className="font-['Fredoka_One'] text-sm">✅ Using your saved selfie</span>
                </div>
              )}
              <img src={preview} className="w-64 h-64 object-cover rounded-2xl border-2" style={{ borderColor: modeColor }} alt="preview" />
              <div className="flex gap-3 w-full">
                <button
                  onClick={handleRetake}
                  className="flex-1 py-3 rounded-2xl bg-gray-700 text-white font-['Fredoka_One'] text-lg"
                >
                  {usingSaved ? '📷 New Photo' : 'Retake 🔄'}
                </button>
                <button
                  onClick={handleSubmit}
                  style={{ backgroundColor: modeColor }}
                  className="flex-1 py-3 rounded-2xl text-white font-['Fredoka_One'] text-lg"
                >
                  {usingSaved ? 'Use This ✓' : 'Submit! ✅'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div
                className="w-64 h-64 rounded-2xl border-2 border-dashed border-gray-600 flex items-center justify-center cursor-pointer hover:border-yellow-400 transition-colors"
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
          <p style={{ color: modeColor }} className="font-['Fredoka_One'] text-xl">Photo submitted!</p>
          <p className="text-gray-400 font-['Nunito'] text-sm text-center">
            {pv.photoSubmittedCount} / {pv.totalPhotographers} photos in
          </p>
          <p className="text-gray-500 font-['Nunito'] text-xs">Waiting for everyone…</p>
        </div>
      )}
    </motion.div>
  );
}
