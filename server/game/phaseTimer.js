// Timed phases with a single "advance now" escape hatch.
//
// Every phase that waits on players gets a server countdown (AUDIT.md P1-05:
// photo, caption-writing and voting phases used to wait forever for one idle
// player). The host can end the current phase early with one generic event
// (`host:advance`), which runs exactly the same code as the timer expiring —
// so "timer ran out" and "host pressed Continue" can never diverge.

const TimerManager = require('./TimerManager');

const PHOTO_SECS = 60;
const VOTE_SECS = 30;

/**
 * Start (or restart) the countdown for the current phase.
 *
 * @param {object} io
 * @param {object} room
 * @param {string} code
 * @param {object} opts
 * @param {string}   opts.key       - room._timers key (unique per phase kind)
 * @param {number}   opts.seconds
 * @param {string}   opts.phase     - label sent with each phase_timer tick, e.g. 'caption-writing'
 * @param {Function} opts.isActive  - () => bool, false once the phase is over
 * @param {Function} opts.onExpire  - advances the game to the next phase
 */
function startPhaseTimer(io, room, code, { key, seconds, phase, isActive, onExpire }) {
  room._timers = room._timers || {};
  if (room._timers[key]) room._timers[key].cancel();

  const advance = () => {
    if (!isActive()) return false;
    if (room._timers[key]) { room._timers[key].cancel(); room._timers[key] = null; }
    if (room._advance && room._advance.key === key) room._advance = null;
    onExpire();
    return true;
  };

  room._timers[key] = TimerManager.create({
    io,
    code,
    seconds,
    tickEvent: 'phase_timer',
    extraData: { phase, total: seconds },
    isActive,
    onExpire: advance,
  });
  room._advance = { key, phase, isActive, advance };
}

/** Host "Continue": end the running timed phase now. Returns true if it advanced. */
function advanceCurrentPhase(room) {
  const a = room._advance;
  if (!a || !a.isActive()) return false;
  return a.advance();
}

/** Pause / resume the running timed phase. Returns the new paused state, or null. */
function togglePausePhase(room) {
  const a = room._advance;
  const timer = a && a.isActive() ? room._timers?.[a.key] : null;
  if (!timer) return null;
  if (timer.isPaused()) { timer.resume(); return false; }
  timer.pause();
  return true;
}

module.exports = { PHOTO_SECS, VOTE_SECS, startPhaseTimer, advanceCurrentPhase, togglePausePhase };
