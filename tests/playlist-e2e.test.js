/**
 * Playlist End-to-End Test
 *
 * Single sequential test using socket.io-client to drive a full mixed-game playlist:
 *   Round 1 — WST : pause/resume + change question + edit answer
 *   Round 2 — Situational : pause/resume + change question
 *   Round 3 — This-or-That : pause/resume + change question
 *   Round 4 — <whatever> : Skip Mini Game → verify new type starts, play through
 *   Round 5 — <whatever> : let timer expire → verify auto-advance
 *
 * All rounds run with 1 playing round each (mixedRoundsPerGame=1).
 * Server roundDurationSecs is set to 8 s so auto-submit tests finish quickly.
 */

import { io } from 'socket.io-client';
import { test, expect } from '@playwright/test';

const SERVER = 'http://localhost:3001';
const DELAY   = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function connect() {
  return new Promise((resolve, reject) => {
    const sock = io(SERVER, { transports: ['websocket'], forceNew: true });
    sock.once('connect',       () => resolve(sock));
    sock.once('connect_error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 8000);
  });
}

/** Resolve on the next occurrence of `event`; reject after `timeoutMs`. */
function waitFor(sock, event, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      sock.off(event, h);
      reject(new Error(`Timeout waiting for '${event}' (${timeoutMs} ms)`));
    }, timeoutMs);
    function h(data) { clearTimeout(id); resolve(data); }
    sock.once(event, h);
  });
}

