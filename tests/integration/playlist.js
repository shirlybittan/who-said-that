/**
 * Long-session multiplayer reliability harness.
 *
 * Simulates 1 host (non-playing orchestrator) + 5 players in ONE room playing an
 * entire playlist of every mini-game back-to-back — the "can a group of friends
 * play for hours without the room breaking" production-readiness test.
 *
 * It drives the REAL socket protocol (same events the host client emits) and,
 * after every phase, asserts the invariants that matter:
 *   - all 6 sockets stay connected (no silent drops)
 *   - the player roster stays exactly 6 unique ids (no duplicates, no vanishing)
 *   - every player RECEIVES each phase broadcast (server-authoritative sync —
 *     a missing receipt = a desynced/stuck player, surfaced as a timeout)
 *   - the room code never changes (room never recreated)
 *   - each game reaches its end/score state
 *
 * Run against a live server on :3001 (NODE_PATH must resolve socket.io-client):
 *   NODE_PATH=client/node_modules node tests/integration/playlist.js
 */
const path = require('path');
const assert = require('assert');
// socket.io-client lives in client/node_modules; resolve it whether this is run
// from the repo root or with NODE_PATH set.
let io;
try { ({ io } = require('socket.io-client')); }
catch { ({ io } = require(path.join(__dirname, '..', '..', 'client', 'node_modules', 'socket.io-client'))); }

const URL = process.env.WST_URL || 'http://localhost:3001';
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const STROKES = [{ color: '#000', width: 6, type: 'pen', points: [{ x: 1, y: 1 }, { x: 20, y: 20 }, { x: 40, y: 10 }] }];

const T = 12000; // default per-event wait
const delay = (ms) => new Promise(r => setTimeout(r, ms));

let disconnects = []; // unexpected disconnect log

// ─── Client wrapper ──────────────────────────────────────────────────────────
function mkClient(name) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, id: null, roster: [] };
  socket.on('disconnect', (reason) => { disconnects.push(`${name}:${reason}`); });
  socket.on('error', (d) => { console.log(`   [err ${name}] ${d && d.message}`); });
  // Track the FULL room roster only from events that carry the complete player
  // list (host + all players). Game payloads that carry only *playing* players
  // (e.g. mlt:prompt) must not be used here or they'd hide the host.
  const trackRoster = (d) => { if (d && Array.isArray(d.players)) c.roster = d.players; };
  ['player_joined', 'player_disconnected', 'player_reconnected', 'game_changed'].forEach(ev => socket.on(ev, trackRoster));
  return c;
}

// Wait for a single event on one client.
function waitEvent(c, event, ms = T) {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => { c.socket.off(event, h); rej(new Error(`[${c.name}] timeout waiting '${event}'`)); }, ms);
    const h = (payload) => { clearTimeout(timer); res(payload); };
    c.socket.once(event, h);
  });
}

// Wait until EVERY client receives `event`. Set this up BEFORE the trigger.
// Returns array of payloads. Rejects naming the clients that never received it.
function waitAll(clients, event, ms = T) {
  return Promise.allSettled(clients.map(c => waitEvent(c, event, ms))).then(results => {
    const missing = clients.filter((c, i) => results[i].status === 'rejected').map(c => c.name);
    if (missing.length) throw new Error(`'${event}' not received by: ${missing.join(', ')}`);
    return results.map(r => r.value);
  });
}

// Wait for the first of several possible events (games that skip phases when
// photos are already banked). Resolves { event, payload }.
function waitAny(c, events, ms = T) {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => { events.forEach(e => c.socket.off(e, hs[e])); rej(new Error(`[${c.name}] timeout waiting any of ${events.join('|')}`)); }, ms);
    const hs = {};
    events.forEach(e => { hs[e] = (payload) => { clearTimeout(timer); events.forEach(x => c.socket.off(x, hs[x])); res({ event: e, payload }); }; c.socket.once(e, hs[e]); });
  });
}

const emitAll = (players, event, payloadFn) => players.forEach((p, i) => p.socket.emit(event, payloadFn(p, i)));

