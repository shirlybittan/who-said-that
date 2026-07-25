import React, { useRef, useState } from 'react';
import { compressPhoto } from '../../utils/imageUtils';

/**
 * SelfieCapture — the one shared selfie/photo capture flow for every photo-based
 * mini-game (Draw-on-Friends, Caption, Photo-Vote, Draw-Telephone).
 *
 * Implements the flow the product spec asks for, identically everywhere:
 *   - if the player already has a saved selfie, show an explicit choice first:
 *       "Use your previous photo?"  →  [Take a new one] / [Reuse this]
 *     (never silently auto-reuse)
 *   - otherwise go straight to the camera
 *   - capture → compress → preview → confirm, with retake
 *   - after submit: a shared waiting card + progress dots
 *
 * The game only supplies its accent colour and an onSubmit(dataUrl) that does
 * the game-specific emit (and may be async, e.g. a cloud upload — errors are
 * surfaced). No page reimplements capture/preview/waiting markup anymore.
 *
 * Props:
 *   accent              {string}        theme colour (default teal)
 *   savedPhoto          {string|null}   previously-used selfie (data URL)
 *   hasSubmitted        {boolean}
 *   photoCount          {number}
 *   totalPhotographers  {number}
 *   onSubmit            {fn(dataUrl) => void|Promise}  game-specific submit
 *   submittedLabel      {string}        text on the waiting card
 */
export default function SelfieCapture({
  accent = '#4ECDC4',
  savedPhoto = null,
  hasSubmitted = false,
  photoCount = 0,
  totalPhotographers = 0,
  onSubmit,
  submittedLabel = 'Photo submitted! ✓',
}) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [compressed, setCompressed] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // Explicit reuse choice appears only when a saved selfie exists and we haven't
  // captured/submitted yet.
  const [showReuse, setShowReuse] = useState(() => !!(savedPhoto && !hasSubmitted));

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    try {
      const dataUrl = await compressPhoto(file);
      setCompressed(dataUrl);
      setPreview(dataUrl);
    } catch {
      setError('Could not process that image. Please try another.');
    } finally {
      setProcessing(false);
    }
  };

  const submit = async () => {
    if (!compressed || hasSubmitted || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(compressed);
    } catch {
      setError('Upload failed. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const retake = () => {
    setPreview(null);
    setCompressed(null);
    setShowReuse(false);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const reuse = () => { setCompressed(savedPhoto); setPreview(savedPhoto); setShowReuse(false); };

  const progressDots = totalPhotographers > 0 && (
    <div className="mt-8 flex gap-2" data-testid="selfie-progress">
      {Array.from({ length: totalPhotographers }).map((_, i) => (
        <div key={i} className="w-3 h-3 rounded-full transition-colors"
          style={{ backgroundColor: i < photoCount ? accent : '#2D2D44' }} />
      ))}
    </div>
  );

  // ── Submitted → shared waiting card ────────────────────────────────────────
  if (hasSubmitted) {
    return (
      <div className="w-full max-w-xs flex flex-col items-center" data-testid="selfie-waiting">
        <div className="w-full bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-6 text-center">
          <p className="font-['Fredoka_One'] text-xl mb-2" style={{ color: accent }}>{submittedLabel}</p>
          <p className="text-gray-400 font-['Nunito'] text-sm">Waiting for everyone… ({photoCount}/{totalPhotographers})</p>
          {preview && <img src={preview} alt="Your photo" className="mt-4 w-full rounded-xl border border-[#2D2D44] opacity-75" />}
        </div>
        {progressDots}
      </div>
    );
  }

  // ── Explicit "use previous photo?" choice ──────────────────────────────────
  if (showReuse) {
    return (
      <div className="w-full max-w-xs flex flex-col items-center gap-4" data-testid="selfie-reuse-choice">
        <p className="text-base font-['Fredoka_One'] text-gray-300 text-center">Use your previous photo?</p>
        <img src={savedPhoto} alt="Saved selfie" className="w-full rounded-2xl border-2 border-[#2D2D44] object-contain bg-[#111827]" style={{ maxHeight: 260 }} />
        <div className="flex gap-3 w-full">
          <button onClick={retake} className="flex-1 bg-[#1A1A2E] border border-[#2D2D44] text-gray-300 font-['Fredoka_One'] py-3 rounded-xl hover:bg-[#2D2D44] transition">📷 Take a new one</button>
          <button onClick={reuse} data-testid="selfie-reuse-btn" className="flex-1 text-[#0D0D1A] font-['Fredoka_One'] py-3 rounded-xl transition" style={{ backgroundColor: accent }}>♻️ Reuse this</button>
        </div>
        {progressDots}
      </div>
    );
  }

  // ── Camera dropzone ────────────────────────────────────────────────────────
  if (!preview) {
    return (
      <div className="w-full max-w-xs flex flex-col items-center">
        <label htmlFor="selfie-capture-input" data-testid="selfie-dropzone"
          className="flex flex-col items-center justify-center w-full h-64 rounded-2xl border-2 border-dashed bg-[#1A1A2E] cursor-pointer transition"
          style={{ borderColor: `${accent}99` }}>
          <span className="text-6xl mb-3">📷</span>
          <span className="font-['Fredoka_One'] text-lg" style={{ color: accent }}>Take / Choose Photo</span>
          <span className="text-gray-500 font-['Nunito'] text-xs mt-1">Tap to open camera</span>
        </label>
        <input ref={fileRef} id="selfie-capture-input" type="file" accept="image/*" capture="user" className="hidden" onChange={handleFile} />
        {processing && <p className="text-center text-gray-400 mt-3 font-['Nunito']">Processing…</p>}
        {error && <p className="text-[#FF6B6B] font-['Nunito'] text-sm text-center mt-3">{error}</p>}
        {progressDots}
      </div>
    );
  }

  // ── Preview + confirm ──────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-xs flex flex-col items-center gap-4">
      <img src={preview} alt="Preview" className="w-full rounded-2xl border-2 object-contain bg-[#111827]" style={{ maxHeight: 320, borderColor: accent }} />
      <div className="flex gap-3 w-full">
        <button onClick={retake} className="flex-1 bg-[#1A1A2E] border border-[#2D2D44] text-gray-300 font-['Fredoka_One'] py-3 rounded-xl hover:bg-[#2D2D44] transition">Retake</button>
        <button onClick={submit} disabled={submitting} data-testid="selfie-submit-btn"
          className="flex-1 text-white font-['Fredoka_One'] py-3 rounded-xl transition disabled:opacity-60"
          style={{ backgroundColor: submitting ? '#555' : accent }}>
          {submitting ? 'Uploading…' : 'Use This!'}
        </button>
      </div>
      {error && <p className="text-[#FF6B6B] font-['Nunito'] text-sm text-center">{error}</p>}
      {progressDots}
    </div>
  );
}
