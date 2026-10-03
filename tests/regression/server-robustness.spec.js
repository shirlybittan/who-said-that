// No socket message may take the server down (AUDIT.md P0-01), and host-only
// advance events are guarded (P1-01).
import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';
import { SERVER } from './helpers.js';

const connect = () => new Promise((resolve, reject) => {
  const s = io(SERVER, { transports: ['websocket'], forceNew: true, reconnection: false });
  s.once('connect', () => resolve(s));
  s.once('connect_error', reject);
});
const once = (s, ev, ms = 5000) => new Promise((resolve) => {
  const t = setTimeout(() => resolve('TIMEOUT'), ms);
  s.once(ev, (d) => { clearTimeout(t); resolve(d); });
});

test('malformed payloads never crash the server', async () => {
  const s = await connect();
  const events = ['submit_answer', 'start_game', 'create_room', 'join_room', 'add_custom_question', 'submit_vote',
    'next_answer_request', 'mlt:vote', 'tot:vote', 'draw:submit', 'fitb:answer', 'selfie:submit_photo',
    'caption:start', 'caption:submit_caption', 'photovote:start', 'dt:start', 'change_game', 'kick_player',
    'join_spectator', 'whats_my_screen', 'request_resync', 'set_game_options', 'intro:ready', 'host:advance'];
  for (const e of events) { s.emit(e); s.emit(e, null); s.emit(e, 'x'); s.emit(e, { code: 'ZZZZ', text: 5, gameName: 7 }); }
  await new Promise((r) => setTimeout(r, 1000));
  s.close();
  const again = await connect(); // still accepting connections
  expect(again.connected).toBe(true);
  again.close();
});

test('a non-host cannot advance, and a double advance only moves once', async () => {
  const tv = await connect();
  tv.emit('create_room', { playerName: 'Screen Cast', gameType: 'who-said-that', hostIsPlaying: false });
  const { code } = await once(tv, 'room_created');
  const players = [];
  for (const name of ['A', 'B', 'C']) {
    const s = await connect();
    s.emit('join_room', { code, playerName: name, playerId: null });
    const j = await once(s, 'join_success');
    players.push({ s, id: j.playerId });
  }
  const intro = once(tv, 'game:intro');
  tv.emit('start_game', { code, rounds: 3 });
  await intro;
  const q = once(tv, 'new_question');
  tv.emit('intro:start_now', { code });
  await q;
  const voting = once(tv, 'voting_started', 10000);
  players.forEach((p, i) => p.s.emit('submit_answer', { code, text: `answer ${i}` }));
  await voting;
  const advances = [];
  tv.on('next_answer', () => advances.push('next'));
  players[0].s.emit('next_answer_request', { code, answerIndex: 0 }); // not the host
  tv.emit('next_answer_request', { code, answerIndex: 0 });
  tv.emit('next_answer_request', { code, answerIndex: 0 }); // double click
  await new Promise((r) => setTimeout(r, 1000));
  expect(advances).toEqual(['next']);
  [tv, ...players.map((p) => p.s)].forEach((s) => s.close());
});
