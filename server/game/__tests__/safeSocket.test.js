const { hardenSocket, normalizePacket } = require('../safeSocket');

describe('normalizePacket', () => {
  test('missing payload becomes {}', () => {
    expect(normalizePacket(['submit_answer'])).toEqual(['submit_answer', {}]);
  });
  test('null / string / number payloads become {}', () => {
    expect(normalizePacket(['e', null])[1]).toEqual({});
    expect(normalizePacket(['e', 'x'])[1]).toEqual({});
    expect(normalizePacket(['e', 5])[1]).toEqual({});
  });
  test('ack-only packet keeps the ack after an injected payload', () => {
    const ack = () => {};
    const p = normalizePacket(['whats_my_screen', ack]);
    expect(p[1]).toEqual({});
    expect(p[2]).toBe(ack);
  });
  test('object payloads are untouched', () => {
    const payload = { code: 'ABCD' };
    expect(normalizePacket(['e', payload])[1]).toBe(payload);
  });
});

describe('hardenSocket', () => {
  const makeSocket = () => {
    const handlers = {};
    return {
      id: 's1',
      handlers,
      use: jest.fn(),
      on(event, fn) { handlers[event] = fn; },
    };
  };
  const log = { error: jest.fn() };

  test('a throwing handler is caught and logged', () => {
    const s = hardenSocket(makeSocket(), log);
    s.on('boom', ({ code }) => code.toUpperCase());
    expect(() => s.handlers.boom({})).not.toThrow();
    expect(log.error).toHaveBeenCalledWith('socket handler threw', expect.objectContaining({ event: 'boom' }));
  });

  test('normal handlers still receive their args and return value', () => {
    const s = hardenSocket(makeSocket(), log);
    s.on('ok', (data, ack) => { ack(data.code); return 1; });
    const ack = jest.fn();
    expect(s.handlers.ok({ code: 'X' }, ack)).toBe(1);
    expect(ack).toHaveBeenCalledWith('X');
  });
});
