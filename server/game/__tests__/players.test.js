const { getActivePlayers } = require('../players');

describe('getActivePlayers', () => {
  test('keeps only connected AND playing players', () => {
    const room = { players: [
      { id: 'a', isConnected: true, isPlaying: true },
      { id: 'b', isConnected: false, isPlaying: true },
      { id: 'c', isConnected: true, isPlaying: false },
      { id: 'd', isConnected: true, isPlaying: true },
    ] };
    expect(getActivePlayers(room).map((p) => p.id)).toEqual(['a', 'd']);
  });

  test('does NOT exclude mid-round joiners (that narrower filter lives at its own call sites)', () => {
    const room = { players: [{ id: 'a', isConnected: true, isPlaying: true, joinedMidRound: true }] };
    expect(getActivePlayers(room)).toHaveLength(1);
  });

  test('is safe on missing / empty rooms', () => {
    expect(getActivePlayers(null)).toEqual([]);
    expect(getActivePlayers({})).toEqual([]);
    expect(getActivePlayers({ players: [] })).toEqual([]);
  });
});
