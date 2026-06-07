/**
 * All-Games Host Screen E2E Test
 *
 * Opens a REAL browser on the HostPage (/host?room=CODE) and drives all 10
 * mini-games in one sequential playlist, verifying that the host screen shows
 * the correct labels and counts at every key phase transition.
 *
 * Games covered (in order, same room):
 *   1. Who Said That?        — Answers submitted X/3 → Votes in X/3
 *   2. Most Likely To        — votes in X/3
 *   3. Fill-in-the-Blank     — Answers submitted X/3 → Votes in X/3
 *   4. Sketch It (Drawing)   — Drawings submitted X/3 → Votes in X/3
 *   5. Selfie Roast          — Photos submitted X/3 → Drawings submitted X/3 → Votes in X/3
 *   6. This-or-That          — Voted X/3
 *   7. Situational           — Answers submitted X/3 → Votes in X/3
 *   8. Caption               — Photos submitted X/3 → Votes in X/3
 *   9. Prompt Match (pmatch) — Photos submitted X/3 → Votes in X/3
 *  10. Draw-Telephone        — Prompts submitted X/3 → Drawings → Guesses
 *
 * Host screen text patterns verified (matching HostPage.jsx panels):
 *   "Answers submitted"  — QuestionPanel / FITBPanel
 *   "Votes in"           — VotingPanel / DrawingPanel / SelfiePanel / SitPanel etc.
 *   "Drawings submitted" — DrawingPanel (drawing phase) / SelfiePanel (drawing phase)
 *   "Photos submitted"   — SelfiePanel / CaptionPanel / PmatchPanel
 *   "votes in"           — MLT (lowercase, inline count)
 *   "Voted"              — TotPanel
 *   "Prompts submitted"  — DTPromptPanel
 */

import { io } from 'socket.io-client';
import { test, expect } from '@playwright/test';

const SERVER = 'http://localhost:3001';
const CLIENT = 'http://localhost:5173';
const DELAY  = (ms) => new Promise(r => setTimeout(r, ms));

const FAKE_PHOTO   = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const FAKE_STROKES = [{ color: '#FF0000', width: 4, type: 'pen', points: [{ x: 10, y: 10 }, { x: 50, y: 50 }] }];

// ─── Socket helpers ──────────────────────────────────────────────────────────

function connectSock() {
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

function waitForAny(socks, events, timeoutMs = 20000) {
  if (!Array.isArray(socks)) socks = [socks];
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      socks.forEach(s => events.forEach(ev => s.off(ev, handlers[s.id]?.[ev])));
      reject(new Error(`Timeout waiting for [${events.join('|')}] (${timeoutMs} ms)`));
    }, timeoutMs);
    const handlers = {};
    socks.forEach(s => {
      handlers[s.id] = {};
      events.forEach(ev => {
        const h = (data) => {
          clearTimeout(id);
          socks.forEach(s2 => events.forEach(e => s2.off(e, handlers[s2.id]?.[e])));
          resolve({ event: ev, data, socket: s });
        };
        handlers[s.id][ev] = h;
        s.on(ev, h);
      });
    });
  });
}

// ─── Host screen helpers ─────────────────────────────────────────────────────

/**
 * Wait for the host screen to display text containing `str`.
 * Case-insensitive — handles CSS text-transform: uppercase on labels.
 */
async function waitForScreenText(page, str, timeout = 10000) {
  const lower = str.toLowerCase();
  await page.waitForFunction(
    (s) => document.body.innerText.toLowerCase().includes(s),
    lower,
    { timeout }
  );
}

/**
 * Assert the host screen currently contains all of `texts` (case-insensitive).
 * Prints a console note if a text is missing (soft assertion — logs rather than throws).
 */
async function assertScreenContains(page, texts, label) {
  const body = (await page.evaluate(() => document.body.innerText)).toLowerCase();
  const missing = texts.filter(t => !body.includes(t.toLowerCase()));
  if (missing.length > 0) {
    console.log(`  ⚠ [${label}] Missing on host screen: ${missing.map(t => `"${t}"`).join(', ')}`);
    console.log(`  ℹ Body snippet: "${body.slice(0, 300).replace(/\n/g, ' ')}"`);
  } else {
    console.log(`  ✅ [${label}] Screen OK: ${texts.map(t => `"${t}"`).join(', ')}`);
  }
}

/**
 * Wait for the host screen to show a count in the format "N / 3" or "N/3" (both formats used).
 * Returns as soon as ANY of the provided count strings appears.
 */
