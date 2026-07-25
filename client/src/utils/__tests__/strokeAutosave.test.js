import { describe, it, expect, beforeEach } from 'vitest';
import { saveStrokes, loadStrokes, clearStrokes, clearRoomStrokes } from '../strokeAutosave';

const stroke = (id) => ({ color: '#000', width: 6, type: 'pen', points: [{ x: id, y: id }] });

describe('strokeAutosave', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips strokes through save/load', () => {
    const key = 'ROOM:me:draw:1';
    saveStrokes(key, [stroke(1), stroke(2)]);
    const loaded = loadStrokes(key);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].points[0]).toEqual({ x: 1, y: 1 });
  });

  it('returns null for a missing key', () => {
    expect(loadStrokes('ROOM:me:draw:99')).toBeNull();
  });

  it('is a no-op for empty keys (never throws)', () => {
    expect(() => saveStrokes(null, [stroke(1)])).not.toThrow();
    expect(loadStrokes(null)).toBeNull();
    expect(() => clearStrokes(undefined)).not.toThrow();
  });

  it('clears a single entry', () => {
    const key = 'ROOM:me:draw:1';
    saveStrokes(key, [stroke(1)]);
    clearStrokes(key);
    expect(loadStrokes(key)).toBeNull();
  });

  it('clearRoomStrokes drops only the target room, keeping others', () => {
    saveStrokes('ROOMA:me:draw:1', [stroke(1)]);
    saveStrokes('ROOMA:me:dt:p1', [stroke(2)]);
    saveStrokes('ROOMB:me:draw:1', [stroke(3)]);
    clearRoomStrokes('ROOMA');
    expect(loadStrokes('ROOMA:me:draw:1')).toBeNull();
    expect(loadStrokes('ROOMA:me:dt:p1')).toBeNull();
    expect(loadStrokes('ROOMB:me:draw:1')).toHaveLength(1);
  });

  it('guards against corrupted (non-array) data', () => {
    localStorage.setItem('wst_draw_autosave:ROOM:me:draw:1', '{"not":"an array"}');
    expect(loadStrokes('ROOM:me:draw:1')).toBeNull();
  });
});
