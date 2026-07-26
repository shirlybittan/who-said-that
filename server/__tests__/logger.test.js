// Load the logger fresh with specific env (threshold/format are read at require).
const withEnv = (env, fn) => {
  const prev = { LOG_LEVEL: process.env.LOG_LEVEL, LOG_FORMAT: process.env.LOG_FORMAT };
  const set = (k, v) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
  set('LOG_LEVEL', env.LOG_LEVEL);
  set('LOG_FORMAT', env.LOG_FORMAT);
  try {
    jest.isolateModules(() => fn(require('../logger')));
  } finally {
    set('LOG_LEVEL', prev.LOG_LEVEL);
    set('LOG_FORMAT', prev.LOG_FORMAT);
  }
};

describe('logger', () => {
  test('suppresses below-threshold levels (default info hides debug)', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    withEnv({ LOG_LEVEL: 'info' }, (log) => { log.debug('hidden'); log.info('shown'); });
    const out = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toContain('shown');
    expect(out).not.toContain('hidden');
    spy.mockRestore();
  });

  test('LOG_LEVEL=debug shows debug', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    withEnv({ LOG_LEVEL: 'debug' }, (log) => { log.debug('verbose'); });
    expect(spy.mock.calls.map((c) => c[0]).join('\n')).toContain('verbose');
    spy.mockRestore();
  });

  test('LOG_FORMAT=json emits one JSON object per line with level/msg/meta/time', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    withEnv({ LOG_LEVEL: 'debug', LOG_FORMAT: 'json' }, (log) => { log.info('hi', { a: 1 }); });
    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed).toMatchObject({ level: 'info', msg: 'hi', a: 1 });
    expect(typeof parsed.t).toBe('string');
    spy.mockRestore();
  });

  test('reserved fields (t/level/msg) are not clobbered by meta keys', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    withEnv({ LOG_LEVEL: 'debug', LOG_FORMAT: 'json' }, (log) => { log.info('real', { level: 'FAKE', msg: 'FAKE', keep: 1 }); });
    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.level).toBe('info'); // not 'FAKE'
    expect(parsed.msg).toBe('real');   // not 'FAKE'
    expect(parsed.keep).toBe(1);
    spy.mockRestore();
  });

  test('warn/error route to console.warn/error and are never suppressed at info', () => {
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const e = jest.spyOn(console, 'error').mockImplementation(() => {});
    withEnv({ LOG_LEVEL: 'info' }, (log) => { log.warn('w'); log.error('e'); });
    expect(w).toHaveBeenCalled();
    expect(e).toHaveBeenCalled();
    w.mockRestore();
    e.mockRestore();
  });
});
