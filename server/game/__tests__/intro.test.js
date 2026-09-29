const { createIntro } = require('../intro');

function setup() {
  const emitted = [];
  const handler = jest.fn();
  const hostSocket = { id: 'h', listeners: () => [handler], emit: jest.fn(), use: jest.fn(), on: jest.fn() };
  const io = { to: () => ({ emit: (e, d) => emitted.push([e, d]) }), sockets: { sockets: new Map([['h', hostSocket]]) } };
  const room = {
    code: 'R', phase: 'lobby', gameType: 'who-said-that',
    players: [
      { id: 'host', isHost: true, isPlaying: false, isConnected: true, socketId: 'h' },
      { id: 'a', isPlaying: true, isConnected: true, socketId: 'sa' },
      { id: 'b', isPlaying: true, isConnected: true, socketId: 'sb' },
      { id: 'c', isPlaying: true, isConnected: true, socketId: 'sc' },
    ],
  };
  const findPlayer = (r, sid) => r.players.find(p => p.socketId === sid);
  const intro = createIntro({ io, getRoom: () => room, findPlayer, log: { debug() {} } });
  // grab the middleware and the handlers registered on a socket
  const handlers = {};
  let middleware;
  intro.register({ id: 'h', use: (fn) => { middleware = fn; }, on: (e, fn) => { handlers[e] = fn; }, emit: jest.fn() });
  return { room, emitted, handler, middleware, handlers, intro, hostSocket };
}

describe('intro gate', () => {
  afterEach(() => jest.useRealTimers());

  test('a game start is parked behind the intro, then replayed once everyone is ready', () => {
    jest.useFakeTimers();
    const { room, emitted, handler, middleware, intro } = setup();
    const next = jest.fn();
    middleware(['start_game', { code: 'R', rounds: 5 }], next);
    expect(next).not.toHaveBeenCalled();
    expect(room.phase).toBe('intro');
    expect(emitted.find(([e]) => e === 'game:intro')[1].gameType).toBe('who-said-that');
    for (const id of ['a', 'b', 'c']) room.intro.ready[id] = true;
    intro.checkReady(room);
    jest.advanceTimersByTime(3000);
    expect(handler).toHaveBeenCalledWith({ code: 'R', rounds: 5, __introDone: true });
  });

  test('replayed starts pass straight through the gate', () => {
    const { middleware } = setup();
    const next = jest.fn();
    middleware(['mlt:start', { code: 'R', __introDone: true }], next);
    expect(next).toHaveBeenCalled();
  });
});
