const { HOST_GRACE_MS, issueHostKey, bindDisplay, noteHostOffline, resolveHost, withoutSecrets } = require('../hostIdentity');

const tvRoom = () => {
  const room = {
    code: 'R',
    players: [
      { id: 'tv', isHost: true, isDisplay: true, isPlaying: false, isConnected: true, socketId: 's-tv' },
      { id: 'a', isPlaying: true, isConnected: true, socketId: 's-a' },
      { id: 'b', isPlaying: true, isConnected: true, socketId: 's-b' },
    ],
  };
  issueHostKey(room, 'tv');
  return room;
};

describe('hostIdentity', () => {
  test('only a screen with the host key can control; others are view-only', () => {
    const room = tvRoom();
    expect(bindDisplay(room, 's-x', 'wrong').canControl).toBe(false);
    expect(room.players[0].socketId).toBe('s-tv');
    expect(bindDisplay(room, 's-tv2', room.hostKey).canControl).toBe(true);
    expect(room.players[0].socketId).toBe('s-tv2');
  });

  test('host keeps the role during the grace period, then a playing player takes over', () => {
    const room = tvRoom();
    room.players[0].isConnected = false;
    noteHostOffline(room, 1000);
    expect(resolveHost(room, 1000 + HOST_GRACE_MS - 1)).toBeNull();
    const next = resolveHost(room, 1000 + HOST_GRACE_MS + 1);
    expect(next.id).toBe('a');
    expect(room.players.filter(p => p.isHost).map(p => p.id)).toEqual(['a']);
  });

  test('the owner reclaims host when their TV comes back with the key', () => {
    const room = tvRoom();
    room.players[0].isConnected = false;
    noteHostOffline(room, 0);
    resolveHost(room, HOST_GRACE_MS + 1);
    const r = bindDisplay(room, 's-tv3', room.hostKey);
    expect(r.hostChanged).toBe(true);
    expect(room.players.find(p => p.isHost).id).toBe('tv');
  });

  test('a hostless room gets a host as soon as someone is connected (no deadlock)', () => {
    const room = tvRoom();
    room.players.forEach(p => { p.isConnected = false; p.isHost = false; });
    room.players[2].isConnected = true; // b reconnects first
    expect(resolveHost(room, 0).id).toBe('b');
  });

  test('the key never reaches clients', () => {
    const room = tvRoom();
    expect(withoutSecrets(room).hostKey).toBeUndefined();
    expect(room.hostKey).toBeTruthy();
  });
});
