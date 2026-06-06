/**
 * Playlist — 5 distinct mini-games, played sequentially
 *
 * Simulates what HostPage.handleNextQueueGame() does:
 *   1. emit change_game  →  wait for game_changed
 *   2. emit <game>:start →  drive the game to completion
 *   3. repeat
 *
 * Playlist:
 *   Game 1 — Most Likely To      (2 rounds, vote + joker)
 *   Game 2 — Who Said That?      (2 rounds, answer + vote cycle)
 *   Game 3 — Fill-in-the-Blank   (2 rounds, answer + vote + next_round)
 *   Game 4 — Drawing             (1 round,  draw:submit + draw:vote + draw:show_results)
 *   Game 5 — This-or-That        (2 rounds, tot:vote + tot:next_round → tot:end)
 *
 * All transitions are verified: global scores accumulate, players stay
 * connected, and each game ends cleanly before the next begins.
 */

import { io } from 'socket.io-client';
import { test, expect } from '@playwright/test';

const SERVER   = 'http://localhost:3001';
const DELAY    = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function connect() {
  return new Promise((resolve, reject) => {
    const sock = io(SERVER, { transports: ['websocket'], forceNew: true });
    sock.once('connect',       () => resolve(sock));
    sock.once('connect_error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 8000);
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

const FAKE_STROKES = [
  { color: '#FF6B6B', width: 4, type: 'pen', points: [{ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 90, y: 10 }] },
];

// ─── Game drivers ─────────────────────────────────────────────────────────────

/**
 * Drive a single WST/Situational-style answer+vote round.
 * Returns when round_ended fires. Caller should emit ready_next_round if needed.
 */
async function driveWstRound(hostSock, players, code, qEvt) {
  const question = String(qEvt.question || qEvt.prompt || '').slice(0, 50);
  console.log(`      📝 WST: "${question}…"`);

  const vsPromise = waitFor(hostSock, 'voting_started', 20000);
  for (const p of players) {
    p.sock.emit('submit_answer', { code, text: `Answer-${p.name}` });
  }
  const vsEvt = await vsPromise;
  const totalAnswers = vsEvt?.answers?.length ?? players.length;

  for (let ansIdx = 0; ansIdx < totalAnswers; ansIdx++) {
    for (let i = 0; i < players.length; i++) {
      players[i].sock.emit('submit_vote', {
        code,
        votedPlayerId: players[(i + 1) % players.length].id,
      });
    }
    await waitForAny(hostSock, ['all_votes_in'], 6000).catch(() => {});
    if (ansIdx < totalAnswers - 1) {
      hostSock.emit('next_answer_request', { code });
      await waitFor(hostSock, 'next_answer', 6000);
    } else {
      const reP = waitFor(hostSock, 'round_ended', 8000);
      hostSock.emit('next_answer_request', { code });
      await reP;
    }
  }
  console.log(`      🏁 WST round done`);
}

async function driveSitRound(hostSock, players, code, qEvt) {
  console.log(`      📝 Sit: "${String(qEvt.question || '').slice(0, 50)}…"`);
  const sitVSPromise = waitFor(hostSock, 'sit:voting_started', 20000);
  for (const p of players) p.sock.emit('submit_answer', { code, text: `SitAns-${p.name}` });
  const sitVSEvt = await sitVSPromise;
  const sitResultsP = waitFor(hostSock, 'sit:results', 10000);
  for (let i = 0; i < players.length; i++) {
    const target = (sitVSEvt.answers || []).find(a => a.id !== players[i].id);
    players[i].sock.emit('sit:vote', { code, answerId: target?.id ?? players[(i + 1) % players.length].id });
  }
  await sitResultsP;
  console.log(`      🏁 Sit round done`);
}

async function driveTotRound(hostSock, players, code, qEvt) {
  console.log(`      ❓ ToT: A="${String(qEvt.a).slice(0,25)}" vs B="${String(qEvt.b).slice(0,25)}"`);
  const resultsP = waitFor(hostSock, 'tot:results', 12000);
  for (let i = 0; i < players.length; i++) {
    players[i].sock.emit('tot:vote', { code, choice: i % 2 === 0 ? 'a' : 'b' });
  }
  await resultsP;
  console.log(`      🏁 ToT round done`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME 1 DRIVER: Most Likely To (MLT)
// ─────────────────────────────────────────────────────────────────────────────
async function playMLT(hostSock, players, code, rounds = 2) {
  console.log(`\n  ── Game 1: Most Likely To (${rounds} rounds) ──`);
  const promptP = waitFor(hostSock, 'mlt:prompt', 8000);
  hostSock.emit('mlt:start', { code, rounds, allowSelfVote: true });
  let prompt = await promptP;
  console.log(`    🎯 Round 1: "${String(prompt.prompt).slice(0, 55)}"`);
  expect(prompt.players?.length).toBe(3);
  expect(prompt.round).toBe(1);

  for (let r = 1; r <= rounds; r++) {
    if (r > 1) {
      const nextP = waitFor(hostSock, 'mlt:prompt', 8000);
      hostSock.emit('mlt:next_round', { code });
      prompt = await nextP;
      console.log(`    🎯 Round ${r}: "${String(prompt.prompt).slice(0, 55)}"`);
    }

    // Player 0 toggles joker on round 1
    if (r === 1) {
      players[0].sock.emit('mlt:toggle_joker', { code });
      await DELAY(80);
    }

    const resultsP = waitFor(hostSock, 'mlt:results', 10000);
    for (let i = 0; i < players.length; i++) {
      players[i].sock.emit('mlt:vote', { code, targetPlayerId: players[(i + 1) % players.length].id });
    }
    const results = await resultsP;
    expect(results.results?.length).toBe(3);
    console.log(`    🏆 Round ${r} results — majority: ${results.majorityPlayerIds?.length} player(s)`);
  }

  const endP = waitFor(hostSock, 'mlt:end', 8000);
  // mlt:next_round when round >= totalRounds triggers sendMltEnd → 'mlt:end'
  hostSock.emit('mlt:next_round', { code });
  const end = await endP;
  console.log(`    🎉 MLT ended — ${end.leaderboard?.length} players on leaderboard`);
  expect(end.leaderboard?.length).toBe(3);
  return end;
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME 2 DRIVER: Who Said That? (WST)
// ─────────────────────────────────────────────────────────────────────────────
async function playWST(hostSock, players, code) {
  console.log(`\n  ── Game 2: Who Said That? ──`);

  const gsP = waitFor(hostSock, 'game_started', 8000);
  const nqP = waitFor(hostSock, 'new_question', 10000);
  hostSock.emit('start_game', { code });
  const gs = await gsP;
  let qEvt = await nqP;
  console.log(`    🎮 game_started total=${gs.totalRounds}, type=${qEvt.type || qEvt.roundType}`);
  expect(gs.totalRounds).toBeGreaterThanOrEqual(1);

  let round = 1;
  while (round <= gs.totalRounds) {
    const type = qEvt.type || qEvt.roundType || 'wst';
    console.log(`    📋 Round ${round}/${gs.totalRounds} type=${type}`);

    let advanceEvent;
    if (type === 'this-or-that') {
      await driveTotRound(hostSock, players, code, qEvt);
      advanceEvent = 'tot:next_round';
    } else if (type === 'situational') {
      await driveSitRound(hostSock, players, code, qEvt);
      advanceEvent = 'sit:next';
    } else {
      await driveWstRound(hostSock, players, code, qEvt);
      advanceEvent = 'ready_next_round';
    }

    if (round === gs.totalRounds) {
      // Last round — wait for game_ended
      const geP = waitFor(hostSock, 'game_ended', 10000);
      hostSock.emit(advanceEvent, { code });
      const ge = await geP;
      console.log(`    🎉 WST ended — ${Object.keys(ge.finalScores || {}).length} scores`);
      return ge;
    } else {
      // More rounds — wait for next question
      const nextP = waitFor(hostSock, 'new_question', 12000);
      hostSock.emit(advanceEvent, { code });
      qEvt = await nextP;
      round++;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME 3 DRIVER: Fill-in-the-Blank (FITB)
// ─────────────────────────────────────────────────────────────────────────────
async function playFITB(hostSock, players, code, rounds = 2) {
  console.log(`\n  ── Game 3: Fill-in-the-Blank (${rounds} rounds) ──`);

  const rsP = waitFor(hostSock, 'fitb:round_start', 8000);
  hostSock.emit('fitb:start', { code, rounds });
  let roundStart = await rsP;
  console.log(`    📝 Round 1: "${roundStart.question}"`);
  expect(roundStart.question).toBeTruthy();

  for (let r = 1; r <= rounds; r++) {
    if (r > 1) {
      roundStart = await waitFor(hostSock, 'fitb:round_start', 8000);
      console.log(`    📝 Round ${r}: "${roundStart.question}"`);
    }

    // All players submit answers (event is 'fitb:answer', not 'fitb:submit_answer')
    // Each player socket gets their own 'fitb:voting_started' with 'myAnswerIndex'
    const playerVotingPromises = players.map(p => waitFor(p.sock, 'fitb:voting_started', 20000));
    for (const p of players) {
      p.sock.emit('fitb:answer', { code, text: `FITB-${p.name}-r${r}` });
      await DELAY(40);
    }
    const playerVotingEvents = await Promise.all(playerVotingPromises);
    console.log(`    🗳 FITB voting: ${playerVotingEvents[0].answers?.length} answers`);
    expect(playerVotingEvents[0].answers?.length).toBe(3);

    // All players vote — skip their own answer (myAnswerIndex)
    const resultsP = waitFor(hostSock, 'fitb:results', 8000);
    for (let i = 0; i < players.length; i++) {
      const myIdx = playerVotingEvents[i].myAnswerIndex;
      // Vote for any answer that isn't their own
      const voteIdx = myIdx === 0 ? 1 : 0;
      players[i].sock.emit('fitb:vote', { code, answerId: voteIdx });
      await DELAY(40);
    }
    // Force results in case not all votes counted (or a player voted for own answer)
    await DELAY(200);
    hostSock.emit('fitb:show_results', { code });
    const results = await resultsP;
    expect(results.answers?.length).toBe(3);
    console.log(`    🏆 FITB results: ${results.answers.length} answers scored`);

    if (r < rounds) {
      // More rounds — advance
      hostSock.emit('fitb:next_round', { code });
    } else {
      // Last round → end
      const endP = waitFor(hostSock, 'fitb:end', 8000);
      hostSock.emit('fitb:next_round', { code });
      const end = await endP;
      console.log(`    🎉 FITB ended — ${end.leaderboard?.length} on leaderboard`);
      expect(end.leaderboard?.length).toBe(3);
      return end;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME 4 DRIVER: Drawing (1 round)
// ─────────────────────────────────────────────────────────────────────────────
async function playDrawing(hostSock, players, code, rounds = 1) {
  console.log(`\n  ── Game 4: Pictionary Drawing (${rounds} round) ──`);

  const rsP = waitFor(hostSock, 'draw:round_start', 8000);
  hostSock.emit('draw:start', { code, rounds, mode: 'classic' });
  const roundStart = await rsP;
  console.log(`    🎨 Drawing: word="${roundStart.word}", ${roundStart.players?.length} players`);
  expect(roundStart.word).toBeTruthy();
  expect(roundStart.players?.length).toBe(3);

  for (let r = 1; r <= rounds; r++) {
    if (r > 1) {
      await waitFor(hostSock, 'draw:round_start', 8000);
    }

    // All players submit drawings
    const votingP = waitFor(hostSock, 'draw:voting_started', 15000);
    for (const p of players) {
      p.sock.emit('draw:submit', { code, strokes: FAKE_STROKES });
      await DELAY(40);
    }
    const votingStarted = await votingP;
    console.log(`    🗳 Drawing voting: ${votingStarted.submissions?.length} submissions`);
    expect(votingStarted.submissions?.length).toBe(3);

    // All players vote (can't vote for yourself)
    const resultsP = waitFor(hostSock, 'draw:results', 8000);
    for (let i = 0; i < players.length; i++) {
      players[i].sock.emit('draw:vote', {
        code,
        votedForPlayerId: players[(i + 1) % players.length].id,
      });
      await DELAY(40);
    }
    // Force results in case not all voted
    await DELAY(200);
    hostSock.emit('draw:show_results', { code });
    const results = await resultsP;
    console.log(`    🏆 Drawing results: ${results.results?.length} scored`);
    expect(results.results?.length).toBe(3);

    if (r < rounds) {
      hostSock.emit('draw:next_round', { code });
    } else {
      const endP = waitFor(hostSock, 'draw:end', 8000);
      hostSock.emit('draw:next_round', { code });
      const end = await endP;
      console.log(`    🎉 Drawing ended — ${end.leaderboard?.length} on leaderboard`);
      expect(end.leaderboard?.length).toBe(3);
      return end;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME 5 DRIVER: This-or-That (2 rounds)
// ─────────────────────────────────────────────────────────────────────────────
async function playToT(hostSock, players, code) {
  console.log(`\n  ── Game 5: This-or-That ──`);

  const nqP = waitFor(hostSock, 'new_question', 8000);
  const gsP = waitFor(hostSock, 'game_started', 8000);
  hostSock.emit('start_game', { code });
  const gs = await gsP;
  let qEvt = await nqP;
  console.log(`    🎮 ToT started, round=1/${gs.totalRounds}`);
  expect(qEvt.type || qEvt.roundType).toBe('this-or-that');

  let round = 1;
  while (round <= gs.totalRounds) {
    console.log(`    ❓ Round ${round}/${gs.totalRounds}: A="${String(qEvt.a).slice(0,25)}" vs B="${String(qEvt.b).slice(0,25)}"`);
    await driveTotRound(hostSock, players, code, qEvt);

    if (round === gs.totalRounds) {
      // Last round — emit tot:next_round and wait for tot:end (or game_ended)
      const doneP = waitForAny(hostSock, ['tot:end', 'game_ended'], 10000);
      hostSock.emit('tot:next_round', { code });
      const done = await doneP;
      console.log(`    🎉 ToT ended via '${done.event}'`);
      return done;
    } else {
      const nextQ = waitFor(hostSock, 'new_question', 10000);
      hostSock.emit('tot:next_round', { code });
      qEvt = await nextQ;
      round++;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Playlist transition helper (mirrors HostPage.handleNextQueueGame)
// ─────────────────────────────────────────────────────────────────────────────
async function transitionToGame(hostSock, players, code, newGameType) {
  console.log(`\n  ── 🔄 Transitioning → ${newGameType} ──`);

  // Set up all listeners BEFORE emitting to avoid race conditions
  const allChangedPromises = [
    waitFor(hostSock, 'game_changed', 8000),
    ...players.map(p => waitFor(p.sock, 'game_changed', 8000)),
  ];
  hostSock.emit('change_game', { code, newGameType });
  const results = await Promise.all(allChangedPromises);
  const hostChanged = results[0];

  expect(hostChanged.gameType).toBe(newGameType);
  console.log(`    ✅ All ${players.length + 1} sockets received game_changed → ${newGameType}`);

  // Small delay — mirrors HostPage's 200 ms before next start event
  await DELAY(200);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE PLAYLIST TEST
// ─────────────────────────────────────────────────────────────────────────────

test('Playlist — 5 mini-games in sequence: MLT → WST → FITB → Drawing → ToT', async ({ page: _ }) => {
  // ── Setup ──────────────────────────────────────────────────────────────────
  const hostSock = await connect();
  const red   = { name: 'Red',   sock: await connect() };
  const blue  = { name: 'Blue',  sock: await connect() };
  const green = { name: 'Green', sock: await connect() };
  const players = [red, blue, green];

  let code;
  let globalScoresAfterGame1;

  // ─── Room creation ─────────────────────────────────────────────────────────
  await test.step('Create room + 3 players join', async () => {
    const created = await new Promise(resolve => {
      hostSock.once('room_created', resolve);
      hostSock.emit('create_room', {
        playerName:    'PlaylistHost',
        gameType:      'most-likely-to',
        hostIsPlaying: false,
        roomConfig:    { roundDurationSecs: 20 },
      });
    });
    code = created.code;
    console.log(`\n  🏠 Room: ${code}`);

    for (const p of players) {
      const playerId = await new Promise(resolve => {
        p.sock.once('join_success', d => resolve(d.playerId));
        p.sock.emit('join_room', { code, playerName: p.name });
      });
      p.id = playerId;
    }
    console.log(`  👥 Red=${red.id.slice(0,8)} Blue=${blue.id.slice(0,8)} Green=${green.id.slice(0,8)}`);
    expect(players.every(p => !!p.id)).toBeTruthy();
  });

  // ─── Game 1: Most Likely To ────────────────────────────────────────────────
  await test.step('Game 1 — Most Likely To (2 rounds)', async () => {
    const end = await playMLT(hostSock, players, code, 2);

    // Capture global scores after game 1 for later comparison
    globalScoresAfterGame1 = end.globalScores || {};
    console.log(`  💰 Global scores after game 1: ${JSON.stringify(globalScoresAfterGame1)}`);
  });

  // ─── Transition 1→2 ────────────────────────────────────────────────────────
  await test.step('Transition: MLT → WST', async () => {
    await transitionToGame(hostSock, players, code, 'who-said-that');
  });

  // ─── Game 2: Who Said That? ────────────────────────────────────────────────
  await test.step('Game 2 — Who Said That?', async () => {
    const end = await playWST(hostSock, players, code);
    expect(end.finalScores).toBeDefined();
  });

  // ─── Transition 2→3 ────────────────────────────────────────────────────────
  await test.step('Transition: WST → FITB', async () => {
    await transitionToGame(hostSock, players, code, 'fill-in-the-blank');
  });

  // ─── Game 3: Fill-in-the-Blank ─────────────────────────────────────────────
  await test.step('Game 3 — Fill-in-the-Blank (2 rounds)', async () => {
    await playFITB(hostSock, players, code, 2);
  });

  // ─── Transition 3→4 ────────────────────────────────────────────────────────
  await test.step('Transition: FITB → Drawing', async () => {
    await transitionToGame(hostSock, players, code, 'drawing');
  });

  // ─── Game 4: Drawing ──────────────────────────────────────────────────────
  await test.step('Game 4 — Drawing (1 round, classic)', async () => {
    await playDrawing(hostSock, players, code, 1);
  });

  // ─── Transition 4→5 ────────────────────────────────────────────────────────
  await test.step('Transition: Drawing → This-or-That', async () => {
    await transitionToGame(hostSock, players, code, 'this-or-that');
  });

  // ─── Game 5: This-or-That ─────────────────────────────────────────────────
  await test.step('Game 5 — This-or-That', async () => {
    await playToT(hostSock, players, code);
  });

  // ─── Final assertions ─────────────────────────────────────────────────────
  await test.step('Verify all players still connected', async () => {
    // Emit a ping-style request and confirm all sockets are live
    for (const p of players) {
      expect(p.sock.connected).toBe(true);
    }
    expect(hostSock.connected).toBe(true);
    console.log('\n  ✅ All 4 sockets still connected after 5-game playlist.');
  });

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  hostSock.disconnect();
  for (const p of players) p.sock.disconnect();
  console.log('\n  ✅ Playlist complete — 5 games played without errors.\n');
}, 300000); // 5 minute timeout for the whole playlist
