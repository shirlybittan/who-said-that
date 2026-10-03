import { describe, it, expect } from 'vitest';
import { timerActionFor, roundTimerReducer, initialRoundTimer, isTimerVisible, STALE_AFTER_MS } from '../roundTimer';

const tick = (t, event, data) => roundTimerReducer(t, timerActionFor(event, data));

describe('round timer', () => {
  it('any game tick event feeds the same timer', () => {
    for (const ev of ['phase_timer', 'mlt:timer', 'tot:timer', 'draw:timer', 'fitb:answer_timer', 'selfie:timer', 'dt:turn_timer']) {
      const t = tick(initialRoundTimer, ev, { secondsLeft: 12, total: 30 });
      expect(t).toMatchObject({ secondsLeft: 12, total: 30, source: ev });
    }
    expect(timerActionFor('caption:vote_received', {})).toBeNull();
  });

  it('results and end events clear the timer at once', () => {
    for (const ev of ['tot:results', 'mlt:results', 'round_ended', 'all_votes_in', 'caption:round_results', 'dt:end']) {
      expect(timerActionFor(ev, {})).toEqual({ type: 'ROUND_TIMER_CLEAR' });
    }
  });

  it('infers the total from the first tick when the server does not send one', () => {
    let t = tick(initialRoundTimer, 'mlt:timer', { secondsLeft: 30 });
    t = tick(t, 'mlt:timer', { secondsLeft: 29 });
    expect(t.total).toBe(30);
  });

  it('hides a timer that stopped ticking (server cancelled it) but keeps a paused one', () => {
    const t = tick(initialRoundTimer, 'phase_timer', { secondsLeft: 12, total: 30 });
    expect(isTimerVisible(t, t.at + 500)).toBe(true);
    expect(isTimerVisible(t, t.at + STALE_AFTER_MS + 10)).toBe(false);
    const p = roundTimerReducer(t, timerActionFor('mlt:paused'));
    expect(isTimerVisible(p, p.at + 60000)).toBe(true);
  });
});
