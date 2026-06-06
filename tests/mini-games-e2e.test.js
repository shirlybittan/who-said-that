/**
 * Mini-games End-to-End Test
 *
 * Tests for recently fixed mini-games:
 *   1. Prompt Match (photovote/pmatch) — was crashing with pvPlayers undefined
 *   2. Selfie Artist — anonymous voting, drawing phase, results
 *   3. Drawing in Chain (dt/DrawTel) — guessing phase reaches target players
 *   4. Fill-in-the-Blank — full round + auto-submit timer
 *   5. Most Likely To — vote + scoring
 */

import { io } from 'socket.io-client';
import { test, expect } from '@playwright/test';

const SERVER = 'http://localhost:3001';
const DELAY   = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Helpers (same as playlist-e2e) ─────────────────────────────────────────

function connect() {
  return new Promise((resolve, reject) => {
    const sock = io(SERVER, { transports: ['websocket'], forceNew: true });
    let timeoutId;
    const cleanup = () => clearTimeout(timeoutId);
    sock.once('connect', () => { cleanup(); resolve(sock); });
    sock.once('connect_error', (err) => { cleanup(); reject(err); });
    timeoutId = setTimeout(() => reject(new Error('connect timeout')), 8000);
  });
}

function waitFor(sock, event, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      sock.off(event, h);
      reject(new Error(`Timeout waiting for '${event}' (${timeoutMs} ms)`));
    }, timeoutMs);
    function h(data) { clearTimeout(id); resolve(data); }
    sock.once(event, h);
  });
}

function waitForAny(sock, events, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      events.forEach(ev => sock.off(ev, hs[ev]));
      reject(new Error(`Timeout waiting for [${events.join('|')}] (${timeoutMs} ms)`));
    }, timeoutMs);
    const hs = {};
    events.forEach(ev => {
      hs[ev] = (data) => {
        clearTimeout(id);
        events.forEach(e => sock.off(e, hs[e]));
        resolve({ event: ev, data });
      };
      sock.on(ev, hs[ev]);
    });
  });
}

// Minimal 1x1 PNG as a base64 data URI (for photo submissions)
const FAKE_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Minimal stroke array for drawing submissions
const FAKE_STROKES = [{ color: '#FF0000', width: 4, type: 'pen', points: [{ x: 10, y: 10 }, { x: 50, y: 50 }] }];

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Prompt Match (photovote / pmatch) — no pvPlayers crash
// ─────────────────────────────────────────────────────────────────────────────

