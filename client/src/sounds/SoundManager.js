/**
 * SoundManager — Web Audio API based, no external library.
 *
 * All sounds are generated procedurally via oscillators / noise so the app
 * ships zero audio files.  Every method is safe to call even before the
 * AudioContext is unlocked (calls are silently dropped).
 *
 * Persisted state (muted) is stored in localStorage under "wst_sound_muted".
 */

class SoundManager {
  constructor() {
    this._ctx = null;
    this._muted = localStorage.getItem('wst_sound_muted') === 'true';
    this._volume = 0.6; // master gain 0-1
    this._prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ─── Lazy AudioContext (requires user gesture on first call) ──────────────

  _getCtx() {
    if (!this._ctx) {
      try {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        return null;
      }
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    return this._ctx;
  }

  // ─── Master gain helper ───────────────────────────────────────────────────

  _masterGain(ctx) {
    const g = ctx.createGain();
    g.gain.value = this._muted ? 0 : this._volume;
    g.connect(ctx.destination);
    return g;
  }

  // ─── Oscillator helper ────────────────────────────────────────────────────

  _osc(ctx, type, freq, startTime, duration, gainPeak = 0.4, dest) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    env.gain.setValueAtTime(0, startTime);
    env.gain.linearRampToValueAtTime(gainPeak, startTime + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(env);
    env.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    return osc;
  }

  // ─── Public mute API ──────────────────────────────────────────────────────

  get muted() { return this._muted; }

  toggleMute() {
    this._muted = !this._muted;
    localStorage.setItem('wst_sound_muted', String(this._muted));
    return this._muted;
  }

  // ─── Sound catalogue ──────────────────────────────────────────────────────

  /** Short "pop" click — button tap */
  playClick() {
    const ctx = this._getCtx();
    if (!ctx || this._muted) return;
    const t = ctx.currentTime;
    const master = this._masterGain(ctx);
    this._osc(ctx, 'sine', 880, t, 0.08, 0.25, master);
  }

  /** Positive confirmation / answer submitted */
  playSuccess() {
    const ctx = this._getCtx();
    if (!ctx || this._muted) return;
    const t = ctx.currentTime;
    const master = this._masterGain(ctx);
    // rising two-note ding
    this._osc(ctx, 'triangle', 523, t, 0.15, 0.3, master);
    this._osc(ctx, 'triangle', 784, t + 0.12, 0.25, 0.35, master);
  }

  /** Countdown tick */
  playTick() {
    const ctx = this._getCtx();
    if (!ctx || this._muted) return;
    const t = ctx.currentTime;
    const master = this._masterGain(ctx);
    this._osc(ctx, 'square', 1200, t, 0.04, 0.1, master);
  }

  /** Urgent tick (last 5 s) */
  playTickUrgent() {
    const ctx = this._getCtx();
    if (!ctx || this._muted) return;
    const t = ctx.currentTime;
    const master = this._masterGain(ctx);
    this._osc(ctx, 'square', 1600, t, 0.06, 0.18, master);
  }

  /** New question / round reveal */
  playReveal() {
    const ctx = this._getCtx();
    if (!ctx || this._muted) return;
    const t = ctx.currentTime;
    const master = this._masterGain(ctx);
    // quick ascending arpeggio
    [261, 330, 392, 523].forEach((f, i) => {
      this._osc(ctx, 'sine', f, t + i * 0.07, 0.2, 0.28, master);
    });
  }

  /** Vote cast / option selected */
  playVote() {
    const ctx = this._getCtx();
    if (!ctx || this._muted) return;
    const t = ctx.currentTime;
    const master = this._masterGain(ctx);
    this._osc(ctx, 'triangle', 660, t, 0.12, 0.28, master);
    this._osc(ctx, 'triangle', 440, t + 0.06, 0.1, 0.15, master);
  }

  /** Round end / results */
  playRoundEnd() {
    const ctx = this._getCtx();
    if (!ctx || this._muted) return;
    const t = ctx.currentTime;
    const master = this._masterGain(ctx);
    // fanfare figure
    [523, 659, 784, 1047].forEach((f, i) => {
      this._osc(ctx, 'sine', f, t + i * 0.1, 0.25, 0.3, master);
    });
  }

  /** Game end — winner jingle */
  playGameEnd() {
    const ctx = this._getCtx();
    if (!ctx || this._muted) return;
    const t = ctx.currentTime;
    const master = this._masterGain(ctx);
    const notes = [523, 659, 784, 659, 784, 1047];
    notes.forEach((f, i) => {
      this._osc(ctx, 'triangle', f, t + i * 0.13, 0.25, 0.35, master);
    });
  }

  /** Joker / special action */
  playJoker() {
    const ctx = this._getCtx();
    if (!ctx || this._muted) return;
    const t = ctx.currentTime;
    const master = this._masterGain(ctx);
    // sparkly glide
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.3);
    env.gain.setValueAtTime(0.3, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  /** Error / wrong answer */
  playError() {
    const ctx = this._getCtx();
    if (!ctx || this._muted) return;
    const t = ctx.currentTime;
    const master = this._masterGain(ctx);
    this._osc(ctx, 'sawtooth', 220, t, 0.2, 0.3, master);
    this._osc(ctx, 'sawtooth', 196, t + 0.1, 0.2, 0.25, master);
  }

  /** Drawing — stroke sound */
  playDraw() {
    const ctx = this._getCtx();
    if (!ctx || this._muted) return;
    const t = ctx.currentTime;
    const master = this._masterGain(ctx);
    // wispy noise burst
    const bufSize = ctx.sampleRate * 0.05;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 3000;
    filt.Q.value = 0.8;
    src.connect(filt);
    filt.connect(master);
    src.start(t);
  }

  /** Player joined lobby */
  playJoin() {
    const ctx = this._getCtx();
    if (!ctx || this._muted) return;
    const t = ctx.currentTime;
    const master = this._masterGain(ctx);
    this._osc(ctx, 'sine', 392, t, 0.12, 0.22, master);
    this._osc(ctx, 'sine', 523, t + 0.08, 0.15, 0.22, master);
  }
}

// Singleton
export const soundManager = new SoundManager();
