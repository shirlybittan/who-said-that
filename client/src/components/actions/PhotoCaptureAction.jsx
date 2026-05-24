import React, { useRef, useState } from 'react';
import { compressPhoto } from '../../utils/imageUtils';

/**
 * PhotoCaptureAction — reusable photo capture + compress widget.
 *
 * Props:
 *   hasSubmitted  {boolean}   – lock UI after submission
 *   onSubmit      {fn(dataUrl)} – called with compressed base64 when player confirms
 *   waitingLabel  {string}    – text shown after submission (default: "Photo submitted! ✓")
 *   photoCount    {number}
 *   totalPhotographers {number}
 */
export default function PhotoCaptureAction({
  hasSubmitted,
  onSubmit,
  waitingLabel = 'Photo submitted! ✓',
  photoCount = 0,
  totalPhotographers = 0,
}) {
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
    if (!compressed || hasSubmitted) return;
    onSubmit(compressed);
  };

  const handleRetake = () => {
    setPreview(null);
    setCompressed(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (hasSubmitted) {
    return (
      <div className="w-full bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-6 text-center">
        <p className="text-[#4ECDC4] font-['Fredoka_One'] text-xl mb-2">{waitingLabel}</p>
        <p className="text-gray-400 font-['Nunito'] text-sm">
          Waiting for everyone… ({photoCount}/{totalPhotographers})
        </p>
        {preview && (
          <img src={preview} alt="Your photo" className="mt-4 w-full rounded-xl border border-[#2D2D44] opacity-75" />
        )}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center">
      {!preview ? (
        <div className="w-full">
          <label
            htmlFor="photo-capture-input"
            className="flex flex-col items-center justify-center w-full h-64 rounded-2xl border-2 border-dashed border-[#4ECDC4]/60 bg-[#1A1A2E] cursor-pointer hover:border-[#4ECDC4] transition"
          >
            <span className="text-6xl mb-3">📷</span>
            <span className="font-['Fredoka_One'] text-[#4ECDC4] text-lg">Take / Choose Photo</span>
            <span className="text-gray-500 font-['Nunito'] text-xs mt-1">Tap to open camera</span>
          </label>
          <input
            ref={fileInputRef}
            id="photo-capture-input"
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={handleFileChange}
          />
          {processing && <p className="text-center text-gray-400 mt-3 font-['Nunito']">Processing…</p>}
        </div>
      ) : (
        <div className="w-full flex flex-col items-center gap-4">
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

      {/* Progress dots */}
      {totalPhotographers > 0 && (
        <div className="mt-6 flex gap-2">
          {Array.from({ length: totalPhotographers }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${i < photoCount ? 'bg-[#FF6B6B]' : 'bg-[#2D2D44]'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