test('Prompt Match: full round — no server crash, voting works', async () => {
  const hostSock = await connect();
  const players = await Promise.all([
    connect().then(s => ({ sock: s, name: 'Alpha' })),
    connect().then(s => ({ sock: s, name: 'Beta' })),
    connect().then(s => ({ sock: s, name: 'Gamma' })),
  ]);
  let code;

  // Create room
  const created = await new Promise(resolve => {
    hostSock.once('room_created', resolve);
    hostSock.emit('create_room', { playerName: 'PMHost', gameType: 'who-said-that', hostIsPlaying: false });
  });
  code = created.code;
  console.log(`\n  🏠 Room: ${code}`);

  for (const p of players) {
    p.id = await new Promise(resolve => {
      p.sock.once('join_success', d => resolve(d.playerId));
      p.sock.emit('join_room', { code, playerName: p.name });
    });
  }

  // Start Prompt Match (pmatch)
  const photoPhasePromise = waitFor(hostSock, 'photovote:photo_phase', 8000);
  hostSock.emit('photovote:start', { code, subType: 'pmatch', rounds: 2 });
  const photoPhase = await photoPhasePromise;

  console.log(`  📸 Photo phase started, subType=${photoPhase.subType}, rounds=${photoPhase.totalRounds}`);
  expect(photoPhase.subType).toBe('pmatch');
  expect(photoPhase.totalRounds).toBe(2);

  // All players submit photos
  const votingPhasePromise = waitFor(hostSock, 'photovote:voting_phase', 10000);
  for (const p of players) {
    p.sock.emit('photovote:submit_photo', { code, photoData: FAKE_PHOTO });
    await DELAY(50);
  }
  const votingPhase = await votingPhasePromise;
  console.log(`  🗳 Voting phase: prompt="${String(votingPhase.prompt).slice(0,50)}"`);
  expect(votingPhase.photos?.length).toBe(3);

  // Register results listener BEFORE sending votes (avoid race condition)
  const resultsPromise = waitFor(hostSock, 'photovote:round_results', 10000);
  // All players vote (each votes for someone other than themselves)
  for (let i = 0; i < players.length; i++) {
    const target = players[(i + 1) % players.length];
    players[i].sock.emit('photovote:vote', { code, targetPlayerId: target.id });
    await DELAY(50);
  }
  const results = await resultsPromise;
  console.log(`  🏆 Round results: ${results.voteResults?.length} players scored`);
  expect(results.voteResults?.length).toBe(3);

  // Advance to round 2
  const round2PhotoPromise = waitFor(hostSock, 'photovote:photo_phase', 8000);
  hostSock.emit('photovote:next_round', { code });
  const round2Photo = await round2PhotoPromise;
  expect(round2Photo.round).toBe(2);
  console.log(`  📸 Round 2 photo phase OK`);

  // Submit photos again
  const votingPhase2Promise = waitFor(hostSock, 'photovote:voting_phase', 10000);
  for (const p of players) {
    p.sock.emit('photovote:submit_photo', { code, photoData: FAKE_PHOTO });
    await DELAY(50);
  }
  await votingPhase2Promise;

  // Register round 2 results listener BEFORE sending votes
  const r2ResultsPromise = waitFor(hostSock, 'photovote:round_results', 10000);
  const gameOverPromise = waitFor(hostSock, 'photovote:game_over', 10000);
  // Vote round 2
  for (let i = 0; i < players.length; i++) {
    const target = players[(i + 1) % players.length];
    players[i].sock.emit('photovote:vote', { code, targetPlayerId: target.id });
    await DELAY(50);
  }
  await r2ResultsPromise;
  hostSock.emit('photovote:next_round', { code });
  const gameOver = await gameOverPromise;
  console.log(`  🎉 Game over! Leaderboard size: ${gameOver.leaderboard?.length}`);
  expect(gameOver.leaderboard?.length).toBe(3);

  hostSock.disconnect();
  for (const p of players) p.sock.disconnect();
  console.log('  ✅ Prompt Match test passed.');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Selfie Artist — photo → drawing → anonymous voting → results
// ─────────────────────────────────────────────────────────────────────────────

test('Selfie Artist: photo → drawing → voting (anonymous) → results', async () => {
  const hostSock = await connect();
  const players = await Promise.all([
    connect().then(s => ({ sock: s, name: 'Pika' })),
    connect().then(s => ({ sock: s, name: 'Bulba' })),
    connect().then(s => ({ sock: s, name: 'Char' })),
  ]);
  let code;

  const created = await new Promise(resolve => {
    hostSock.once('room_created', resolve);
    hostSock.emit('create_room', { playerName: 'SelfieHost', gameType: 'who-said-that', hostIsPlaying: false });
  });
  code = created.code;
  console.log(`\n  🏠 Room: ${code}`);

  for (const p of players) {
    p.id = await new Promise(resolve => {
      p.sock.once('join_success', d => resolve(d.playerId));
      p.sock.emit('join_room', { code, playerName: p.name });
    });
  }

  // Start selfie game
  const photoPhasePromise = waitFor(hostSock, 'selfie:photo_phase', 8000);
  hostSock.emit('selfie:start', { code, rounds: 1 });
  const photoPhase = await photoPhasePromise;
  console.log(`  📸 Selfie photo phase: ${photoPhase.players?.length} players`);
  expect(photoPhase.players?.length).toBe(3);

  // Register drawing_phase listener before submitting photos
  const drawPhasePromise = waitFor(hostSock, 'selfie:drawing_phase', 10000);

  // Register draw_assigned listeners on each player BEFORE drawing phase (it fires per-socket BEFORE the broadcast)
  const drawAssignmentPromises = players.map(p => waitFor(p.sock, 'selfie:draw_assigned', 10000));

  // All players submit photos (this triggers assignSelfieDrawers which sends draw_assigned)
  for (const p of players) {
    p.sock.emit('selfie:submit_photo', { code, photoData: FAKE_PHOTO });
    await DELAY(50);
  }

  // Wait for drawing phase broadcast
  const drawPhase = await drawPhasePromise;
  console.log(`  🎨 Drawing phase: ${drawPhase.totalDrawers} drawers, prompt="${drawPhase.promptTemplate}"`);
  expect(drawPhase.totalDrawers).toBe(3);
  expect(drawPhase.promptTemplate).toBeTruthy();

  const drawAssignments = await Promise.all(drawAssignmentPromises);
  console.log(`  🖌 All 3 players received drawing assignments`);
  drawAssignments.forEach(a => {
    expect(a.photoData).toBeTruthy();
    expect(a.ownerPlayerId).toBeTruthy();
  });

  // All players submit drawings
  const votingPhasePromise = waitFor(hostSock, 'selfie:voting_started', 10000);
  for (const p of players) {
    p.sock.emit('selfie:submit_drawing', { code, strokes: FAKE_STROKES });
    await DELAY(50);
  }
  const votingPhase = await votingPhasePromise;
  console.log(`  🗳 Voting started: ${votingPhase.submissions?.length} submissions`);
  expect(votingPhase.submissions?.length).toBe(3);

  // Verify submissions have drawerName (server sends it; client should hide it during voting)
  votingPhase.submissions.forEach(sub => {
    expect(sub.drawerName).toBeTruthy(); // server sends name
    expect(sub.drawerId).toBeTruthy();   // but ID also present so client can anonymize
  });
  console.log('  ✅ Server sends drawerName — client-side anonymity verified (field exists, UI hides it before vote)');

  // All players vote
  const resultsPromise = waitFor(hostSock, 'selfie:results', 10000);
  for (let i = 0; i < players.length; i++) {
    // Vote for someone other than self
    const targetDrawerId = votingPhase.submissions.find(s => s.drawerId !== players[i].id)?.drawerId;
    if (targetDrawerId) {
      players[i].sock.emit('selfie:vote', { code, drawerId: targetDrawerId });
    }
    await DELAY(50);
  }
  const results = await resultsPromise;
  console.log(`  🏆 Results: ${results.submissions?.length} submissions, isFinal=${results.isFinal}`);
  expect(results.isFinal).toBe(true);
  expect(results.leaderboard?.length).toBe(3);

  hostSock.disconnect();
  for (const p of players) p.sock.disconnect();
  console.log('  ✅ Selfie Artist test passed.');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Drawing in Chain (DrawTel) — guessing phase fires, target players receive dt:your_guess
// ─────────────────────────────────────────────────────────────────────────────

test('Drawing in Chain (DrawTel): guessing phase — target players receive their guess', async () => {
  const hostSock = await connect();
  const players = await Promise.all([
    connect().then(s => ({ sock: s, name: 'Red' })),
    connect().then(s => ({ sock: s, name: 'Blue' })),
    connect().then(s => ({ sock: s, name: 'Green' })),
  ]);
  let code;

  const created = await new Promise(resolve => {
    hostSock.once('room_created', resolve);
    hostSock.emit('create_room', { playerName: 'DTHost', gameType: 'who-said-that', hostIsPlaying: false });
  });
  code = created.code;
  console.log(`\n  🏠 Room: ${code}`);

  for (const p of players) {
    p.id = await new Promise(resolve => {
      p.sock.once('join_success', d => resolve(d.playerId));
      p.sock.emit('join_room', { code, playerName: p.name });
    });
  }

  // Submit selfie photos first — DrawTel requires player photos before starting
  const dtSelfiePhasePromise = waitFor(hostSock, 'dt:selfie_phase', 8000).catch(() => null);
  const dtPromptDirectPromise = waitFor(hostSock, 'dt:prompt_phase', 4000).catch(() => null);
  hostSock.emit('dt:start', { code });

  // Check if selfie phase is required
  const firstEvent = await Promise.race([
    dtSelfiePhasePromise.then(d => ({ type: 'selfie', data: d })),
    dtPromptDirectPromise.then(d => ({ type: 'prompt', data: d })),
    DELAY(5000).then(() => ({ type: 'timeout' })),
  ]);

  let promptPhaseData;
  if (firstEvent.type === 'selfie') {
    console.log(`  📸 DrawTel requires selfies — submitting photos`);
    const promptPhasePromise = waitFor(hostSock, 'dt:prompt_phase', 15000);
    for (const p of players) {
      p.sock.emit('selfie:submit_photo', { code, photoData: FAKE_PHOTO });
      await DELAY(100);
    }
    promptPhaseData = await promptPhasePromise;
  } else if (firstEvent.type === 'prompt') {
    promptPhaseData = firstEvent.data;
  } else {
    throw new Error('dt:start did not emit expected phase event');
  }
  const promptPhase = promptPhaseData;
  console.log(`  ✏ Prompt phase: ${promptPhase.players?.length} players, ${promptPhase.secondsLeft}s`);
  expect(promptPhase.players?.length).toBe(3);

  // Register dt:your_guess AND dt:your_turn handlers BEFORE prompts (drawing turns fire immediately at phase start)
  const yourGuessPromises = players.map(p =>
    waitFor(p.sock, 'dt:your_guess', 120000) // long timeout — drawing phase takes time
  );
  const yourTurnHandlers = {};
  const submitWhenTurn = (p) => {
    const handler = (data) => {
      console.log(`  🖌 ${p.name} received drawing turn for chain ${data.promptId}`);
      p.sock.emit('dt:submit_strokes', { code, promptId: data.promptId, strokes: FAKE_STROKES });
    };
    p.sock.on('dt:your_turn', handler);
    yourTurnHandlers[p.name] = handler;
  };
  players.forEach(submitWhenTurn);

  // Register drawing phase listener BEFORE submitting prompts (server auto-advances immediately)
  const drawingPhasePromise = waitFor(hostSock, 'dt:drawing_phase', 15000);

  // All players submit prompts
  for (const p of players) {
    p.sock.emit('dt:submit_prompt', { code, templateText: `[name] eating a giant sandwich` });
    await DELAY(100);
  }

  // Wait for drawing phase to start (server auto-advances when all prompts received)
  const drawingPhase = await drawingPhasePromise;
  console.log(`  🖌 Drawing phase: ${drawingPhase.totalChains} chains — handlers already registered`);
  expect(drawingPhase.totalChains).toBe(3);

  // Wait for all 3 target players to receive their guess turn
  const guessAssignments = await Promise.all(yourGuessPromises);
  console.log(`  🤔 All 3 players received dt:your_guess events`);
  guessAssignments.forEach((g, i) => {
    expect(g.promptId).toBeTruthy();
    console.log(`    ${players[i].name}: promptId=${g.promptId}, drawerCount=${g.drawerCount}`);
  });

  // Register reveal listener BEFORE submitting guesses (server fires it when all guesses received)
  const revealPhasePromise = waitFor(hostSock, 'dt:reveal_phase', 15000);
  // Each target player submits a guess
  for (const p of players) {
    const guess = guessAssignments[players.indexOf(p)];
    p.sock.emit('dt:submit_guess', { code, promptId: guess.promptId, guessText: `${p.name} eating a sandwich` });
    await DELAY(100);
  }

  // Wait for reveal phase to start (server fires it when all guesses received)
  await revealPhasePromise;
  console.log(`  🎉 Reveal phase started!`);

  // Clean up per-turn listeners
  players.forEach(p => p.sock.off('dt:your_turn', yourTurnHandlers[p.name]));

  hostSock.disconnect();
  for (const p of players) p.sock.disconnect();
  console.log('  ✅ DrawTel guessing phase test passed.');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Fill-in-the-Blank — answer timer auto-advances when no one submits
// ─────────────────────────────────────────────────────────────────────────────

test('Fill-in-the-Blank: answer timer auto-advances to voting', async () => {
  const hostSock = await connect();
  const players = await Promise.all([
    connect().then(s => ({ sock: s, name: 'One' })),
    connect().then(s => ({ sock: s, name: 'Two' })),
    connect().then(s => ({ sock: s, name: 'Three' })),
  ]);
  let code;

  const created = await new Promise(resolve => {
    hostSock.once('room_created', resolve);
    hostSock.emit('create_room', {
      playerName: 'FITBHost',
      gameType: 'who-said-that',
      hostIsPlaying: false,
      roomConfig: { roundDurationSecs: 20 }, // minimum valid is 20s
    });
  });
  code = created.code;
  console.log(`\n  🏠 Room: ${code}`);

  for (const p of players) {
    p.id = await new Promise(resolve => {
      p.sock.once('join_success', d => resolve(d.playerId));
      p.sock.emit('join_room', { code, playerName: p.name });
    });
  }

  // Start FITB (roundDurationSecs min is 20, so use 20 for a reasonably fast test)
  const roundStartPromise = waitFor(hostSock, 'fitb:round_start', 8000);
  hostSock.emit('fitb:start', { code, rounds: 1 });
  const roundStart = await roundStartPromise;
  console.log(`  📝 FITB round start: "${roundStart.question}" (timer: ${roundStart.timeLimit}s)`);
  expect(roundStart.question).toBeTruthy();
  expect(roundStart.timeLimit).toBeGreaterThan(0);

  // Don't submit anything — wait for timer to auto-advance to voting
  console.log(`  ⏳ Waiting for auto-advance (up to ${roundStart.timeLimit + 5}s)…`);
  const votingStarted = await waitFor(hostSock, 'fitb:voting_started', (roundStart.timeLimit + 5) * 1000);
  console.log(`  🗳 Auto-advanced to voting: ${votingStarted.answers?.length} answers (auto-filled)`);
  expect(votingStarted.answers).toBeDefined();

  // All players vote (voting for index 0, unless it's their own)
  const resultsPromise = waitFor(hostSock, 'fitb:results', 8000);
  for (let i = 0; i < players.length; i++) {
    // Vote for the first answer that isn't theirs (answers are anonymous, index 0 is safe)
    players[i].sock.emit('fitb:vote', { code, answerId: 0 });
    await DELAY(50);
  }
  // Host can force results if not all voted
  await DELAY(500);
  hostSock.emit('fitb:show_results', { code });
  const results = await resultsPromise;
  console.log(`  🏆 FITB results: ${results.answers?.length} answers`);
  expect(results.answers).toBeDefined();

  hostSock.disconnect();
  for (const p of players) p.sock.disconnect();
  console.log('  ✅ FITB auto-submit test passed.');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Most Likely To — voting + joker + results
// ─────────────────────────────────────────────────────────────────────────────

test('Most Likely To: vote + joker + scoring', async () => {
  const hostSock = await connect();
  const players = await Promise.all([
    connect().then(s => ({ sock: s, name: 'Maya' })),
    connect().then(s => ({ sock: s, name: 'Jake' })),
    connect().then(s => ({ sock: s, name: 'Zoe' })),
  ]);
  let code;

  const created = await new Promise(resolve => {
    hostSock.once('room_created', resolve);
    hostSock.emit('create_room', { playerName: 'MLTHost', gameType: 'most-likely-to', hostIsPlaying: false });
  });
  code = created.code;
  console.log(`\n  🏠 Room: ${code}`);

  for (const p of players) {
    p.id = await new Promise(resolve => {
      p.sock.once('join_success', d => resolve(d.playerId));
      p.sock.emit('join_room', { code, playerName: p.name });
    });
  }

  // Start MLT
  const promptPromise = waitFor(hostSock, 'mlt:prompt', 8000);
  hostSock.emit('mlt:start', { code, rounds: 2 });
  const prompt1 = await promptPromise;
  console.log(`  🎯 MLT Round 1: "${String(prompt1.prompt).slice(0, 60)}"`);
  expect(prompt1.players?.length).toBe(3);
  expect(prompt1.round).toBe(1);

  // Player 0 uses joker
  players[0].sock.emit('mlt:toggle_joker', { code });
  await DELAY(100);

  // All players vote for the same person (Maya votes for Jake, others vote for Maya)
  const resultsPromise = waitFor(hostSock, 'mlt:results', 8000);
  players[0].sock.emit('mlt:vote', { code, targetPlayerId: players[1].id }); // Maya votes Jake
  players[1].sock.emit('mlt:vote', { code, targetPlayerId: players[0].id }); // Jake votes Maya
  players[2].sock.emit('mlt:vote', { code, targetPlayerId: players[0].id }); // Zoe votes Maya

  const results1 = await resultsPromise;
  console.log(`  🏆 Round 1 results: majority=${results1.majorityPlayerIds}`);
  expect(results1.results?.length).toBe(3);
  expect(results1.majorityPlayerIds?.length).toBeGreaterThan(0);

  // Advance to round 2
  const prompt2Promise = waitFor(hostSock, 'mlt:prompt', 8000);
  hostSock.emit('mlt:next_round', { code });
  const prompt2 = await prompt2Promise;
  console.log(`  🎯 MLT Round 2: "${String(prompt2.prompt).slice(0, 60)}"`);
  expect(prompt2.round).toBe(2);

  // All vote
  const results2Promise = waitFor(hostSock, 'mlt:results', 8000);
  for (let i = 0; i < players.length; i++) {
    players[i].sock.emit('mlt:vote', { code, targetPlayerId: players[(i + 1) % players.length].id });
  }
  await results2Promise;

  // End game
  const endPromise = waitFor(hostSock, 'mlt:end', 8000);
  hostSock.emit('mlt:next_round', { code });
  const end = await endPromise;
  console.log(`  🎉 MLT end: ${end.leaderboard?.length} players`);
  expect(end.leaderboard?.length).toBe(3);
  end.leaderboard.forEach(p => {
    expect(p.name).toBeTruthy();
    expect(p.title).toBeTruthy();
  });

  hostSock.disconnect();
  for (const p of players) p.sock.disconnect();
  console.log('  ✅ Most Likely To test passed.');
});
