const { sanitizeStrokes, clampText, createRateLimiter, MAX_STROKES, MAX_POINTS } = require('../limits');

describe('sanitizeStrokes', () => {
  test('caps stroke count and points-per-stroke', () => {
    const huge = Array.from({ length: MAX_STROKES + 50 }, () => ({
      color: '#111', width: 5, type: 'pen',
      points: Array.from({ length: MAX_POINTS + 100 }, (_, i) => ({ x: i, y: i })),
    }));
    const out = sanitizeStrokes(huge);
    expect(out).toHaveLength(MAX_STROKES);
    expect(out[0].points).toHaveLength(MAX_POINTS);
  });

  test('validates colour, clamps width, coerces type/points', () => {
    const out = sanitizeStrokes([
      { color: 'javascript:alert(1)', width: 999, type: 'hack', points: [{ x: '3.9', y: null }] },
    ]);
    expect(out[0].color).toBe('#000000'); // invalid colour rejected
    expect(out[0].width).toBe(40);        // clamped to max
    expect(out[0].type).toBe('pen');      // unknown type → pen
    expect(out[0].points[0]).toEqual({ x: 4, y: 0 }); // coerced/rounded
  });

  test('non-array input yields an empty array', () => {
    expect(sanitizeStrokes(null)).toEqual([]);
    expect(sanitizeStrokes('nope')).toEqual([]);
  });
});

describe('clampText', () => {
  test('caps length and coerces non-strings', () => {
    expect(clampText('x'.repeat(1000), 10)).toHaveLength(10);
    expect(clampText(null)).toBe('');
    expect(clampText(42, 1)).toBe('4');
  });
});

describe('createRateLimiter', () => {
  test('allows up to max within a window, then blocks', () => {
    const rl = createRateLimiter({ windowMs: 10000, max: 3 });
    expect(rl.allow('s1')).toBe(true);
    expect(rl.allow('s1')).toBe(true);
    expect(rl.allow('s1')).toBe(true);
    expect(rl.allow('s1')).toBe(false); // 4th in the window
    // a different key is independent
    expect(rl.allow('s2')).toBe(true);
  });

  test('forget() clears a key so it can send again', () => {
    const rl = createRateLimiter({ windowMs: 10000, max: 1 });
    expect(rl.allow('s1')).toBe(true);
    expect(rl.allow('s1')).toBe(false);
    rl.forget('s1');
    expect(rl.allow('s1')).toBe(true);
    expect(rl.size()).toBe(1);
  });
});
