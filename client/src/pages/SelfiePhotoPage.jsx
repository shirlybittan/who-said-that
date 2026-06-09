import React, { useRef, useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import { compressPhoto } from '../utils/imageUtils';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

/**
 * Attempt a presigned PUT upload to cloud storage.
 * Returns the public URL on success, or null if the server doesn't have
 * storage configured (falls back to base64 socket path).
 */
async function tryCloudUpload(roomCode, playerId, dataUrl, uploadToken) {
  // Derive mimeType from the data URI
  const mimeMatch = dataUrl.match(/^data:(image\/[a-z]+);base64,/);
  if (!mimeMatch) return null;
  const mimeType = mimeMatch[1];

  try {
    const res = await fetch(`${SERVER_URL}/api/upload-photo-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, playerId, mimeType, uploadToken }),
    });
    if (!res.ok) return null; // Server returned 503 = storage not configured

    const { uploadUrl, publicUrl } = await res.json();

    // Convert base64 data URI to binary blob for the PUT request
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: blob,
    });
    if (!putRes.ok) return null;

    return publicUrl;
  } catch {
    return null; // Network error — fall back to base64
  }
}

export default function SelfiePhotoPage() {
  const { state, dispatch } = useGame();
  const selfie = state.selfie;
  const sounds = useSounds();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [compressed, setCompressed] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [usingSaved, setUsingSaved] = useState(false);
  // When a saved selfie exists, show an explicit choice screen first (never auto-use)
  const [showReuseChoice, setShowReuseChoice] = useState(
    () => !!(state.savedSelfie && !selfie?.hasSubmittedPhoto)
  );

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

  const handleSubmit = async () => {
    if (!compressed || selfie.hasSubmittedPhoto || uploading) return;
    sounds.answer?.();
    setUploading(true);
    setUploadError(false);

    // Try cloud upload first; fall back to inline base64 if unavailable
    let photoData = compressed;
    const cloudUrl = await tryCloudUpload(state.roomCode, state.playerId, compressed, state.uploadToken);
    if (cloudUrl) photoData = cloudUrl;

    // Confirm we still have something to send
    if (!photoData) {
      setUploadError(true);
      setUploading(false);
      return;
    }

    socket.emit('selfie:submit_photo', { code: state.roomCode, photoData });
    dispatch({ type: 'SELFIE_MARK_PHOTO_SUBMITTED' });
    dispatch({ type: 'SAVED_SELFIE_STORED', payload: compressed }); // always cache base64 locally
    setUploading(false);
  };

  const handleRetake = () => {
    setPreview(null);
    setCompressed(null);
    setUsingSaved(false);
    setShowReuseChoice(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUseSaved = () => {
    setCompressed(state.savedSelfie);
    setPreview(state.savedSelfie);
    setUsingSaved(true);
    setShowReuseChoice(false);
  };

  const handleTakeNew = () => {
    setShowReuseChoice(false);
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
          {/* Explicit consent screen — shown only when a saved selfie exists */}
          {showReuseChoice ? (
            <div className="w-full max-w-xs flex flex-col items-center gap-4">
              <p className="text-base font-['Fredoka_One'] text-gray-300 text-center">
                Use your saved selfie or take a new one?
              </p>
              <img
                src={state.savedSelfie}
                alt="Saved selfie"
                className="w-full rounded-2xl border-2 border-[#2D2D44] object-contain bg-[#111827]"
                style={{ maxHeight: 260 }}
              />
              <div className="flex gap-3 w-full">
                <button
                  onClick={handleTakeNew}
                  className="flex-1 bg-[#1A1A2E] border border-[#2D2D44] text-gray-300 font-['Fredoka_One'] py-3 rounded-xl hover:bg-[#2D2D44] transition"
                >
                  📷 New Photo
                </button>
                <button
                  onClick={handleUseSaved}
                  className="flex-1 bg-[#4ECDC4] text-[#0D0D1A] font-['Fredoka_One'] py-3 rounded-xl hover:bg-[#3dbdb5] transition"
                >
                  ♻️ Reuse This
                </button>
              </div>
            </div>
          ) : !preview ? (
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
              {usingSaved && (
                <div className="w-full py-2 px-3 rounded-xl bg-[#4ECDC4]/15 border border-[#4ECDC4]/40 text-center">
                  <span className="text-[#4ECDC4] font-['Fredoka_One'] text-sm">✅ Using your saved selfie</span>
                </div>
              )}
              <img
                src={preview}
                alt="Preview"
                className="w-full rounded-2xl border-2 border-[#4ECDC4] object-contain bg-[#111827]"
                style={{ maxHeight: 320 }}
              />
              <div className="flex gap-3 w-full">
                <button
                  onClick={handleRetake}
                  className="flex-1 bg-[#1A1A2E] border border-[#2D2D44] text-gray-300 font-['Fredoka_One'] py-3 rounded-xl hover:bg-[#2D2D44] transition"
                >
                  {usingSaved ? '📷 New Photo' : 'Retake'}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={uploading}
                  className="flex-1 bg-[#FF6B6B] text-white font-['Fredoka_One'] py-3 rounded-xl hover:bg-[#e05a5a] transition disabled:opacity-60"
                >
                  {uploading ? 'Uploading…' : usingSaved ? 'Use This ✓' : 'Use This!'}
                </button>
              </div>
              {uploadError && (
                <p className="text-[#FF6B6B] font-['Nunito'] text-sm text-center mt-1">
                  Upload failed. Check your connection and try again.
                </p>
              )}
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
