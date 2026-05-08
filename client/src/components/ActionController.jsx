import React from 'react';
import PhotoCaptureAction from './actions/PhotoCaptureAction.jsx';
import TextInputAction from './actions/TextInputAction.jsx';
import VoteGridAction from './actions/VoteGridAction.jsx';
import VoteCaptionAction from './actions/VoteCaptionAction.jsx';

/**
 * ActionController — selects the correct action UI component
 * based on the current game mode and phase.
 *
 * All extra props are forwarded to the rendered component.
 */
export default function ActionController({ mode, phase, ...props }) {
  // ── Selfie Captioning ──────────────────────────────────────────────────────
  if (mode === 'caption') {
    if (phase === 'photo') return <PhotoCaptureAction {...props} />;
    if (phase === 'writing') return <TextInputAction {...props} />;
    if (phase === 'voting') return <VoteCaptionAction {...props} />;
  }

  // ── Prompt Matching / Photo Association ────────────────────────────────────
  if (mode === 'pmatch' || mode === 'photoassoc') {
    if (phase === 'photo') return <PhotoCaptureAction {...props} />;
    if (phase === 'voting') return <VoteGridAction {...props} />;
  }

  // ── Before/After (same as selfie-artist, handled by dedicated pages) ───────
  if (mode === 'beforeafter') {
    if (phase === 'photo') return <PhotoCaptureAction {...props} />;
  }

  return null;
}
