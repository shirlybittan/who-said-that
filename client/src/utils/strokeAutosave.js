// Crash-safe autosave for in-progress drawings.
//
// Strokes live only in a component ref until the player submits, so a refresh,
// phone-sleep, or disconnect mid-drawing loses everything. We mirror the stroke
// array into localStorage on every change and restore it when the same drawing
// screen remounts. Keys are scoped by room + player + drawing so nothing bleeds
// between rounds/turns or players sharing a device.
//
// All access is wrapped in try/catch — localStorage can throw (quota, private
// mode) and a failed autosave must never break the game.

const PREFIX = 'wst_draw_autosave';

const fullKey = (key) => `${PREFIX}:${key}`;

export const saveStrokes = (key, strokes) => {
  if (!key) return;
  try {
    localStorage.setItem(fullKey(key), JSON.stringify(strokes || []));
  } catch {
    /* quota / unavailable — best effort only */
  }
};

export const loadStrokes = (key) => {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(fullKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const clearStrokes = (key) => {
  if (!key) return;
  try {
    localStorage.removeItem(fullKey(key));
  } catch {
    /* ignore */
  }
};

// Drop every autosave for a room — used when a drawing game ends so stale
// entries don't accumulate across a long party session.
export const clearRoomStrokes = (roomCode) => {
  if (!roomCode) return;
  try {
    const scope = `${PREFIX}:${roomCode}:`;
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(scope)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
};