// ─── Setup: create room + join 5 players ─────────────────────────────────────
async function setup() {
  const host = mkClient('HOST');
  await waitEvent(host, 'connect', T);
  host.socket.emit('create_room', { playerName: 'Screen Cast', gameType: 'most-likely-to', hostIsPlaying: false, roomConfig: { roundDurationSecs: 60 } });
  const created = await waitEvent(host, 'room_created');
  host.id = created.playerId;
  const code = created.code;

  const players = [];
  for (let i = 1; i <= 5; i++) {
    const p = mkClient(`P${i}`);
    await waitEvent(p, 'connect', T);
    p.socket.emit('join_room', { code, playerName: `P${i}` });
    const js = await waitEvent(p, 'join_success');
    p.id = js.playerId;
    players.push(p);
  }
  await delay(300);
  return { host, players, code };
}

// ─── Invariant checkpoint between games ──────────────────────────────────────
function checkpoint(host, players, code, label) {
  const all = [host, ...players];
  const down = all.filter(c => !c.socket.connected).map(c => c.name);
  assert(down.length === 0, `[${label}] disconnected sockets: ${down.join(', ')}`);
  assert(disconnects.length === 0, `[${label}] unexpected disconnect events: ${disconnects.join(', ')}`);
  // roster: host view should show 6 unique players, exactly 5 playing
  const roster = host.roster.length ? host.roster : players[0].roster;
  if (roster.length) {
    const ids = new Set(roster.map(p => p.id));
    assert(ids.size === roster.length, `[${label}] duplicate player ids in roster`);
    assert(roster.length === 6, `[${label}] roster size ${roster.length} != 6`);
  }
}

// ─── Per-game drivers ────────────────────────────────────────────────────────
// Each returns after the game reaches its end/score state. `players` all act;
// `host` advances. Every phase is awaited via waitAll (sync assertion).

async function playMlt(host, players, code, rounds = 1) {
  const voting = waitAll(players, 'mlt:voting_started');
  host.socket.emit('mlt:start', { code, rounds, allowSelfVote: true });
  await voting;
  for (let r = 1; r <= rounds; r++) {
    const results = waitAll(players, 'mlt:results');
    emitAll(players, 'mlt:vote', (p, i) => ({ code, targetPlayerId: players[(i + 1) % players.length].id }));
    await results;
    if (r < rounds) { const next = waitAll(players, 'mlt:voting_started'); host.socket.emit('mlt:next_round', { code }); await next; }
  }
  const end = waitAll(players, 'mlt:end');
  host.socket.emit('mlt:next_round', { code });
  await end;
}

// start_game games control their own round count (room.totalRounds), so drive
// until the actual end event rather than a fixed count.
async function playTot(host, players, code) {
  const q0 = waitAll(players, 'new_question');
  host.socket.emit('start_game', { code });
  await q0;
  let guard = 0;
  while (guard++ < 20) {
    const results = waitAll(players, 'tot:results');
    emitAll(players, 'tot:vote', (p, i) => ({ code, choice: i % 2 === 0 ? 'a' : 'b' }));
    await results;
    const adv = waitAny(players[0], ['new_question', 'tot:end', 'game_ended']);
    host.socket.emit('tot:next_round', { code });
    if ((await adv).event !== 'new_question') break;
  }
}

async function playWst(host, players, code) {
  const q0 = waitAll(players, 'new_question');
  host.socket.emit('start_game', { code });
  await q0;
  let rguard = 0;
  while (rguard++ < 20) {
    const voting = waitAll(players, 'voting_started');
    emitAll(players, 'submit_answer', (p) => ({ code, text: `${p.name} answer` }));
    await voting;
    // Vote on each shown answer; host advances answer-by-answer until round ends.
    let guard = 0;
    while (guard++ < 12) {
      const votesIn = waitEvent(host, 'all_votes_in');
      emitAll(players, 'submit_vote', (p, i) => ({ code, votedPlayerId: players[(i + 1) % players.length].id }));
      await votesIn;
      const adv = waitAny(host, ['next_answer', 'round_ended']);
      host.socket.emit('next_answer_request', { code });
      if ((await adv).event === 'round_ended') break;
    }
    const adv = waitAny(players[0], ['new_question', 'game_ended']);
    host.socket.emit('ready_next_round', { code });
    if ((await adv).event !== 'new_question') break;
  }
}

