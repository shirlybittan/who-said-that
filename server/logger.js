// Minimal, dependency-free structured logger.
//
//   LOG_LEVEL   debug | info | warn | error   (default: info)
//   LOG_FORMAT  json → one JSON object per line for log aggregation;
//               otherwise a readable "[level] msg {meta}" line for dev.
//
// Per-event chatter (socket connect/disconnect, each vote/submission) logs at
// debug so it's silent by default; lifecycle events log at info; problems at
// warn/error. This keeps production logs clean and greppable.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
const asJson = process.env.LOG_FORMAT === 'json';

const emit = (level, msg, meta) => {
  if (LEVELS[level] < threshold) return;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (asJson) {
    const extra = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : meta != null ? { detail: meta } : {};
    // Reserved fields spread LAST so a meta key named t/level/msg can't clobber them.
    sink(JSON.stringify({ ...extra, t: new Date().toISOString(), level, msg }));
  } else {
    const tail = meta != null ? ' ' + (typeof meta === 'string' ? meta : JSON.stringify(meta)) : '';
    sink(`[${level}] ${msg}${tail}`);
  }
};

module.exports = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};
