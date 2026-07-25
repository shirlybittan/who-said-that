// Per-room event log — a lightweight, bounded ring buffer that records what each
// player did and what phase the room was in at the time. This is the raw
// material for "replay a game after a bug report and see what happened": a
// per-player timeline you can read straight through.
//
// Deliberately compact and memory-safe:
//   - capped at MAX_EVENTS per room (oldest dropped)
//   - payloads are SUMMARISED, never stored verbatim — a photo data-URL becomes
//     <str:34210>, a stroke array becomes <arr:512>. We never keep base64 blobs
//     or full drawing data in the log.

const MAX_EVENTS = 300;

// code -> { start: epochMs, events: [{ t, dir, event, pid, phase, info }] }
const logs = new Map();

// Reduce an arbitrary payload to a small, human-readable shape: keep scalars and
// short strings, collapse big strings/arrays/objects to a size marker.
const summarize = (data, depth = 0) => {
  if (data == null || typeof data !== 'object') {
    if (typeof data === 'string' && data.length > 60) return `<str:${data.length}>`;
    return data;
  }
  if (Array.isArray(data)) return `<arr:${data.length}>`;
  if (depth > 1) return `<obj:${Object.keys(data).length}>`;
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') out[k] = v.length > 60 ? `<str:${v.length}>` : v;
    else if (Array.isArray(v)) out[k] = `<arr:${v.length}>`;
    else if (v && typeof v === 'object') out[k] = summarize(v, depth + 1);
    else out[k] = v;
  }
  return out;
};

const record = (code, entry) => {
  if (!code) return;
  let log = logs.get(code);
  if (!log) { log = { start: Date.now(), events: [] }; logs.set(code, log); }
  log.events.push({ t: Date.now() - log.start, ...entry });
  if (log.events.length > MAX_EVENTS) {
    log.events.splice(0, log.events.length - MAX_EVENTS);
  }
};

// An event the client sent to the server.
const logInbound = (code, event, pid, phase, data) =>
  record(code, { dir: 'in', event, pid: pid || null, phase: phase || null, info: summarize(data) });

// A server-side lifecycle/system event (connect, disconnect, restore…).
const logSystem = (code, event, pid, phase, info) =>
  record(code, { dir: 'sys', event, pid: pid || null, phase: phase || null, info: info ?? null });

const getLog = (code) => logs.get(code)?.events || [];
const getStart = (code) => logs.get(code)?.start || null;
const clearLog = (code) => { logs.delete(code); };
const activeCodes = () => [...logs.keys()];

module.exports = { logInbound, logSystem, getLog, getStart, clearLog, activeCodes, summarize, MAX_EVENTS };
