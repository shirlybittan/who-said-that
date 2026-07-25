// Input caps + rate limiting — one place for the "don't let a buggy or malicious
// client blow up server memory" guards.
//
// - sanitizeStrokes/clampText bound the size of what gets STORED in room state
//   (and therefore persisted): stroke arrays and free text. These previously
//   lived copy-pasted in several handlers with inconsistent limits.
// - createRateLimiter drops event floods per socket (there was no such guard).
//
// The Socket.IO transport cap (maxHttpBufferSize) is the first line of defence
// against oversized *messages*; these are the second line for what we keep.

const MAX_STROKES = 500;   // per drawing
const MAX_POINTS = 300;    // per stroke
const MAX_ANSWER = 300;    // free-text answers
const MAX_PROMPT = 200;    // prompts / captions / guesses

// Canonical stroke sanitizer: caps count + points, validates colour/width/type.
// Returns a fresh, bounded array (never the caller's reference).
function sanitizeStrokes(strokes) {
  if (!Array.isArray(strokes)) return [];
  return strokes.slice(0, MAX_STROKES).map((s) => ({
    color: /^#[0-9A-Fa-f]{3,6}$/.test(s && s.color) ? s.color : '#000000',
    width: Math.min(Math.max(Number(s && s.width) || 4, 1), 40),
    type: s && s.type === 'eraser' ? 'eraser' : 'pen',
    points: Array.isArray(s && s.points)
      ? s.points.slice(0, MAX_POINTS).map((p) => ({ x: Math.round(Number(p && p.x) || 0), y: Math.round(Number(p && p.y) || 0) }))
      : [],
  }));
}

// Coerce to a string and cap its length (no trim — callers trim if they need to).
function clampText(value, max = MAX_ANSWER) {
  return String(value == null ? '' : value).slice(0, max);
}

// Sliding-window per-key rate limiter. `allow(key)` returns false once a key
// exceeds `max` events within `windowMs`. Generous by default so normal play
// (a few events/sec per player) never trips it — only floods do.
function createRateLimiter({ windowMs = 1000, max = 80 } = {}) {
  const hits = new Map(); // key -> { count, windowStart }
  return {
    allow(key) {
      const now = Date.now();
      let entry = hits.get(key);
      if (!entry || now - entry.windowStart >= windowMs) {
        entry = { count: 0, windowStart: now };
        hits.set(key, entry);
      }
      entry.count += 1;
      return entry.count <= max;
    },
    forget(key) { hits.delete(key); },
    size() { return hits.size; },
  };
}

module.exports = { sanitizeStrokes, clampText, createRateLimiter, MAX_STROKES, MAX_POINTS, MAX_ANSWER, MAX_PROMPT };