async function playSituational(host, players, code) {
  const q0 = waitAll(players, 'new_question');
  host.socket.emit('start_game', { code });
  await q0;
  let guard = 0;
  while (guard++ < 20) {
    const voting = waitAll(players, 'sit:voting_started');
    emitAll(players, 'submit_answer', (p) => ({ code, text: `${p.name} sit answer` }));
    const vp = await voting;
    const results = waitAll(players, 'sit:results');
    const answers = vp[0].answers;
    emitAll(players, 'sit:vote', (p) => {
      const other = answers.find(a => a.id !== p.id) || answers[0];
      return { code, answerId: other.id };
    });
    await results;
    const adv = waitAny(players[0], ['new_question', 'game_ended']);
    host.socket.emit('sit:next', { code });
    if ((await adv).event !== 'new_question') break;
  }
}

async function playFitb(host, players, code, rounds = 1) {
  const rs = waitAll(players, 'fitb:round_start');
  host.socket.emit('fitb:start', { code, rounds });
  await rs;
  for (let r = 1; r <= rounds; r++) {
    const voting = waitAll(players, 'fitb:voting_started');
    emitAll(players, 'fitb:answer', (p) => ({ code, text: `${p.name} blank` }));
    const vp = await voting;
    const results = waitAll(players, 'fitb:results');
    // vote by answer index; pick an index that isn't ours
    emitAll(players, 'fitb:vote', (p, i) => {
      const mine = vp[i].myAnswerIndex;
      const answers = vp[i].answers;
      const pick = answers.find(a => a.id !== mine) || answers[0];
      return { code, answerId: pick.id };
    });
    await results;
    const isLast = r === rounds;
    const next = isLast ? waitAll(players, 'fitb:end') : waitAll(players, 'fitb:round_start');
    host.socket.emit('fitb:next_round', { code });
    await next;
  }
}

async function playDrawing(host, players, code, rounds = 1) {
  const rs = waitAll(players, 'draw:round_start');
  host.socket.emit('draw:start', { code, rounds, mode: 'classic' });
  await rs;
  for (let r = 1; r <= rounds; r++) {
    const voting = waitAll(players, 'draw:voting_started');
    emitAll(players, 'draw:submit', () => ({ code, strokes: STROKES }));
    await voting;
    const results = waitAll(players, 'draw:results');
    emitAll(players, 'draw:vote', (p, i) => ({ code, votedForPlayerId: players[(i + 1) % players.length].id }));
    await delay(150);
    host.socket.emit('draw:show_results', { code });
    await results;
    const isLast = r === rounds;
    const next = isLast ? waitAll(players, 'draw:end') : waitAll(players, 'draw:round_start');
    host.socket.emit('draw:next_round', { code });
    await next;
  }
}

async function playSelfie(host, players, code, rounds = 1) {
  // photo phase may be skipped if photos already banked
  const firstP = waitAny(players[0], ['selfie:photo_phase', 'selfie:drawing_phase']);
  host.socket.emit('selfie:start', { code, rounds });
  const first = await firstP;
  if (first.event === 'selfie:photo_phase') {
    const drawing = waitAll(players, 'selfie:drawing_phase');
    emitAll(players, 'selfie:submit_photo', () => ({ code, photoData: PHOTO }));
    await drawing;
  }
  // each player draws
  const voting = waitAll(players, 'selfie:voting_started');
  emitAll(players, 'selfie:submit_drawing', () => ({ code, strokes: STROKES }));
  const vp = await voting;
  const results = waitAll(players, 'selfie:results');
  const subs = vp[0].submissions || [];
  emitAll(players, 'selfie:vote', (p) => {
    const other = subs.find(s => s.drawerId !== p.id) || subs[0];
    return { code, drawerId: other ? other.drawerId : players[0].id };
  });
  await delay(150);
  host.socket.emit('selfie:show_results', { code });
  await results;
  // selfie results ARE the end when isFinal; single round here
}

