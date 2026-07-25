// Crash-safe room persistence.
//
// All game state lives in an in-process Map, so a server restart/redeploy/crash
// used to destroy every active room. This mirrors the rooms to disk (debounced,
// atomic) and reloads them on boot, so players' sockets auto-reconnect straight
// back into their game — scores, submissions and phase intact — no room
// recreation.
//
// What is intentionally NOT persisted:
//   - live timer handles (Node Timeout objects — not serializable)
//   - runtime helper instances (_submissionTracker / _voteCollector). Their
//     methods don't survive JSON, and a half-serialized object would be truthy
//     and break the handlers' "no tracker → fall back to raw state" path. Dropped
//     so that fallback (threshold-based advance from the persisted vote/answer
//     maps) kicks in after a restart.
//   - live socket bindings (every socket is dead after a restart; players are
//     marked disconnected until they reconnect).
//
// Timers are not auto-restarted: a restored round's countdown is frozen until it
// advances by everyone submitting (handlers count from persisted state) or the
// host pressing next/skip. This keeps restart-recovery simple and safe.
//
// SCALE: all live rooms are serialized into ONE file, rewritten (debounced) on
// each change. That's intentional for the expected ceiling — a single instance
// hosting tens of concurrent party rooms; the whole file is small once photos
// live in cloud storage (see photoUpload/photoStorage). For a large multi-tenant
// deployment (hundreds+ of rooms) this should move to per-room files or an
// external store (Redis) so a single busy room doesn't rewrite everyone's state.

const fs = require('fs');
const path = require('path');
const TimerManager = require('./TimerManager');

const DATA_DIR = path.join(__dirname, '..', '.data');
const FILE = path.join(DATA_DIR, 'rooms.json');
const TMP = `${FILE}.tmp`;

const stripHelpers = (slice) => {
  if (!slice || typeof slice !== 'object') return slice;
  // eslint-disable-next-line no-unused-vars
  const { _submissionTracker, _voteCollector, ...rest } = slice;
  return rest;
};

// Produce a JSON-safe, restart-ready copy of a room. Never mutates the live room.
const serializeRoom = (room) => {
  const base = TimerManager.sanitizeForClient(room); // drops _timers + *timerRef
  return {
    ...base,
    draw: stripHelpers(base.draw),
    sit: stripHelpers(base.sit),
    mlt: stripHelpers(base.mlt),
    fitb: stripHelpers(base.fitb),
    players: (base.players || []).map((p) => ({
      ...p,
      socketId: null,
      phoneSocketId: null,
      tvSocketId: null,
      isConnected: false,
    })),
  };
};

const serializeAll = (roomsMap) => {
  const out = {};
  for (const [code, room] of roomsMap.entries()) {
    try {
      out[code] = serializeRoom(room);
    } catch (_) {
      // A single un-serializable room must not sink the whole save.
    }
  }
  return out;
};

let saveTimer = null;
let saving = false;
let pending = false;

const writeNow = async (roomsMap) => {
  if (saving) { pending = true; return; }
  saving = true;
  try {
    const data = JSON.stringify(serializeAll(roomsMap));
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(TMP, data);
    await fs.promises.rename(TMP, FILE); // atomic swap — never leaves a torn file
  } catch (err) {
    console.error('[persistence] save failed:', err.message);
  } finally {
    saving = false;
    if (pending) { pending = false; writeNow(roomsMap); }
  }
};

// Debounced save — coalesces bursts of mutations into one write.
const scheduleSave = (roomsMap, delay = 1500) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; writeNow(roomsMap); }, delay);
};

// Synchronous one-shot read at boot. Fail-safe: any problem → start fresh.
const loadRooms = () => {
  try {
    if (!fs.existsSync(FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('[persistence] load failed, starting fresh:', err.message);
    return {};
  }
};

module.exports = { serializeRoom, serializeAll, scheduleSave, writeNow, loadRooms, FILE, DATA_DIR };
