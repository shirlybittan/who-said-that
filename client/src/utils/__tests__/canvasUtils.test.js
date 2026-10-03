import { describe, it, expect } from 'vitest';
import { fitStrokes, MAX_STROKE_POINTS } from '../canvasUtils';

const line = (n) => ({ color: '#000', width: 4, type: 'pen', points: Array.from({ length: n }, (_, i) => ({ x: i, y: i * 2 })) });

describe('fitStrokes (P2-25)', () => {
  it('leaves strokes within the cap untouched', () => {
    const s = line(MAX_STROKE_POINTS);
    expect(fitStrokes([s])[0]).toBe(s);
  });

  it('resamples a long stroke to the cap, keeping both ends', () => {
    const [out] = fitStrokes([line(1000)]);
    expect(out.points).toHaveLength(MAX_STROKE_POINTS);
    expect(out.points[0]).toEqual({ x: 0, y: 0 });
    expect(out.points.at(-1)).toEqual({ x: 999, y: 1998 });
    expect(out.color).toBe('#000');
  });

  it('does not change the original strokes', () => {
    const s = line(500);
    fitStrokes([s]);
    expect(s.points).toHaveLength(500);
  });
});