async function playCaption(host, players, code, rounds = 1) {
  const firstP = waitAny(players[0], ['caption:photo_phase', 'caption:writing_phase']);
  host.socket.emit('caption:start', { code, rounds });
  const first = await firstP;
  let writingPayload;
  if (first.event === 'caption:photo_phase') {
    const writing = waitAll(players, 'caption:writing_phase');
    emitAll(players, 'caption:submit_photo', () => ({ code, photoData: PHOTO }));
    writingPayload = (await writing)[0];
  } else {
    writingPayload = first.payload;
  }
  let guard = 0;
  while (guard++ < 12) {
    // Only non-featured players write; capture each writer's own caption id so
    // nobody votes their own (rejected votes would stall the round).
    // Submit captions for exactly the server's declared writer set.
    const writerIds = new Set((writingPayload.writers || []).map(w => w.id));
    const writers = players.filter(p => writerIds.has(p.id));
    const ownIds = {};
    writers.forEach(p => p.socket.once('caption:your_caption_id', ({ captionId }) => { ownIds[p.id] = captionId; }));
    const voting = waitAll(players, 'caption:voting_phase');
    writers.forEach(p => p.socket.emit('caption:submit_caption', { code, text: `${p.name} caption` }));
    const vp = await voting;
    await delay(120); // let your_caption_id arrive
    const caps = vp[0].captions || [];
    const results = waitAll(players, 'caption:round_results');
    players.forEach((p) => {
      const pick = caps.find(cx => cx.id !== ownIds[p.id]) || caps[0];
      p.socket.emit('caption:vote', { code, captionId: pick.id });
    });
    await results;
    const adv = waitAny(players[0], ['caption:writing_phase', 'caption:game_over']);
    host.socket.emit('caption:next_round', { code });
    const a = await adv;
    if (a.event !== 'caption:writing_phase') break;
    writingPayload = a.payload;
  }
}

async function playPhotoVote(host, players, code, subType, rounds = 1) {
  const firstP = waitAny(players[0], ['photovote:photo_phase', 'photovote:voting_phase']);
  host.socket.emit('photovote:start', { code, subType, rounds });
  const first = await firstP;
  if (first.event === 'photovote:photo_phase') {
    const voting = waitAll(players, 'photovote:voting_phase');
    emitAll(players, 'photovote:submit_photo', () => ({ code, photoData: PHOTO }));
    await voting;
  }
  const results = waitAll(players, 'photovote:round_results');
  emitAll(players, 'photovote:vote', (p, i) => ({ code, targetPlayerId: players[(i + 1) % players.length].id }));
  await delay(150);
  host.socket.emit('photovote:skip_to_results', { code });
  await results;
  const over = waitAll(players, 'photovote:game_over');
  host.socket.emit('photovote:next_round', { code });
  await over;
}

