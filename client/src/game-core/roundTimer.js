// One round timer for every game (AUDIT.md §6.1 "Timer", P2-12, P2-13).
//
// The server drives every countdown, but each game emitted its own tick event
// and each page drew its own timer (five styles). All tick events now feed ONE
// store slice (`roundTimer`) through useSocket's onAny hook, and the app shell
// renders ONE <GameTimer/>. A game therefore gets the canonical timer by
// default just by using the server's TimerManager.

// Tick events: { secondsLeft, total?, paused? }
export const TIMER_TICK_EVENTS = new Set([
  'phase_timer', 'mlt:timer', 'tot:timer', 'draw:timer', 'fitb:answer_timer', 'selfie:timer', 'dt:turn_timer',
]);

// Pause / resume notifications that don't carry a tick.
export const TIMER_PAUSE_EVENTS = {
  'mlt:paused': true, 'tot:paused': true, 'selfie:paused': true, 'dt:paused': true,
  'mlt:resumed': false, 'tot:resumed': false, 'selfie:resumed': false, 'dt:resumed': false,
};

// A timer that hasn't ticked for this long is over (the server cancelled it
// without a final 0 tick — e.g. everyone voted early) unless it is paused.
export const STALE_AFTER_MS = 2500;

// Results / end events: the countdown is over even if its last tick wasn't 0.
const TIMER_STOP_EVENTS = /(:results$|round_results|round_ended|all_votes_in|game_over|game_ended|:end$|intro:update|game:intro)/;

/** Store action for an incoming socket event, or null when it isn't timer-related. */
export function timerActionFor(event, data) {
  if (TIMER_STOP_EVENTS.test(event)) return { type: 'ROUND_TIMER_CLEAR' };
  if (TIMER_TICK_EVENTS.has(event)) {
    const secondsLeft = Math.max(0, Number(data?.secondsLeft) || 0);
    return { type: 'ROUND_TIMER_TICK', payload: { secondsLeft, total: Number(data?.total) || null, paused: !!data?.paused, source: event } };
  }
  if (event === 'phase_paused') return { type: 'ROUND_TIMER_PAUSED', payload: !!data?.paused };
  if (Object.prototype.hasOwnProperty.call(TIMER_PAUSE_EVENTS, event)) {
    return { type: 'ROUND_TIMER_PAUSED', payload: TIMER_PAUSE_EVENTS[event] };
  }
  return null;
}

export const initialRoundTimer = { secondsLeft: 0, total: 0, paused: false, source: null, at: 0 };

/** Reducer cases for the roundTimer slice. */
export function roundTimerReducer(timer = initialRoundTimer, action) {
  switch (action.type) {
    case 'ROUND_TIMER_TICK': {
      const { secondsLeft, total, paused, source } = action.payload;
      // Without an explicit total, the first tick of a new countdown is the total.
      const isNewCountdown = source !== timer.source || secondsLeft > timer.secondsLeft;
      const inferredTotal = total || (isNewCountdown ? secondsLeft : timer.total) || secondsLeft;
      return { secondsLeft, total: Math.max(inferredTotal, secondsLeft), paused, source, at: Date.now() };
    }
    case 'ROUND_TIMER_PAUSED':
      return { ...timer, paused: action.payload, at: Date.now() };
    case 'ROUND_TIMER_CLEAR':
      return initialRoundTimer;
    default:
      return timer;
  }
}

/** Is the timer currently worth showing? */
export function isTimerVisible(timer, now = Date.now()) {
  if (!timer || !timer.at) return false;
  if (timer.paused) return timer.secondsLeft > 0;
  return timer.secondsLeft > 0 && now - timer.at < STALE_AFTER_MS;
}
