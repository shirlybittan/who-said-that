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

describe('evictStaleRooms (P2-35)', () => {
  const roomManager = require('../roomManager');
  test('keeps an idle-looking room while a player is connected', () => {
    roomManager.restoreRooms({
      LIVE: { code: 'LIVE', players: [{ id: 'a' }], lastActivityAt: 0 },
      DEAD: { code: 'DEAD', players: [{ id: 'b' }], lastActivityAt: 0 },
    });
    const live = roomManager.getRoom('LIVE');
    live.players[0].isConnected = true;
    live.lastActivityAt = 0;
    roomManager.getRoom('DEAD').lastActivityAt = 0;
    const evicted = roomManager.evictStaleRooms(1000);
    expect(evicted).toContain('DEAD');
    expect(evicted).not.toContain('LIVE');
  });
});
