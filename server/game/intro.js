// Pre-game intro gate: every game starts with an intro screen (title, rules,
// who's ready, "starting in 3…2…1") — by default, for every game and every
// playlist item, without per-game code (AUDIT.md §6.1 "Pre-game intro", P2-19).
//
// How: a socket middleware intercepts every game-start event (see registry
// START_EVENTS). Instead of starting, the room enters phase 'intro' and the
// start request is parked in room.intro. Players tap "I'm ready"; when every
// active player is ready (or the host presses "Start now") a 3s countdown runs
// and the parked request is replayed to the original start handler with
// { __introDone: true }, which the middleware lets through.
//
// Product decision (Q7): everyone taps ready, with a host override.

const { START_EVENTS } = require('./registry');
const { getActivePlayers, admitLateJoiners } = require('./players');
const { requireMinPlayers } = require('./rules');

const COUNTDOWN_SECS = 3;

function gameTypeFor(event, payload, room) {
  switch (event) {
    case 'mlt:start': return 'most-likely-to';
    case 'draw:start': return 'drawing';
    case 'fitb:start': return 'fill-in-the-blank';
    case 'selfie:start': return 'selfie-roast';
    case 'caption:start': return 'caption';
    case 'photovote:start': return payload?.subType === 'photoassoc' ? 'photoassoc' : 'pmatch';
    case 'pmatch:start': return 'pmatch';
    case 'dt:start': return 'draw-telephone';
    default: return room.gameType; // start_game: WST / Situational / ToT / Mixed
  }
}

function introPayload(room) {
  const intro = room.intro || {};
  return {
    gameType: intro.gameType,
    gameName: room.gameName || '',
    players: getActivePlayers(room).map(p => ({ id: p.id, name: p.name, color: p.color })),
    readyIds: Object.keys(intro.ready || {}),
    countdown: intro.countdownEndsAt ? Math.max(0, Math.ceil((intro.countdownEndsAt - Date.now()) / 1000)) : null,
  };
}

function createIntro({ io, getRoom, findPlayer, log }) {
  const hostSocketOf = (room) => {
    const host = room.players.find(p => p.isHost);
    if (!host) return null;
    for (const sid of [host.tvSocketId, host.socketId, host.phoneSocketId]) {
      const s = sid && io.sockets.sockets.get(sid);
      if (s) return s;
    }
    return null;
  };

  function launch(room) {
    const intro = room.intro;
    if (!intro || room.phase !== 'intro') return;
    const socket = hostSocketOf(room);
    if (!socket) {
      // Host is momentarily offline: stay in the intro; ready-up / Start now retries.
      intro.countdownEndsAt = null;
      io.to(room.code).emit('intro:update', introPayload(room));
      return;
    }
    room.intro = null;
    const payload = { ...intro.payload, __introDone: true };
    socket.listeners(intro.event).forEach(fn => fn(payload));
    if (room.phase === 'intro') {
      // The start handler refused (e.g. players left during the countdown).
      room.phase = 'lobby';
      io.to(room.code).emit('intro:cancelled', {});
    }
  }

  function beginCountdown(room) {
    const intro = room.intro;
    if (!intro || room.phase !== 'intro' || intro.countdownEndsAt) return;
    intro.countdownEndsAt = Date.now() + COUNTDOWN_SECS * 1000;
    io.to(room.code).emit('intro:update', introPayload(room));
    if (room._introTimer) clearTimeout(room._introTimer);
    room._introTimer = setTimeout(() => { room._introTimer = null; launch(room); }, COUNTDOWN_SECS * 1000);
  }

  /** Everyone expected is ready → count down. Also called on disconnects. */
  function checkReady(room) {
    if (!room || room.phase !== 'intro' || !room.intro) return;
    const players = getActivePlayers(room);
    if (players.length > 0 && players.every(p => room.intro.ready[p.id])) beginCountdown(room);
  }

  /** socket.use middleware: park game starts behind the intro. */
  function gate(socket) {
    return (packet, next) => {
      const [event, payload] = packet;
      if (!START_EVENTS.has(event) || payload?.__introDone) return next();
      const room = getRoom(payload?.code);
      const player = room && findPlayer(room, socket.id);
      if (!room || !player || !player.isHost) return next(); // the handler rejects it
      admitLateJoiners(io, room);
      if (!requireMinPlayers(socket, room, gameTypeFor(event, payload, room))) return undefined;
      if (room._introTimer) { clearTimeout(room._introTimer); room._introTimer = null; }
      room.phase = 'intro';
      room.intro = { gameType: gameTypeFor(event, payload, room), event, payload: { ...payload }, ready: {}, countdownEndsAt: null };
      io.to(room.code).emit('game:intro', introPayload(room));
      log.debug('intro: parked game start', { code: room.code, event });
      return undefined; // swallow: replayed by launch()
    };
  }

  function register(socket) {
    socket.use(gate(socket));

    socket.on('intro:ready', ({ code }) => {
      const room = getRoom(code);
      if (!room || room.phase !== 'intro' || !room.intro) return;
      const player = findPlayer(room, socket.id);
      if (!player || !player.isPlaying) return;
      room.intro.ready[player.id] = true;
      io.to(room.code).emit('intro:update', introPayload(room));
      checkReady(room);
    });

    socket.on('intro:start_now', ({ code }) => {
      const room = getRoom(code);
      if (!room || room.phase !== 'intro') return;
      const player = findPlayer(room, socket.id);
      if (!player || !player.isHost) return;
      beginCountdown(room);
    });
  }

  return { register, checkReady, introPayload };
}

module.exports = { createIntro, gameTypeFor, COUNTDOWN_SECS };
