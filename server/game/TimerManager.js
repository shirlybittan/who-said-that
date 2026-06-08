/**
 * TimerManager — a single shared timer implementation for all mini-games.
 *
 * Replaces the four divergent timer patterns that existed previously:
 *   - startAnswerTimer  (WST / Situational) — was setInterval
 *   - startDrawTimer    (Drawing)            — was setInterval
 *   - startTotTimer     (This-or-That)       — was recursive setTimeout
 *   - startMltTimer     (Most Likely To)     — was recursive setTimeout
 *   - startFitbAnswerTimer (Fill in Blank)   — was recursive setTimeout
 *
 * All timers now use the same recursive setTimeout pattern, which gives clean
 * pause/resume semantics without a running interval that needs to be
 * guarded against mid-tick.
 */

/**
 * Creates and starts a game timer.
 *
 * @param {object}   opts
 * @param {object}   opts.io           - Socket.io server instance
 * @param {string}   opts.code         - Room code (emit target)
 * @param {number}   opts.seconds      - Starting countdown in seconds
 * @param {string}   opts.tickEvent    - Socket event emitted on every tick
 * @param {object}   [opts.extraData]  - Extra fields merged into every tick emit
 * @param {Function} opts.isActive     - () => bool — returning false stops the loop
 * @param {Function} opts.onExpire     - Called when secondsLeft reaches 0
 * @param {Function} [opts.onTick]     - (secondsLeft: number) => void — sync room state
 * @param {Function} [opts.onPause]    - () => void — called when pause() is invoked
 * @param {Function} [opts.onResume]   - () => void — called when resume() is invoked
 *
 * @returns {{ pause, resume, cancel, getSecondsLeft, isPaused }}
 */
function create({ io, code, seconds, tickEvent, extraData = {}, isActive, onExpire, onTick, onPause, onResume }) {
  let remaining = seconds;
  let paused = false;
  let cancelled = false;
  let timeoutRef = null;

  const emitTick = () => {
    io.to(code).emit(tickEvent, { secondsLeft: remaining, paused, ...extraData });
  };

  const tick = () => {
    if (cancelled || paused || !isActive()) {
      timeoutRef = null;
      return;
    }

    // Sync room state (e.g. room.mlt.secondsLeft = remaining)
    if (onTick) onTick(remaining);

    // Broadcast to clients
    emitTick();

    if (remaining <= 0) {
      cancelled = true;
      timeoutRef = null;
      onExpire();
      return;
    }

    remaining--;
    timeoutRef = setTimeout(tick, 1000);
  };

  // Kick off immediately
  tick();

  return {
    pause() {
      if (paused || cancelled) return;
      paused = true;
      if (timeoutRef) { clearTimeout(timeoutRef); timeoutRef = null; }
      if (onPause) onPause();
      emitTick(); // broadcast the paused state to clients
    },

    resume() {
      if (!paused || cancelled) return;
      paused = false;
      if (onResume) onResume();
      tick(); // restart loop from current remaining
    },

    cancel() {
      cancelled = true;
      if (timeoutRef) { clearTimeout(timeoutRef); timeoutRef = null; }
    },

    getSecondsLeft() { return remaining; },
    isPaused() { return paused; },
  };
}

/**
 * Cancels all active timers stored in room._timers.
 * Call before starting a new mini-game to prevent timer leaks.
 *
 * Also handles legacy draw-telephone timers that are not yet migrated to
 * this manager (promptTimerRef, drawTimerRef, guessTimerRef, voteTimerRef,
 * and per-chain timerRefs).
 *
 * @param {object} room
 */
function cancelAll(room) {
  // Cancel managed timers
  if (room._timers) {
    for (const timer of Object.values(room._timers)) {
      if (timer && typeof timer.cancel === 'function') timer.cancel();
    }
    room._timers = {};
  }

  // Legacy DT timers — not yet migrated to TimerManager
  if (room.dt?.chains) {
    for (const chain of Object.values(room.dt.chains)) {
      if (chain.timerRef) { clearInterval(chain.timerRef); chain.timerRef = null; }
    }
  }
  if (room.dt?.promptTimerRef) { clearTimeout(room.dt.promptTimerRef); room.dt.promptTimerRef = null; }
  if (room.dt?.drawTimerRef)   { clearTimeout(room.dt.drawTimerRef);   room.dt.drawTimerRef = null; }
  if (room.dt?.guessTimerRef)  { clearTimeout(room.dt.guessTimerRef);  room.dt.guessTimerRef = null; }
  if (room.dt?.voteTimerRef)   { clearTimeout(room.dt.voteTimerRef);   room.dt.voteTimerRef = null; }
}

/**
 * Removes timer references from a room object before sending to clients.
 * JSON.stringify throws "Maximum call stack exceeded" on Node Timeout objects.
 *
 * @param {object} room
 * @returns {object} sanitized room (shallow copy)
 */
function sanitizeForClient(room) {
  // eslint-disable-next-line no-unused-vars
  const { _timers, answerTimerRef, timer, ...rest } = room;

  return {
    ...rest,
    tot:  room.tot  ? { ...room.tot,  timerRef: undefined } : room.tot,
    mlt:  room.mlt  ? { ...room.mlt,  timerRef: undefined } : room.mlt,
    draw: room.draw ? { ...room.draw, timerRef: undefined } : room.draw,
    fitb: room.fitb ? { ...room.fitb, timerRef: undefined, answerTimerRef: undefined } : room.fitb,
    dt: room.dt ? {
      ...room.dt,
      promptTimerRef: undefined,
      drawTimerRef:   undefined,
      guessTimerRef:  undefined,
      voteTimerRef:   undefined,
      chains: Object.fromEntries(
        Object.entries(room.dt.chains || {}).map(([id, chain]) => [id, { ...chain, timerRef: undefined }])
      ),
    } : room.dt,
  };
}

module.exports = { create, cancelAll, sanitizeForClient };
