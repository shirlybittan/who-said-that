const { startPhaseTimer, advanceCurrentPhase, togglePausePhase } = require('../phaseTimer');

const makeIo = () => ({ to: () => ({ emit: jest.fn() }) });

describe('phaseTimer', () => {
  afterEach(() => jest.useRealTimers());

  test('host advance runs the same onExpire as the timer, once', () => {
    jest.useFakeTimers();
    const room = { phase: 'caption', caption: { phase: 'writing' } };
    const onExpire = jest.fn(() => { room.caption.phase = 'voting'; });
    startPhaseTimer(makeIo(), room, 'C', { key: 'k', seconds: 20, phase: 'caption-writing', isActive: () => room.caption.phase === 'writing', onExpire });
    expect(advanceCurrentPhase(room)).toBe(true);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(advanceCurrentPhase(room)).toBe(false);
    jest.advanceTimersByTime(30000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test('expiry advances; pause stops the countdown', () => {
    jest.useFakeTimers();
    const room = { live: true };
    const onExpire = jest.fn(() => { room.live = false; });
    startPhaseTimer(makeIo(), room, 'C', { key: 'v', seconds: 3, phase: 'x', isActive: () => room.live, onExpire });
    expect(togglePausePhase(room)).toBe(true);
    jest.advanceTimersByTime(10000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(togglePausePhase(room)).toBe(false);
    jest.advanceTimersByTime(5000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