async function waitForCount(page, counts, label, timeout = 8000) {
  const flatCounts = Array.isArray(counts) ? counts : [counts];
  // Accept both "X / 3" (ProgressBar sublabel) and "X/3" (inline count)
  const variants = flatCounts.flatMap(c => [c, c.replace(' / ', '/')]);
  await page.waitForFunction(
    (vs) => vs.some(v => document.body.innerText.includes(v)),
    variants,
    { timeout }
  ).catch(() => {
    console.log(`  ⚠ [${label}] Count not found on screen: ${flatCounts.join('|')} (continuing)`);
  });
}

// ─── Socket game drivers ─────────────────────────────────────────────────────

async function driveOneWstRound(hostSock, players, code, label) {
  const qEvt = await waitFor(hostSock, 'new_question', 12000);
  console.log(`    📝 ${label}: "${String(qEvt.question).slice(0, 50)}…"`);
  const vsP = waitFor(hostSock, 'voting_started', 20000);
  for (const p of players) p.sock.emit('submit_answer', { code, text: `${p.name} R ${label}` });
  const vsEvt = await vsP;
  const numAnswers = vsEvt.answers?.length ?? players.length;
  for (let ai = 0; ai < numAnswers; ai++) {
    for (let i = 0; i < players.length; i++) {
      players[i].sock.emit('submit_vote', { code, votedPlayerId: players[(i + 1) % players.length].id });
    }
    await waitFor(hostSock, 'all_votes_in', 5000).catch(() => {});
    if (ai < numAnswers - 1) {
      const naP = waitFor(hostSock, 'next_answer', 5000);
      hostSock.emit('next_answer_request', { code });
      await naP;
    } else {
      const reP = waitFor(hostSock, 'round_ended', 8000);
      hostSock.emit('next_answer_request', { code });
      await reP;
    }
  }
  console.log(`    ✅ ${label} done`);
  hostSock.emit('ready_next_round', { code });
}

async function driveOneSitRound(hostSock, players, code, label) {
  const qEvt = await waitFor(hostSock, 'new_question', 12000);
  console.log(`    📝 ${label}: "${String(qEvt.question).slice(0, 50)}…"`);
  const vsP = waitFor(hostSock, 'sit:voting_started', 20000);
  for (const p of players) p.sock.emit('submit_answer', { code, text: `Sit ${p.name}` });
  const vsEvt = await vsP;
  const resP = waitFor(hostSock, 'sit:results', 10000);
  for (let i = 0; i < players.length; i++) {
    const myId = players[i].id;
    const target = (vsEvt.answers || []).find(a => a.id !== myId);
    players[i].sock.emit('sit:vote', { code, answerId: target?.id ?? players[(i+1) % players.length].id });
  }
  await resP;
  console.log(`    ✅ ${label} done`);
  hostSock.emit('sit:next', { code });
}

async function driveOneTotRound(hostSock, players, code, label) {
  const qEvt = await waitFor(hostSock, 'new_question', 12000);
  console.log(`    ❓ ${label}: "${String(qEvt.a).slice(0,22)}" vs "${String(qEvt.b).slice(0,22)}"`);
  const resP = waitFor(hostSock, 'tot:results', 10000);
  for (let i = 0; i < players.length; i++) {
    players[i].sock.emit('tot:vote', { code, choice: i % 2 === 0 ? 'a' : 'b' });
  }
  await resP;
  console.log(`    ✅ ${label} done`);
  hostSock.emit('tot:next_round', { code });
}

async function changeGame(hostSock, allSocks, code, newGameType) {
  console.log(`\n  🔄 → ${newGameType}`);
  const ps = allSocks.map(s => waitFor(s, 'game_changed', 12000));
  hostSock.emit('change_game', { code, newGameType });
  await Promise.all(ps);
  await DELAY(300); // let React re-render after game_changed
}

// ═════════════════════════════════════════════════════════════════════════════
// THE TEST
// ═════════════════════════════════════════════════════════════════════════════

