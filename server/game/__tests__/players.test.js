const { getActivePlayers, admitLateJoiners } = require('../players');

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

  test('excludes mid-round joiners until they are admitted (P1-07)', () => {
    const room = { players: [{ id: 'a', isConnected: true, isPlaying: true, joinedMidRound: true }] };
    expect(getActivePlayers(room)).toHaveLength(0);
  });

  test('is safe on missing / empty rooms', () => {
    expect(getActivePlayers(null)).toEqual([]);
    expect(getActivePlayers({})).toEqual([]);
    expect(getActivePlayers({ players: [] })).toEqual([]);
  });
});

describe('admitLateJoiners', () => {
  test('clears the flag and notifies each admitted player', () => {
    const emit = jest.fn();
    const io = { to: jest.fn(() => ({ emit })) };
    const room = { players: [
      { id: 'a', isConnected: true, isPlaying: true, socketId: 's-a' },
      { id: 'b', isConnected: true, isPlaying: true, joinedMidRound: true, socketId: 's-b' },
    ] };
    const admitted = admitLateJoiners(io, room);
    expect(admitted.map(p => p.id)).toEqual(['b']);
    expect(getActivePlayers(room)).toHaveLength(2);
    expect(io.to).toHaveBeenCalledWith('s-b');
    expect(emit).toHaveBeenCalledWith('round:admitted', { playerId: 'b' });
  });
});