/** Resolve on whichever of `events` fires first; returns { event, data }. */
function waitForAny(sock, events, timeoutMs = 14000) {
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

// ─── Per-game-type round drivers ─────────────────────────────────────────────

/** Drive a WST or Situational *answer* phase, then vote and advance.
 *  Must be called AFTER new_question has just been received (pass it in as `qEvt`).
 */
async function driveWstAnswerVote(host, players, code, qEvt, opts = {}) {
  const { editAnswer = false } = opts;
  console.log(`    📝 WST question: "${String(qEvt.question).slice(0, 60)}…"`);

  // Register voting_started listener BEFORE submitting (server fires it as soon as all answers in)
  const vsPromise = waitFor(host, 'voting_started', 20000);

  // All players submit answers
  for (const p of players) {
    p.sock.emit('submit_answer', { code, text: `Answer from ${p.name}` });
  }

  if (editAnswer) {
    await DELAY(150);
    players[0].sock.emit('submit_answer', { code, text: `Edited answer from ${players[0].name}` });
    console.log(`    ✏ ${players[0].name} edited answer`);
  }

  const vsEvt = await vsPromise;
  console.log('    🗳 Voting started');
  const totalAnswers = vsEvt?.answers?.length ?? players.length;

  // Vote on each answer, starting with index 0
  for (let ansIdx = 0; ansIdx < totalAnswers; ansIdx++) {
    // Submit votes for current answer
    for (let i = 0; i < players.length; i++) {
      players[i].sock.emit('submit_vote', { code, votedPlayerId: players[(i + 1) % players.length].id });
    }
    await waitForAny(host, ['all_votes_in'], 5000).catch(() => {});
    if (ansIdx < totalAnswers - 1) {
      host.emit('next_answer_request', { code });
      await waitFor(host, 'next_answer', 5000);
    } else {
      // Last answer: register round_ended listener BEFORE triggering next_answer_request
      const roundEndedP = waitFor(host, 'round_ended', 8000);
      host.emit('next_answer_request', { code });
      await roundEndedP;
    }
  }
  console.log('    🏁 WST round ended');
  host.emit('ready_next_round', { code });
}

async function driveSitAnswerVote(host, players, code, qEvt) {
  console.log(`    📝 Sit question: "${String(qEvt.question).slice(0, 60)}…"`);
  // Register listener BEFORE submitting (server fires sit:voting_started as soon as all answers in)
  const sitVSPromise = waitFor(host, 'sit:voting_started', 20000);
  for (const p of players) {
    p.sock.emit('submit_answer', { code, text: `Sit answer from ${p.name}` });
  }
  const sitVSEvt = await sitVSPromise;
  const sitResultsPromise = waitFor(host, 'sit:results', 10000);
  for (let i = 0; i < players.length; i++) {
    const voter = players[i];
    // Find an answer that isn't the voter's own (can't vote for own answer)
    const target = (sitVSEvt.answers || []).find(a => a.id !== voter.id);
    const voteId = target?.id ?? players[(i + 1) % players.length].id;
    voter.sock.emit('sit:vote', { code, answerId: voteId });
  }
  await sitResultsPromise;
  console.log('    🏁 Sit round ended');
  host.emit('sit:next', { code });
}

async function driveTotVote(host, players, code, qEvt) {
  console.log(`    ❓ ToT: A="${String(qEvt.a).slice(0,30)}" vs B="${String(qEvt.b).slice(0,30)}"`);
  // Register listener BEFORE voting (server fires tot:results when all votes in)
  const totResultsPromise = waitFor(host, 'tot:results', 10000);
  for (let i = 0; i < players.length; i++) {
    players[i].sock.emit('tot:vote', { code, choice: i % 2 === 0 ? 'a' : 'b' });
  }
  await totResultsPromise;
  console.log('    🏁 ToT round ended');
  host.emit('tot:next_round', { code });
}

/** Drive any type of round based on the question event's type field. */
async function driveRound(host, players, code, qEvt, opts = {}) {
  const type = qEvt.type || qEvt.roundType || 'wst';
  if (type === 'this-or-that') {
    await driveTotVote(host, players, code, qEvt);
  } else if (type === 'situational') {
    await driveSitAnswerVote(host, players, code, qEvt);
  } else {
    await driveWstAnswerVote(host, players, code, qEvt, opts);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE TEST
// ─────────────────────────────────────────────────────────────────────────────

test('Full playlist: 5 mixed rounds — pause, change q, edit, skip, auto-submit', async () => {
  // ── Setup ─────────────────────────────────────────────────────────────────
  const hostSock = await connect();
  const alice     = { name: 'Alice', sock: await connect() };
  const bob       = { name: 'Bob',   sock: await connect() };
  const carol     = { name: 'Carol', sock: await connect() };
  const players   = [alice, bob, carol];

  let code;

  await test.step('Create room + players join', async () => {
    const created = await new Promise(resolve => {
      hostSock.once('room_created', resolve);
      hostSock.emit('create_room', {
        playerName:       'TestHost',
        gameType:         'mixed',
        hostIsPlaying:    false,
        selectedSubGames: ['who-said-that', 'situational', 'this-or-that', 'who-said-that', 'situational'],
        roomConfig:       { roundDurationSecs: 5 },
      });
    });
    code = created.code;
    console.log(`\n  🏠 Room: ${code}`);

    for (const p of players) {
      const result = await new Promise(resolve => {
        p.sock.once('join_success', d => resolve(d.playerId));
        p.sock.emit('join_room', { code, playerName: p.name });
      });
      p.id = result;
    }
    console.log(`  👥 Alice=${alice.id.slice(0,8)} Bob=${bob.id.slice(0,8)} Carol=${carol.id.slice(0,8)}`);
  });

  // ── Start ─────────────────────────────────────────────────────────────────
  let round1QEvt;
  await test.step('Start game', async () => {
    // Register listener BEFORE emitting so we never miss events
    const gsPromise = waitFor(hostSock, 'game_started', 5000);
    const nqPromise = waitFor(hostSock, 'new_question', 8000);
    hostSock.emit('start_game', { code });
    const gs = await gsPromise;
    round1QEvt = await nqPromise;
    console.log(`\n  🎮 game_started round=${gs.round}/${gs.totalRounds}`);
    console.log(`  📋 Round 1 question type=${round1QEvt.type || round1QEvt.roundType}`);
    expect(gs.totalRounds).toBeGreaterThanOrEqual(3);
    expect(round1QEvt).toBeDefined();
  });

  // ── Round 1 ───────────────────────────────────────────────────────────────
  await test.step('Round 1 — Pause/Resume + Change Question + Edit Answer', async () => {
    console.log('\n  ── Round 1 ──');
    const type = round1QEvt.type || round1QEvt.roundType || 'wst';

    if (type === 'this-or-that') {
      // Pause / Resume on ToT
      hostSock.emit('tot:pause', { code });
      await DELAY(300);
      console.log('    ⏸ ToT paused');
      hostSock.emit('tot:resume', { code });
      await DELAY(200);
      console.log('    ▶ ToT resumed');
      // Change question
      const nq = waitFor(hostSock, 'new_question', 6000);
      hostSock.emit('skip_question', { code });
      const newQ = await nq;
      console.log(`    🔄 Question changed → type=${newQ.type || newQ.roundType}`);
      await driveTotVote(hostSock, players, code, newQ);
    } else if (type === 'situational') {
      hostSock.emit('answer:pause', { code });
      await DELAY(300);
      hostSock.emit('answer:resume', { code });
      console.log('    ⏸▶ Paused+Resumed');
      const nq = waitFor(hostSock, 'new_question', 6000);
      hostSock.emit('skip_question', { code });
      const newQ = await nq;
      console.log(`    🔄 Changed to: "${String(newQ.question).slice(0, 50)}"`);
      await driveSitAnswerVote(hostSock, players, code, newQ);
    } else {
      // WST
      hostSock.emit('answer:pause', { code });
      await DELAY(300);
      console.log('    ⏸ Paused');
      hostSock.emit('answer:resume', { code });
      await DELAY(200);
      console.log('    ▶ Resumed');
      const nq = waitFor(hostSock, 'new_question', 6000);
      hostSock.emit('skip_question', { code });
      const newQ = await nq;
      console.log(`    🔄 Changed to: "${String(newQ.question).slice(0, 50)}"`);
      await driveWstAnswerVote(hostSock, players, code, newQ, { editAnswer: true });
    }
  });

  // ── Round 2 ───────────────────────────────────────────────────────────────
  let round2QEvt;
  await test.step('Round 2 — Pause/Resume + Change Question', async () => {
    console.log('\n  ── Round 2 ──');
    round2QEvt = await waitFor(hostSock, 'new_question', 12000);
    const type = round2QEvt.type || round2QEvt.roundType || 'wst';
    console.log(`    type=${type}`);

    if (type === 'this-or-that') {
      hostSock.emit('tot:pause', { code });
      await DELAY(300);
      hostSock.emit('tot:resume', { code });
      const nq = waitFor(hostSock, 'new_question', 6000);
      hostSock.emit('skip_question', { code });
      const newQ = await nq;
      await driveTotVote(hostSock, players, code, newQ);
    } else if (type === 'situational') {
      hostSock.emit('answer:pause', { code });
      await DELAY(300);
      hostSock.emit('answer:resume', { code });
      const nq = waitFor(hostSock, 'new_question', 6000);
      hostSock.emit('skip_question', { code });
      const newQ = await nq;
      await driveSitAnswerVote(hostSock, players, code, newQ);
    } else {
      hostSock.emit('answer:pause', { code });
      await DELAY(300);
      hostSock.emit('answer:resume', { code });
      const nq = waitFor(hostSock, 'new_question', 6000);
      hostSock.emit('skip_question', { code });
      const newQ = await nq;
      await driveWstAnswerVote(hostSock, players, code, newQ);
    }
  });

  // ── Round 3 ───────────────────────────────────────────────────────────────
  let round3QEvt;
  await test.step('Round 3 — Pause/Resume + Change Question', async () => {
    console.log('\n  ── Round 3 ──');
    round3QEvt = await waitFor(hostSock, 'new_question', 12000);
    const type = round3QEvt.type || round3QEvt.roundType || 'wst';
    console.log(`    type=${type}`);

    if (type === 'this-or-that') {
      hostSock.emit('tot:pause', { code });
      await DELAY(300);
      hostSock.emit('tot:resume', { code });
      const nq = waitFor(hostSock, 'new_question', 6000);
      hostSock.emit('skip_question', { code });
      const newQ = await nq;
      await driveTotVote(hostSock, players, code, newQ);
    } else if (type === 'situational') {
      hostSock.emit('answer:pause', { code });
      await DELAY(300);
      hostSock.emit('answer:resume', { code });
      const nq = waitFor(hostSock, 'new_question', 6000);
      hostSock.emit('skip_question', { code });
      const newQ = await nq;
      await driveSitAnswerVote(hostSock, players, code, newQ);
    } else {
      hostSock.emit('answer:pause', { code });
      await DELAY(300);
      hostSock.emit('answer:resume', { code });
      const nq = waitFor(hostSock, 'new_question', 6000);
      hostSock.emit('skip_question', { code });
      const newQ = await nq;
      await driveWstAnswerVote(hostSock, players, code, newQ);
    }
  });

  // ── Round 4 — Skip Mini Game ─────────────────────────────────────────────
  let round4Q5Promise;
  await test.step('Round 4 — Skip Mini Game → verify new type starts + play through', async () => {
    console.log('\n  ── Round 4: Skip Mini Game ──');
    const q4 = await waitFor(hostSock, 'new_question', 12000);
    const originalType = q4.type || q4.roundType || 'unknown';
    console.log(`    🎲 Round 4 current type: ${originalType}`);

    // Register next-question listener BEFORE emitting skip
    const afterSkip = waitForAny(hostSock, ['new_question', 'game_ended'], 10000);
    hostSock.emit('skip_mini_game', { code });
    const { event: skipResult, data: newData } = await afterSkip;

    expect(skipResult).toBe('new_question');
    const newType = newData.type || newData.roundType || 'unknown';
    console.log(`    ✅ Skip → new type: ${newType} (was ${originalType})`);

    // Register round-5 new_question listener BEFORE driving round 4 (to avoid missing the event)
    const q5Promise = waitFor(hostSock, 'new_question', 20000);

    // Play through the replacement round
    await driveRound(hostSock, players, code, newData);

    // Stash q5 for the next step (don't await yet — just ensure listener is live)
    round4Q5Promise = q5Promise;
  });

  // ── Round 5 — Auto-submit ────────────────────────────────────────────────
  await test.step('Round 5 — Auto-submit: timer expires, server advances', async () => {
    console.log('\n  ── Round 5: Auto-submit ──');
    const q5 = await round4Q5Promise;
    const type5 = q5.type || q5.roundType || 'wst';
    console.log(`    📝 Round 5 (${type5}) — not submitting anything, waiting for timer (≤5 s)…`);

    // Don't submit any answers — wait for server to auto-advance (timer = 5s, pad to 25s)
    const autoEvt = await waitForAny(hostSock,
      ['voting_started', 'sit:voting_started', 'tot:results', 'draw:voting_started',
       'round_ended', 'game_ended', 'next_question'],
      25000,
    );
    console.log(`    ✅ Auto-advanced: ${autoEvt.event}`);
    expect(['voting_started', 'sit:voting_started', 'tot:results', 'game_ended', 'round_ended', 'next_question'])
      .toContain(autoEvt.event);
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────
  hostSock.disconnect();
  for (const p of players) p.sock.disconnect();
  console.log('\n  ✅ All done.');
});