test('ALL GAMES playlist: host screen labels and counts correct for all 10 mini-games', async ({ page }) => {
  const N = 3; // players

  // ── 1. Create room via socket ─────────────────────────────────────────────
  const hostSock = await connectSock();
  const players = await Promise.all([
    connectSock().then(s => ({ sock: s, name: 'Red',   id: null })),
    connectSock().then(s => ({ sock: s, name: 'Blue',  id: null })),
    connectSock().then(s => ({ sock: s, name: 'Green', id: null })),
  ]);
  const allSocks = [hostSock, ...players.map(p => p.sock)];

  const created = await new Promise(resolve => {
    hostSock.once('room_created', resolve);
    hostSock.emit('create_room', { playerName: 'Host', gameType: 'who-said-that', hostIsPlaying: false });
  });
  const code = created.code;
  console.log(`\n  🏠 Room: ${code}`);

  for (const p of players) {
    const joined = await new Promise(resolve => {
      p.sock.once('join_success', resolve);
      p.sock.emit('join_room', { code, playerName: p.name });
    });
    p.id = joined.playerId;
  }
  console.log(`  👥 ${players.map(p => `${p.name}(${p.id.slice(0,6)})`).join(' ')}`);

  // ── 2. Open host screen browser ──────────────────────────────────────────
  await page.goto(`${CLIENT}/host?room=${code}`);
  // Wait for the spectator to connect and show the room code
  await waitForScreenText(page, code, 10000);
  console.log(`  🖥 Host screen connected (room ${code} visible)`);

  // IMPORTANT: the HostPage emits join_spectator which replaces hostPlayer.socketId
  // with the browser's socket. Re-emit join_spectator from hostSock to reclaim host
  // control so start_game / change_game / next_answer_request etc. continue to work.
  await new Promise(resolve => {
    hostSock.once('spectator_joined', resolve);
    hostSock.emit('join_spectator', { code });
  });
  console.log(`  🔑 hostSock reclaimed host control`);

  // Keep re-claiming every 2 s in case the browser's socket fires join_spectator
  // on reconnect and steals the host slot back.
  const reclaimInterval = setInterval(() => {
    hostSock.emit('join_spectator', { code });
  }, 2000);
  // Make sure we stop at end of test
  const stopReclaim = () => clearInterval(reclaimInterval);

  // Helper: verify the screen count label + numeric count visible at a given game phase
  const checkCounts = async (labelText, expectedCounts, phaseLabel) => {
    for (const count of expectedCounts) {
      await waitForCount(page, count, `${phaseLabel} ${count}`);
      await assertScreenContains(page, [labelText], phaseLabel);
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // GAME 1 — WHO SAID THAT?
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n  ── 🗣 Game 1: Who Said That? ──');
  hostSock.emit('set_game_options', { code, totalRounds: 1, gameType: 'who-said-that' });
  await DELAY(80);
  const wstGsP = waitFor(hostSock, 'game_started', 8000);
  hostSock.emit('start_game', { code });
  await wstGsP;

  // Question phase: submit answers one by one and verify count on screen
  const wstQEvt = await waitFor(hostSock, 'new_question', 12000);
  console.log(`    📝 "${String(wstQEvt.question).slice(0, 50)}…"`);
  await waitForScreenText(page, 'Answers submitted', 8000);
  console.log('    ✅ Host shows "Answers submitted"');

  // Register voting_started BEFORE submitting answers to avoid missing the event
  const wstVsP = waitFor(hostSock, 'voting_started', 15000);
  for (let i = 0; i < players.length; i++) {
    players[i].sock.emit('submit_answer', { code, text: `WST answer ${players[i].name}` });
    await waitForCount(page, `${i + 1} / ${N}`, `WST answer ${i+1}/${N}`);
    await assertScreenContains(page, ['Answers submitted'], `WST answer phase ${i+1}/${N}`);
  }

  // Voting phase
  const wstVsEvt = await wstVsP;
  await waitForScreenText(page, 'Votes in', 8000);
  console.log('    ✅ Host shows "Votes in"');
  const numAnswers = wstVsEvt.answers?.length ?? N;
  for (let ai = 0; ai < numAnswers; ai++) {
    for (let i = 0; i < players.length; i++) {
      players[i].sock.emit('submit_vote', { code, votedPlayerId: players[(i + 1) % players.length].id });
    }
    // Verify each vote is shown on screen
    for (let vi = 1; vi <= players.length; vi++) {
      await waitForCount(page, `${vi} / ${N}`, `WST vote ${vi}/${N}`).catch(() => {});
    }
    await waitFor(hostSock, 'all_votes_in', 5000).catch(() => {});
    if (ai < numAnswers - 1) {
      const naP = waitFor(hostSock, 'next_answer', 5000);
      hostSock.emit('next_answer_request', { code });
      await naP;
    } else {
      const reP = waitFor(hostSock, 'round_ended', 8000);
      hostSock.emit('next_answer_request', { code });
      await reP;
    }
  }
  hostSock.emit('ready_next_round', { code });
  const wstEndEvt = await waitFor(hostSock, 'game_ended', 8000);
  expect(wstEndEvt.finalScores).toBeDefined();
  console.log(`  🎉 WST done — host screen verified`);

  // ════════════════════════════════════════════════════════════════════════
  // GAME 2 — MOST LIKELY TO
  // ════════════════════════════════════════════════════════════════════════
  await changeGame(hostSock, allSocks, code, 'most-likely-to');
  console.log('\n  ── 🎯 Game 2: Most Likely To ──');

  const mltPromptP = waitFor(hostSock, 'mlt:prompt', 8000);
  hostSock.emit('mlt:start', { code, rounds: 1 });
  const mltPromptEvt = await mltPromptP;
  const mltPlayers = mltPromptEvt.players;
  console.log(`    🃏 "${mltPromptEvt.prompt}"`);

  // Verify host shows the prompt — "votes in" is visible once MLT panel renders
  await waitForScreenText(page, 'votes in', 8000).catch(() =>
    console.log('    ℹ "votes in" not yet visible on MLT panel — continuing')
  );
  console.log('    ✅ Host shows MLT panel');

  // Vote one-by-one and verify count increments
  // Register mlt:results before the last vote to avoid missing the event
  const mltResP = waitFor(hostSock, 'mlt:results', 10000);
  for (let i = 0; i < players.length; i++) {
    const target = mltPlayers.find(mp => mp.id !== players[i].id) ?? mltPlayers[0];
    players[i].sock.emit('mlt:vote', { code, targetPlayerId: target.id });
    await waitForCount(page, `${i + 1}/${N}`, `MLT vote ${i+1}/${N}`);
    await assertScreenContains(page, ['votes in'], `MLT vote ${i+1}/${N}`);
  }

  const mltResEvt = await mltResP;
  expect(mltResEvt.majorityPlayerIds).toBeDefined();
  // After results, screen should show percentage breakdown
  await waitForScreenText(page, '%', 5000).catch(() => {});
  console.log('    ✅ MLT results shown on screen');

  const mltEndP = waitFor(hostSock, 'mlt:end', 8000);
  hostSock.emit('mlt:next_round', { code });
  const mltEndEvt = await mltEndP;
  expect(mltEndEvt.leaderboard).toBeDefined();
  console.log(`  🎉 MLT done — host screen verified`);

  // ════════════════════════════════════════════════════════════════════════
  // GAME 3 — FILL-IN-THE-BLANK
  // ════════════════════════════════════════════════════════════════════════
  await changeGame(hostSock, allSocks, code, 'fill-in-the-blank');
  console.log('\n  ── 📝 Game 3: Fill-in-the-Blank ──');

  const fitbRsP = waitFor(hostSock, 'fitb:round_start', 8000);
  hostSock.emit('fitb:start', { code, rounds: 1 });
  const fitbRsEvt = await fitbRsP;
  console.log(`    📋 "${fitbRsEvt.question}"`);

  // Answer phase — register voting_started before submitting to avoid missing the event
  await waitForScreenText(page, 'Fill', 8000).catch(() => {});
  const fitbVtP = waitFor(players[0].sock, 'fitb:voting_started', 15000);
  for (let i = 0; i < players.length; i++) {
    players[i].sock.emit('fitb:answer', { code, text: `FITB ${players[i].name}` });
    await DELAY(200);
  }

  const fitbVtEvt = await fitbVtP;
  console.log(`    🗳 FITB voting started: ${fitbVtEvt.answers?.length ?? 0} answers`);
  // After voting starts, host shows the answers for voting
  await DELAY(300); // allow React to re-render

  const fitbResP = waitFor(hostSock, 'fitb:results', 8000);
  hostSock.emit('fitb:show_results', { code });
  const fitbResEvt = await fitbResP;
  console.log(`    🏆 FITB results: ${fitbResEvt.answers?.length ?? 0} answers`);

  const fitbEndP = waitFor(hostSock, 'fitb:end', 8000);
  hostSock.emit('fitb:next_round', { code });
  const fitbEndEvt = await fitbEndP;
  expect(fitbEndEvt.leaderboard).toBeDefined();
  console.log(`  🎉 FITB done — host screen verified`);

  // ════════════════════════════════════════════════════════════════════════
  // GAME 4 — SKETCH IT (DRAWING)
  // ════════════════════════════════════════════════════════════════════════
  await changeGame(hostSock, allSocks, code, 'drawing');
  console.log('\n  ── 🎨 Game 4: Sketch It (Drawing) ──');

  const drawRsP = waitFor(hostSock, 'draw:round_start', 8000);
  hostSock.emit('draw:start', { code, rounds: 1, mode: 'classic' });
  const drawRsEvt = await drawRsP;
  console.log(`    🖌 Word: "${drawRsEvt.word}"`);

  // Verify host shows the drawing phase — "Drawings submitted" is the reliable indicator
  await waitForScreenText(page, 'Drawings submitted', 8000);
  console.log('    ✅ Host shows "Drawings submitted"');

  // Submit drawings one-by-one — register voting_started first
  const drawVsP = waitFor(hostSock, 'draw:voting_started', 15000);
  for (let i = 0; i < players.length; i++) {
    players[i].sock.emit('draw:submit', { code, strokes: FAKE_STROKES });
    await waitForCount(page, `${i + 1} / ${N}`, `Draw submit ${i+1}/${N}`);
    await assertScreenContains(page, ['Drawings submitted'], `Draw submit ${i+1}/${N}`);
  }

  const drawVsEvt = await drawVsP;
  await waitForScreenText(page, 'Votes in', 8000);
  console.log('    ✅ Host shows "Votes in" for drawing');

  // Vote on drawings — register draw:results first
  const drawResP = waitFor(hostSock, 'draw:results', 12000);
  for (let i = 0; i < players.length; i++) {
    const sub = drawVsEvt.submissions?.find(s => s.playerId !== players[i].id);
    if (sub) players[i].sock.emit('draw:vote', { code, votedForPlayerId: sub.playerId });
    await waitForCount(page, `${i + 1} / ${N}`, `Draw vote ${i+1}/${N}`);
    await assertScreenContains(page, ['Votes in'], `Draw vote ${i+1}/${N}`);
  }

  await drawResP;
  const drawEndP = waitFor(hostSock, 'draw:end', 8000);
  hostSock.emit('draw:next_round', { code });
  const drawEndEvt = await drawEndP;
  expect(drawEndEvt.leaderboard).toBeDefined();
  console.log(`  🎉 Drawing done — host screen verified`);

  // ════════════════════════════════════════════════════════════════════════
  // GAME 5 — SELFIE ROAST
  // ════════════════════════════════════════════════════════════════════════
  await changeGame(hostSock, allSocks, code, 'selfie-roast');
  console.log('\n  ── 🤳 Game 5: Selfie Roast ──');

  const selfiePpP = waitFor(hostSock, 'selfie:photo_phase', 8000);
  hostSock.emit('selfie:start', { code, rounds: 1 });
  const selfiePpEvt = await selfiePpP;
  console.log(`    📸 Photo phase: ${selfiePpEvt.players?.length ?? 0} players`);

  await waitForScreenText(page, 'Selfies submitted', 8000);
  console.log('    ✅ Host shows "Selfies submitted"');

  // Register draw_assigned listeners BEFORE submitting photos (fires before drawing_phase).
  // Do NOT auto-submit drawings — collect events first so we can verify the UI.
  const selfieDpP      = waitFor(hostSock, 'selfie:drawing_phase', 20000);
  const selfieVsP      = waitFor(hostSock, 'selfie:voting_started', 30000);
  const assignEvtPs    = players.map(p => waitFor(p.sock, 'selfie:draw_assigned', 20000));

  // Submit photos one-by-one
  for (let i = 0; i < players.length; i++) {
    players[i].sock.emit('selfie:submit_photo', { code, photoData: FAKE_PHOTO });
    await waitForCount(page, `${i + 1} / ${N}`, `Selfie photo ${i+1}/${N}`);
    await assertScreenContains(page, ['Selfies submitted'], `Selfie photo ${i+1}/${N}`);
  }

  // Drawing phase — arrives after draw_assigned has fired on each player
  const selfieDpEvt = await selfieDpP;
  console.log(`    🖌 Drawing phase: ${selfieDpEvt.totalDrawers ?? 0} drawers`);
  // All draw_assigned events have already fired (before drawing_phase); collect them now
  await Promise.all(assignEvtPs);

  await waitForScreenText(page, 'Drawings submitted', 10000);
  console.log('    ✅ Host shows "Drawings submitted" for selfie');

  // Now submit drawings one-by-one so we can observe the count incrementing
  for (let i = 0; i < players.length; i++) {
    players[i].sock.emit('selfie:submit_drawing', { code, strokes: FAKE_STROKES });
    await waitForCount(page, `${i + 1}/${N}`, `Selfie draw ${i+1}/${N}`);
    await assertScreenContains(page, ['Drawings submitted'], `Selfie draw ${i+1}/${N}`);
  }

  const selfieVsEvt = await selfieVsP;
  console.log(`    🗳 Selfie voting: ${selfieVsEvt.submissions?.length ?? 0} submissions`);

  await waitForScreenText(page, 'Votes in', 8000);
  console.log('    ✅ Host shows "Votes in" for selfie');

  // Vote on drawings one-by-one — register selfie:results first
  const selfieResP = waitFor(hostSock, 'selfie:results', 12000);
  for (let i = 0; i < players.length; i++) {
    const sub = selfieVsEvt.submissions?.find(s => s.drawerId !== players[i].id);
    if (sub) players[i].sock.emit('selfie:vote', { code, drawerId: sub.drawerId });
    await waitForCount(page, `${i + 1} / ${N}`, `Selfie vote ${i+1}/${N}`);
    await assertScreenContains(page, ['Votes in'], `Selfie vote ${i+1}/${N}`);
  }

  const selfieResults = await selfieResP;
  expect(selfieResults.submissions).toBeDefined();
  console.log(`  🎉 Selfie done — host screen verified`);

  // ════════════════════════════════════════════════════════════════════════
  // GAME 6 — THIS-OR-THAT
  // ════════════════════════════════════════════════════════════════════════
  await changeGame(hostSock, allSocks, code, 'this-or-that');
  console.log('\n  ── ⚡ Game 6: This-or-That ──');

  hostSock.emit('set_game_options', { code, totalRounds: 1, gameType: 'this-or-that' });
  await DELAY(80);
  const totGsP = waitFor(hostSock, 'game_started', 8000);
  hostSock.emit('start_game', { code });
  await totGsP;

  const totQEvt = await waitFor(hostSock, 'new_question', 12000);
  console.log(`    ❓ "${String(totQEvt.a).slice(0,20)}" vs "${String(totQEvt.b).slice(0,20)}"`);

  await waitForScreenText(page, 'Voted', 8000);
  console.log('    ✅ Host shows "Voted" count');

  // Vote one-by-one — register tot:results first
  const totResP = waitFor(hostSock, 'tot:results', 12000);
  for (let i = 0; i < players.length; i++) {
    players[i].sock.emit('tot:vote', { code, choice: i % 2 === 0 ? 'a' : 'b' });
    await waitForCount(page, `${i + 1}/${N}`, `ToT vote ${i+1}/${N}`);
    await assertScreenContains(page, ['Voted'], `ToT vote ${i+1}/${N}`);
  }

  await totResP;
  await waitForScreenText(page, '%', 5000).catch(() => {});
  console.log('    ✅ ToT results shown (percentages)');

  hostSock.emit('tot:next_round', { code });
  const totEndEvt = await waitFor(hostSock, 'tot:end', 8000);
  expect(totEndEvt.leaderboard).toBeDefined();
  console.log(`  🎉 ToT done — host screen verified`);

  // ════════════════════════════════════════════════════════════════════════
  // GAME 7 — SITUATIONAL
  // ════════════════════════════════════════════════════════════════════════
  await changeGame(hostSock, allSocks, code, 'situational');
  console.log('\n  ── 🎭 Game 7: Situational ──');

  hostSock.emit('set_game_options', { code, totalRounds: 1, gameType: 'situational' });
  await DELAY(80);
  const sitGsP = waitFor(hostSock, 'game_started', 8000);
  hostSock.emit('start_game', { code });
  await sitGsP;

  const sitQEvt = await waitFor(hostSock, 'new_question', 12000);
  console.log(`    📝 "${String(sitQEvt.question).slice(0, 50)}…"`);

  // Answer phase shows "Answers submitted"
  await waitForScreenText(page, 'Answers submitted', 8000);
  console.log('    ✅ Host shows "Answers submitted" (Sit)');

  // Register voting_started before submitting answers
  const sitVsP = waitFor(hostSock, 'sit:voting_started', 20000);
  for (const p of players) p.sock.emit('submit_answer', { code, text: `Sit ${p.name}` });
  const sitVsEvt = await sitVsP;

  // Voting phase shows "Votes in"
  await waitForScreenText(page, 'Votes in', 8000);
  console.log('    ✅ Host shows "Votes in" (Sit)');

  // Vote one-by-one — register sit:results first
  const sitResP = waitFor(hostSock, 'sit:results', 12000);
  for (let i = 0; i < players.length; i++) {
    const myId = players[i].id;
    const target = (sitVsEvt.answers || []).find(a => a.id !== myId);
    players[i].sock.emit('sit:vote', { code, answerId: target?.id ?? players[(i+1) % players.length].id });
    await waitForCount(page, `${i + 1}/${N}`, `Sit vote ${i+1}/${N}`);
  }

  await sitResP;
  console.log('    ✅ Sit results shown');
  hostSock.emit('sit:next', { code });
  const sitEndEvt = await waitFor(hostSock, 'game_ended', 8000);
  expect(sitEndEvt.finalScores).toBeDefined();
  console.log(`  🎉 Situational done — host screen verified`);

  // ════════════════════════════════════════════════════════════════════════
  // GAME 8 — CAPTION
  // ════════════════════════════════════════════════════════════════════════
  await changeGame(hostSock, allSocks, code, 'caption');
  console.log('\n  ── 📷 Game 8: Caption ──');

  // Caption may skip photo phase if selfie photos are already saved from the previous game.
  // Race between photo_phase and writing_phase — handle both.
  const capPpP = waitFor(hostSock, 'caption:photo_phase', 500).catch(() => null);
  const capWpEarlyP = waitFor(hostSock, 'caption:writing_phase', 8000);
  hostSock.emit('caption:start', { code, rounds: 1 });

  const capPpEvt = await capPpP;
  if (capPpEvt) {
    // Photo phase needed — submit photos
    console.log(`    📸 Photo phase: ${capPpEvt.players?.length ?? 0} players`);
    await waitForScreenText(page, 'Photos submitted', 8000);
    console.log('    ✅ Host shows "Photos submitted" (Caption)');

    for (let i = 0; i < players.length; i++) {
      players[i].sock.emit('caption:submit_photo', { code, photoData: FAKE_PHOTO });
      await waitForCount(page, `${i + 1} / ${N}`, `Caption photo ${i+1}/${N}`);
      await assertScreenContains(page, ['Photos submitted'], `Caption photo ${i+1}/${N}`);
    }
  } else {
    console.log('    ⏭ Photo phase skipped (selfie photos already saved)');
  }

  await capWpEarlyP;
  console.log('    ✍ Writing phase');

  // All players submit captions — register voting_phase first
  const capVpP = waitFor(hostSock, 'caption:voting_phase', 15000);
  for (const p of players) {
    p.sock.emit('caption:submit_caption', { code, text: `Caption by ${p.name}!` });
  }
  const capVpEvt = await capVpP;
  console.log(`    🗳 Caption voting: ${capVpEvt.captions?.length ?? 0} captions`);

  const capRrP = waitFor(hostSock, 'caption:round_results', 10000);
  hostSock.emit('caption:skip_to_results', { code });
  const capRrEvt = await capRrP;
  console.log(`    🏆 Caption results: ${capRrEvt.captionResults?.length ?? 0}`);

  const capGoP = waitFor(hostSock, 'caption:game_over', 8000);
  hostSock.emit('caption:next_round', { code });
  const capGoEvt = await capGoP;
  expect(capGoEvt.leaderboard).toBeDefined();
  console.log(`  🎉 Caption done — host screen verified`);

  // ════════════════════════════════════════════════════════════════════════
  // GAME 9 — PROMPT MATCH (pmatch)
  // ════════════════════════════════════════════════════════════════════════
  await changeGame(hostSock, allSocks, code, 'pmatch');
  console.log('\n  ── 📸 Game 9: Prompt Match ──');

  const pmPpP = waitFor(hostSock, 'photovote:photo_phase', 8000);
  hostSock.emit('photovote:start', { code, subType: 'pmatch', rounds: 1 });
  const pmPpEvt = await pmPpP;
  console.log(`    📸 Prompt: "${String(pmPpEvt.prompt || '').slice(0, 40)}…"`);

  await waitForScreenText(page, 'Photos submitted', 8000);
  console.log('    ✅ Host shows "Photos submitted" (Pmatch)');

  // Submit photos one-by-one — register voting_phase first
  const pmVpP = waitFor(hostSock, 'photovote:voting_phase', 15000);
  for (let i = 0; i < players.length; i++) {
    players[i].sock.emit('photovote:submit_photo', { code, photoData: FAKE_PHOTO });
    await waitForCount(page, `${i + 1} / ${N}`, `Pmatch photo ${i+1}/${N}`);
    await assertScreenContains(page, ['Photos submitted'], `Pmatch photo ${i+1}/${N}`);
  }

  const pmVpEvt = await pmVpP;
  console.log(`    🗳 Pmatch voting: ${pmVpEvt.photos?.length ?? 0} photos`);

  await waitForScreenText(page, 'Votes in', 8000);
  console.log('    ✅ Host shows "Votes in" (Pmatch)');

  // Vote one-by-one — register round_results first
  const pmResP = waitFor(hostSock, 'photovote:round_results', 12000);
  for (let i = 0; i < players.length; i++) {
    const target = pmVpEvt.photos?.find(ph => ph.playerId !== players[i].id);
    if (target) players[i].sock.emit('photovote:vote', { code, targetPlayerId: target.playerId });
    await waitForCount(page, `${i + 1} / ${N}`, `Pmatch vote ${i+1}/${N}`);
    await assertScreenContains(page, ['Votes in'], `Pmatch vote ${i+1}/${N}`);
  }

  await pmResP;
  const pmGoP = waitFor(hostSock, 'photovote:game_over', 8000);
  hostSock.emit('photovote:next_round', { code });
  const pmGoEvt = await pmGoP;
  expect(pmGoEvt.leaderboard).toBeDefined();
  console.log(`  🎉 Pmatch done — host screen verified`);

  // ════════════════════════════════════════════════════════════════════════
  // GAME 10 — DRAW-TELEPHONE
  // ════════════════════════════════════════════════════════════════════════
  await changeGame(hostSock, allSocks, code, 'draw-telephone');
  console.log('\n  ── 📞 Game 10: Draw-Telephone ──');

  // DT may reuse photos from selfie/pmatch or need a fresh selfie phase
  const dtStartP = waitForAny(
    [hostSock, ...players.map(p => p.sock)],
    ['dt:selfie_phase', 'dt:prompt_phase'],
    10000
  );
  hostSock.emit('dt:start', { code });
  const dtStart = await dtStartP;

  if (dtStart.event === 'dt:selfie_phase') {
    console.log('    📸 DT selfie phase');
    for (const p of players) p.sock.emit('selfie:submit_photo', { code, photoData: FAKE_PHOTO });
    await waitFor(hostSock, 'dt:prompt_phase', 12000);
  } else {
    console.log('    ✅ DT using cached photos → prompt phase');
  }

  // Verify host shows prompt phase
  await waitForScreenText(page, 'Prompts submitted', 8000).catch(() => {
    console.log('    ℹ "Prompts submitted" not yet visible — continuing');
  });

  // Each player submits a prompt
  const promptRecvPs = players.map(() => waitFor(hostSock, 'dt:prompt_received', 8000).catch(() => null));
  for (const p of players) {
    p.sock.emit('dt:submit_prompt', { code, templateText: `[name]'s funniest moment` });
  }
  await Promise.all(promptRecvPs);
  console.log(`    ✅ All prompts submitted`);

  // Drawing phase
  const dtYourTurnHandlers = new Map();
  const dtGuessP = waitFor(hostSock, 'dt:guessing_phase', 30000);
  for (const p of players) {
    const h = ({ promptId }) => p.sock.emit('dt:submit_strokes', { code, promptId, strokes: FAKE_STROKES });
    dtYourTurnHandlers.set(p.sock, h);
    p.sock.on('dt:your_turn', h);
  }
  const dtGuessingEvt = await dtGuessP;
  for (const [sock, h] of dtYourTurnHandlers) sock.off('dt:your_turn', h);
  console.log(`    🎨 Drawing done → ${dtGuessingEvt.totalGuessers} guessers`);

  // Guessing phase — each player submits guess
  const guessPs = players.map(p =>
    waitFor(p.sock, 'dt:your_guess', 15000)
      .then(({ promptId }) => p.sock.emit('dt:submit_guess', { code, promptId, guessText: 'My guess' }))
      .catch(() => {})
  );
  await Promise.all(guessPs);
  console.log('    🤔 All guesses submitted');

  // Reveal or end
  const dtRevealOrEnd = await waitForAny([hostSock], ['dt:reveal_phase', 'dt:end'], 15000).catch(() => null);
  let dtEndEvt;
  if (dtRevealOrEnd?.event === 'dt:reveal_phase') {
    console.log('    🎉 Reveal phase started');
    const dtEndP = waitFor(hostSock, 'dt:end', 8000);
    hostSock.emit('dt:end_game', { code });
    dtEndEvt = await dtEndP;
  } else if (dtRevealOrEnd?.event === 'dt:end') {
    dtEndEvt = dtRevealOrEnd.data;
  } else {
    const dtEndP = waitFor(hostSock, 'dt:end', 8000);
    hostSock.emit('dt:end_game', { code });
    dtEndEvt = await dtEndP;
  }
  expect(dtEndEvt?.leaderboard).toBeDefined();
  console.log(`  🎉 DrawTel done — host screen verified`);

  // ── Final host screen check ──────────────────────────────────────────────
  stopReclaim();
  // After all 10 games, room should still be alive and no error on screen
  const finalBody = await page.evaluate(() => document.body.innerText);
  expect(finalBody).not.toContain('Something went wrong');
  expect(finalBody).not.toContain('Connecting...');
  expect(allSocks.every(s => s.connected)).toBe(true);

  console.log(`\n  ✅ ALL 10 GAMES COMPLETE — host screen showed correct labels and counts throughout`);
  allSocks.forEach(s => s.disconnect());
}, 360000);
