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
//   - runtime helper instances (every "_"-prefixed object key: trackers,
//     collectors, phase/round managers). Their methods don't survive JSON, and
//     a half-serialized object would be truthy and break the handlers'
//     "no helper → fall back to raw state" path. Dropped so that fallback (or
//     lazy rehydration, e.g. VotingGameTemplate.rehydrate) kicks in.
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
const log = require('../logger');

// WST_DATA_DIR lets tests (and deployments) point persistence elsewhere so a
// test run never touches the real server/.data/rooms.json.
const DATA_DIR = process.env.WST_DATA_DIR || path.join(__dirname, '..', '.data');
const FILE = path.join(DATA_DIR, 'rooms.json');
const TMP = `${FILE}.tmp`;

// Runtime helpers (trackers, collectors, phase/round managers) live under
// "_"-prefixed keys holding objects. Their methods don't survive JSON: a helper
// saved as {} is restored as a truthy empty object and the next method call
// throws. Strip them all — on the room itself and on every game slice — so the
// handlers' "no helper → fall back to raw state" paths (or lazy rehydration)
// take over after a restart.
const isHelperKey = (key, value) => key.startsWith('_') && value !== null && typeof value === 'object' && !Array.isArray(value);

const stripHelpers = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isHelperKey(key, value)) continue;
    out[key] = value;
  }
  return out;
};

// Strip helpers from the room and one level down (room.draw, room.mlt, …).
const stripRoomHelpers = (room) => {
  const top = stripHelpers(room);
  for (const [key, value] of Object.entries(top)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && key !== 'players') {
      top[key] = stripHelpers(value);
    }
  }
  return top;
};

// Produce a JSON-safe, restart-ready copy of a room. Never mutates the live room.
const serializeRoom = (room) => {
  const base = stripRoomHelpers(TimerManager.sanitizeForClient(room)); // drops _timers + *timerRef + helpers
  return {
    ...base,
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
    } catch (err) {
      // A single un-serializable room must not sink the whole save — but say so.
      log.warn('persistence: room not serializable, skipped', { code, message: err.message });
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
    log.error('persistence: save failed', { message: err.message, stack: err.stack });
  } finally {
    saving = false;
    if (pending) { pending = false; writeNow(roomsMap); }
  }
};

// Debounced save — coalesces bursts of mutations into one write, but never
// waits longer than MAX_WAIT_MS: a busy room used to postpone every save until
// a lull, so a restart rolled it back to a stale state (AUDIT.md P3-18).
const MAX_WAIT_MS = 4000;
let firstPendingAt = 0;
const scheduleSave = (roomsMap, delay = 1500) => {
  const now = Date.now();
  if (!firstPendingAt) firstPendingAt = now;
  if (saveTimer) clearTimeout(saveTimer);
  const wait = Math.max(0, Math.min(delay, MAX_WAIT_MS - (now - firstPendingAt)));
  saveTimer = setTimeout(() => { saveTimer = null; firstPendingAt = 0; writeNow(roomsMap); }, wait);
  // Don't let a pending save keep the process (or a test runner) alive.
  if (saveTimer && typeof saveTimer.unref === 'function') saveTimer.unref();
};

// Synchronous one-shot read at boot. Fail-safe: any problem → start fresh.
const loadRooms = () => {
  try {
    if (!fs.existsSync(FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    log.error('persistence: load failed, starting fresh', { message: err.message, stack: err.stack });
    return {};
  }
};

module.exports = { stripRoomHelpers, serializeRoom, serializeAll, scheduleSave, writeNow, loadRooms, FILE, DATA_DIR };
