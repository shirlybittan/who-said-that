const fs = require('fs');
const { serializeRoom, writeNow, loadRooms, FILE } = require('../persistence');
const roomManager = require('../roomManager');

afterAll(() => {
  try { fs.unlinkSync(FILE); } catch (_) { /* ignore */ }
});

describe('serializeRoom', () => {
  const liveRoom = () => ({
    code: 'R1',
    phase: 'drawing',
    scores: { p1: 5 },
    _timers: { draw: { cancel() {} } },
    players: [{ id: 'p1', name: 'A', socketId: 's1', phoneSocketId: 'ph1', isConnected: true }],
    draw: {
      phase: 'drawing',
      word: 'cat',
      submissions: { p1: { strokes: [{ x: 1 }] } },
      timerRef: 123,
      _submissionTracker: { count() { return 1; } },
    },
    mlt: { votes: { p1: 'p2' }, _voteCollector: { castVote() {} } },
  });

  test('drops timers, runtime helpers and live socket bindings but keeps game data', () => {
    const s = serializeRoom(liveRoom());
    expect(s._timers).toBeUndefined();
    expect(s.draw.timerRef).toBeUndefined();
    expect(s.draw._submissionTracker).toBeUndefined();
    expect(s.mlt._voteCollector).toBeUndefined();
    // Real state survives.
    expect(s.draw.word).toBe('cat');
    expect(s.draw.submissions.p1.strokes).toHaveLength(1);
    expect(s.scores.p1).toBe(5);
    expect(s.mlt.votes.p1).toBe('p2');
    // Players come back disconnected with no stale sockets.
    expect(s.players[0].isConnected).toBe(false);
    expect(s.players[0].socketId).toBeNull();
    expect(s.players[0].phoneSocketId).toBeNull();
  });

  test('never mutates the live room', () => {
    const room = liveRoom();
    serializeRoom(room);
    expect(room.players[0].isConnected).toBe(true);
    expect(room.players[0].socketId).toBe('s1');
    expect(room._timers).toBeDefined();
    expect(room.draw._submissionTracker).toBeDefined();
  });

  test('is JSON-safe (no throw, no functions leak through)', () => {
    const json = JSON.stringify(serializeRoom(liveRoom()));
    const back = JSON.parse(json);
    expect(back.draw._submissionTracker).toBeUndefined();
    expect(back.mlt._voteCollector).toBeUndefined();
  });
});

describe('disk round-trip', () => {
  test('write then load recovers the room map', async () => {
    const map = new Map([
      ['R2', { code: 'R2', phase: 'voting', players: [{ id: 'x', socketId: 's', isConnected: true }], scores: { x: 1 } }],
    ]);
    await writeNow(map);
    const loaded = loadRooms();
    expect(loaded.R2).toBeTruthy();
    expect(loaded.R2.scores.x).toBe(1);
    expect(loaded.R2.players[0].isConnected).toBe(false);
  });
});

describe('restart → rejoin', () => {
  test('a restored room lets the original player rejoin by id (no duplicate)', () => {
    const snapshot = {
      TESTX: {
        code: 'TESTX',
        host: 'p1',
        phase: 'question',
        players: [{ id: 'p1', name: 'Ann', color: '#fff', isHost: true, isPlaying: true, isConnected: false, socketId: null }],
        scores: { p1: 3 },
      },
    };
    expect(roomManager.restoreRooms(snapshot)).toBe(1);

    const room = roomManager.getRoom('TESTX');
    expect(room.scores.p1).toBe(3);
    expect(room.players[0].isConnected).toBe(false);

    // The player's socket reconnects to the new process and rejoins by id.
    const res = roomManager.joinRoom('TESTX', 'fresh-socket', 'Ann', 'p1');
    expect(res.isRejoin).toBe(true);
    expect(res.player.isConnected).toBe(true);
    expect(roomManager.getRoom('TESTX').players).toHaveLength(1); // no ghost duplicate
  });
});
