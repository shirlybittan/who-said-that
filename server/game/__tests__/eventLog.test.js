const eventLog = require('../eventLog');

describe('eventLog.summarize', () => {
  test('keeps small scalars, collapses big strings/arrays/objects', () => {
    const s = eventLog.summarize({
      code: 'ABCD',
      n: 3,
      ok: true,
      photo: 'x'.repeat(5000),
      strokes: new Array(400),
      nested: { a: 1, b: 'y'.repeat(200) },
    });
    expect(s.code).toBe('ABCD');
    expect(s.n).toBe(3);
    expect(s.ok).toBe(true);
    expect(s.photo).toBe('<str:5000>');    // never store the blob
    expect(s.strokes).toBe('<arr:400>');
    expect(s.nested).toEqual({ a: 1, b: '<str:200>' });
  });

  test('handles null/primitive payloads', () => {
    expect(eventLog.summarize(null)).toBeNull();
    expect(eventLog.summarize('short')).toBe('short');
    expect(eventLog.summarize(42)).toBe(42);
  });
});

describe('eventLog ring buffer', () => {
  const CODE = 'LOGT';
  afterEach(() => eventLog.clearLog(CODE));

  test('records inbound + system events per room with context', () => {
    eventLog.logInbound(CODE, 'submit_answer', 'p1', 'question', { text: 'hi' });
    eventLog.logSystem(CODE, 'disconnect', 'p2', 'question', { name: 'Zoe' });
    const events = eventLog.getLog(CODE);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ dir: 'in', event: 'submit_answer', pid: 'p1', phase: 'question' });
    expect(events[1]).toMatchObject({ dir: 'sys', event: 'disconnect', pid: 'p2' });
    expect(typeof events[0].t).toBe('number');
  });

  test('never records without a room code', () => {
    eventLog.logInbound(null, 'create_room', null, null, {});
    expect(eventLog.getLog('LOGX')).toHaveLength(0);
  });

  test('caps at MAX_EVENTS, dropping the oldest', () => {
    const over = eventLog.MAX_EVENTS + 50;
    for (let i = 0; i < over; i++) eventLog.logInbound(CODE, `e${i}`, 'p1', 'question', {});
    const events = eventLog.getLog(CODE);
    expect(events).toHaveLength(eventLog.MAX_EVENTS);
    // Oldest (e0..e49) dropped; newest retained.
    expect(events[0].event).toBe('e50');
    expect(events[events.length - 1].event).toBe(`e${over - 1}`);
  });

  test('isolates rooms and clears on demand', () => {
    eventLog.logInbound(CODE, 'a', 'p1', 'lobby', {});
    eventLog.logInbound('OTHR', 'b', 'p9', 'lobby', {});
    expect(eventLog.getLog(CODE)).toHaveLength(1);
    expect(eventLog.getLog('OTHR')).toHaveLength(1);
    eventLog.clearLog(CODE);
    expect(eventLog.getLog(CODE)).toHaveLength(0);
    expect(eventLog.getLog('OTHR')).toHaveLength(1);
    eventLog.clearLog('OTHR');
  });
});