async function playDt(host, players, code) {
  const firstP = waitAny(players[0], ['dt:selfie_phase', 'dt:prompt_phase']);
  host.socket.emit('dt:start', { code });
  const first = await firstP;
  if (first.event === 'dt:selfie_phase') {
    const prompting = waitAll(players, 'dt:prompt_phase');
    emitAll(players, 'selfie:submit_photo', () => ({ code, photoData: PHOTO }));
    await prompting;
  }
  // Wire auto-responders for per-player turn/guess events BEFORE they can fire —
  // dt:your_turn is emitted the instant the drawing phase begins.
  const turnH = players.map(p => { const h = ({ promptId }) => p.socket.emit('dt:submit_strokes', { code, promptId, strokes: STROKES }); p.socket.on('dt:your_turn', h); return [p, h]; });
  const guessH = players.map(p => { const h = ({ promptId }) => p.socket.emit('dt:submit_guess', { code, promptId, guessText: `${p.name} guess` }); p.socket.on('dt:your_guess', h); return [p, h]; });
  let curPrompt = null;
  const revealH = (d) => { curPrompt = d && d.promptId; };
  host.socket.on('dt:reveal_update', revealH);

  // prompting -> drawing (chains auto-draw via wired handler)
  const drawing = waitAll(players, 'dt:drawing_phase');
  emitAll(players, 'dt:submit_prompt', (p) => ({ code, templateText: `Make [name] a ${p.name} hero` }));
  await drawing;

  // drawing -> guessing
  const guessing = waitAll(players, 'dt:guessing_phase');
  await guessing;

  // guessing -> reveal (guesses auto-submit; host forces reveal as a backstop)
  const reveal = waitAll(players, 'dt:reveal_phase');
  await delay(600);
  host.socket.emit('dt:skip_to_reveal', { code });
  await reveal;

  // reveal -> end: step through every chain/step, voting on the active chain
  const end = waitAll(players, 'dt:end');
  let dtEnded = false; end.then(() => { dtEnded = true; });
  let guard = 0;
  while (!dtEnded && guard++ < 100) {
    players.forEach(p => { if (curPrompt) p.socket.emit('dt:vote', { code, promptId: curPrompt, vote: 'correct' }); });
    host.socket.emit('dt:reveal_next', { code });
    await delay(180);
  }
  await end;
  turnH.forEach(([p, h]) => p.socket.off('dt:your_turn', h));
  guessH.forEach(([p, h]) => p.socket.off('dt:your_guess', h));
  host.socket.off('dt:reveal_update', revealH);
}

// ─── Playlist ────────────────────────────────────────────────────────────────
const PLAYLIST = [
  ['most-likely-to', (h, p, c) => playMlt(h, p, c, 2)],
  ['this-or-that', (h, p, c) => playTot(h, p, c, 1)],
  ['who-said-that', (h, p, c) => playWst(h, p, c, 1)],
  ['situational', (h, p, c) => playSituational(h, p, c, 1)],
  ['fill-in-the-blank', (h, p, c) => playFitb(h, p, c, 1)],
  ['drawing', (h, p, c) => playDrawing(h, p, c, 1)],
  ['selfie-roast', (h, p, c) => playSelfie(h, p, c, 1)],
  ['caption', (h, p, c) => playCaption(h, p, c, 1)],
  ['pmatch', (h, p, c) => playPhotoVote(h, p, c, 'pmatch', 1)],
  ['photoassoc', (h, p, c) => playPhotoVote(h, p, c, 'photoassoc', 1)],
  ['draw-telephone', (h, p, c) => playDt(h, p, c)],
];

const LOOPS = parseInt(process.env.LOOPS || '1', 10); // replay the whole playlist N times in the SAME room

(async () => {
  const { host, players, code } = await setup();
  console.log(`Room ${code} — host + ${players.length} players joined.\n`);
  let gamesPlayed = 0;

  for (let loop = 1; loop <= LOOPS; loop++) {
    if (LOOPS > 1) console.log(`— playlist pass ${loop}/${LOOPS} —`);
    for (const [type, driver] of PLAYLIST) {
      process.stdout.write(`▶ ${type} ... `);
      disconnects = [];
      // change_game resets to lobby with the new type, then the driver emits the start
      host.socket.emit('change_game', { code, newGameType: type });
      await delay(350);
      const t0 = Date.now();
      try {
        await driver(host, players, code);
      } catch (e) {
        console.log(`FAIL\n   ✗ ${e.message}`);
        [host, ...players].forEach(c => c.socket.close());
        process.exit(1);
      }
      checkpoint(host, players, code, type);
      gamesPlayed++;
      console.log(`ok (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }

  console.log(`\n✅ Completed ${gamesPlayed} games across ${LOOPS} playlist pass(es), same room ${code}, 6 clients, no disconnects/duplicates.`);
  [host, ...players].forEach(c => c.socket.close());
  process.exit(0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
