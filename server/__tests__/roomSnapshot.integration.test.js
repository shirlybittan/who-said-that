// End-to-end guard for the "Maximum call stack size exceeded" popup.
//
// The room held raw setTimeout handles (_introTimer during the intro's
// "3…2…1" countdown, _hostGraceTimer while the host is offline). Those handles
// are circular, so any room snapshot sent while one was live made socket.io's
// emit recurse until the stack overflowed, and the phone showed the message.
//
// These tests boot the real server and replay every way a snapshot is sent
// (join, rejoin, resync) while each timer is live, and check that no
// server-internal "_" field ever reaches a client.

const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

jest.setTimeout(30000);

const PORT = 40000 + Math.floor(Math.random() * 20000);
const URL = `http://localhost:${PORT}`;
let server;
const sockets = [];

beforeAll(() => new Promise((resolve, reject) => {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      LOG_LEVEL: 'info',
      WST_DATA_DIR: path.join(os.tmpdir(), `wst-jest-e2e-${process.pid}`),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const timer = setTimeout(() => reject(new Error('server did not start')), 15000);
  server.stdout.on('data', (d) => {
    if (String(d).includes('server running')) { clearTimeout(timer); resolve(); }
  });
  server.on('exit', (c) => { clearTimeout(timer); reject(new Error(`server exited (${c})`)); });
}));

afterEach(() => { sockets.splice(0).forEach(s => s.close()); });

afterAll(() => {
  if (server) { server.removeAllListeners('exit'); server.kill(); }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const connect = () => {
  const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
  s.errors = [];
  s.on('error', (d) => s.errors.push(d && d.message));
  sockets.push(s);
  return s;
};

// Wait for `event`; a server 'error' while waiting fails with its message
// (that's where "Maximum call stack size exceeded" used to arrive).
const once = (s, event, { ms = 5000, where = () => true } = {}) => new Promise((resolve, reject) => {
  const done = () => { clearTimeout(timer); s.off(event, h); s.off('error', onError); };
  const timer = setTimeout(() => { done(); reject(new Error(`timeout waiting for '${event}'`)); }, ms);
  const h = (d) => { if (!where(d)) return; done(); resolve(d); };
  const onError = (d) => { done(); reject(new Error(`server error while waiting for '${event}': ${d && d.message}`)); };
  s.on(event, h);
  s.on('error', onError);
});

// Every key path starting with "_" anywhere in a payload.
const internalKeys = (value, at = '') => {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(k.startsWith('_') ? [`${at}.${k}`] : []),
    ...internalKeys(v, `${at}.${k}`),
  ]);
};

const expectCleanJoin = (socket, joinSuccess) => {
  expect(socket.errors).toEqual([]);
  expect(joinSuccess.room).toBeTruthy();
  expect(internalKeys(joinSuccess.room)).toEqual([]);
};

// TV host + three phones in the lobby of a Who Said That room.
async function lobby() {
  const host = connect();
  host.emit('create_room', { playerName: 'TV', gameType: 'who-said-that' });
  const { code } = await once(host, 'room_created');
  const players = [];
  for (const name of ['A', 'B', 'C']) {
    const s = connect();
    s.emit('join_room', { code, playerName: name });
    const js = await once(s, 'join_success');
    players.push({ socket: s, id: js.playerId, name });
  }
  return { host, code, players };
}

// Start a game and get everyone ready, so the intro countdown is running.
async function intoCountdown({ host, code, players }) {
  host.emit('start_game', { code, rounds: 3 });
  await once(players[0].socket, 'game:intro');
  const counting = once(players[0].socket, 'intro:update', { where: d => d.countdown != null });
  players.forEach(p => p.socket.emit('intro:ready', { code }));
  await counting;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('room snapshots during the intro countdown', () => {
  test('a phone rejoining mid-countdown gets the room, not a stack overflow', async () => {
    const room = await lobby();
    await intoCountdown(room);
    const b = room.players[1];
    const rejoined = once(b.socket, 'join_success');
    b.socket.emit('join_room', { code: room.code, playerName: b.name, playerId: b.id });
    expectCleanJoin(b.socket, await rejoined);
  });

  test('a new player joining mid-countdown gets the room', async () => {
    const room = await lobby();
    await intoCountdown(room);
    const late = connect();
    const joined = once(late, 'join_success');
    late.emit('join_room', { code: room.code, playerName: 'D' });
    expectCleanJoin(late, await joined);
  });

  test('a resync mid-countdown answers with the room', async () => {
    const room = await lobby();
    await intoCountdown(room);
    const a = room.players[0];
    const resynced = once(a.socket, 'join_success');
    a.socket.emit('request_resync', { code: room.code });
    expectCleanJoin(a.socket, await resynced);
  });

  test('the game still starts after the countdown', async () => {
    const room = await lobby();
    await intoCountdown(room);
    const late = connect();
    late.emit('join_room', { code: room.code, playerName: 'D' });
    await once(late, 'join_success');
    await once(room.players[0].socket, 'game_started');
  });
});

describe('room snapshots while the host is offline', () => {
  test('a player joining during the host grace period gets the room', async () => {
    const room = await lobby();
    const gone = once(room.players[0].socket, 'player_disconnected');
    room.host.close();
    await gone; // host grace timer is now running
    const late = connect();
    const joined = once(late, 'join_success');
    late.emit('join_room', { code: room.code, playerName: 'D' });
    expectCleanJoin(late, await joined);
  });
});
