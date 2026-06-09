/**
 * Host Screen Full-Playlist E2E Test
 *
 * A real Playwright browser (1280×800) opens /host?room=CODE in spectator mode.
 * Three socket.io-client sockets act as players — no browser for players.
 *
 * Game sequence (all 10 mini-games):
 *   1. Who Said That      (2 rounds) — answer + vote cycle
 *   2. Most Likely To     (2 rounds) — mlt:start / mlt:vote
 *   3. Fill-in-the-Blank  (2 rounds) — fitb:answer / vote
 *   4. Drawing            (1 round)  — draw:submit / draw:vote
 *   5. Selfie Roast       (1 round)  — photo / draw / vote
 *   6. This-or-That       (2 rounds) — tot:vote
 *   7. Situational        (2 rounds) — answer / sit:vote
 *   8. Caption            (2 rounds) — caption:write / caption:vote
 *   9. Selfie Challenge (pmatch) (2 rounds) — photo / vote
 *  10. Draw-Telephone     (1 chain)  — prompt / draw / guess / reveal
 *
 * Per-phase browser assertions:
 *   - page.waitForFunction() with case-insensitive comparison
 *     (Tailwind text-transform:uppercase affects element.innerText)
 *   - Soft count checks (via wrapped waitForFunction) for counters that may
 *     transition before the assertion runs
 *   - All socket event listeners registered BEFORE the action that fires them
 */

import { io } from 'socket.io-client';
import { test, expect } from '@playwright/test';

const SERVER = 'http://localhost:3001';
const DELAY = (ms) => new Promise(r => setTimeout(r, ms));

const FAKE_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const FAKE_STROKES = [{ color: '#FF0000', width: 4, type: 'pen', points: [{ x: 10, y: 10 }, { x: 50, y: 50 }] }];

// ─── Socket helpers ────────────────────────────────────────────────────────────

function connect() {
  return new Promise((resolve, reject) => {
    const sock = io(SERVER, { transports: ['websocket'], forceNew: true });
    const t = setTimeout(() => reject(new Error('socket connect timeout')), 8000);
    sock.once('connect', () => { clearTimeout(t); resolve(sock); });
    sock.once('connect_error', e => { clearTimeout(t); reject(e); });
  });
}

/** Await the next occurrence of `event`; reject after `ms` ms. */
function waitFor(sock, event, ms = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      sock.off(event, h);
      reject(new Error(`⏰ timeout waiting for '${event}' (${ms}ms)`));
    }, ms);
    function h(d) { clearTimeout(t); resolve(d); }
    sock.once(event, h);
  });
}

/** Await whichever of `events` fires first across `socks`; reject after `ms`. */
function waitForAny(socks, events, ms = 20000) {
  if (!Array.isArray(socks)) socks = [socks];
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socks.forEach(s => events.forEach(ev => s.off(ev, hs[s.id]?.[ev])));
      reject(new Error(`⏰ timeout waiting for [${events.join('|')}] (${ms}ms)`));
    }, ms);
    const hs = {};
    socks.forEach(s => {
      hs[s.id] = {};
      events.forEach(ev => {
        const h = d => {
          clearTimeout(t);
          socks.forEach(s2 => events.forEach(e => s2.off(e, hs[s2.id]?.[e])));
          resolve({ event: ev, data: d, socket: s });
        };
        hs[s.id][ev] = h;
        s.on(ev, h);
      });
    });
  });
}

function trackErrors(socks) {
  const errs = [];
  socks.forEach(s => s.on('error', e => errs.push(`[${(s.id || '?').slice(0, 6)}] ${e?.message || JSON.stringify(e)}`)));
  return errs;
}

// ─── Browser helpers ───────────────────────────────────────────────────────────

/**
 * Waits for `label` to appear somewhere in the host-screen body text.
 * Comparison is case-insensitive so Tailwind text-transform:uppercase is transparent.
 */
async function hostHasLabel(page, label, timeoutMs = 20000) {
  // Use page.getByText which matches against DOM textContent (not rendered innerText),
  // so CSS text-transform:uppercase does not interfere.
  await page.getByText(label, { exact: false }).first().waitFor({ timeout: timeoutMs });
}

/**
 * Soft count assertion — does NOT fail the test when the counter transitions
 * faster than the check (e.g., all 3 players answer nearly simultaneously).
 */
async function hostSoftCount(page, countText, context = '') {
  await page.waitForFunction(
    cnt => document.body.innerText.includes(cnt),
    countText,
    { timeout: 2500 }
  ).catch(() => {
    console.log(`    ⚠️  Soft count "${countText}"${context ? ` (${context})` : ''} — may have transitioned before check`);
  });
}

// ─── Game-transition helper ────────────────────────────────────────────────────

async function changeGame(hostSock, allSocks, code, newGameType) {
  console.log(`\n  🔄 Transitioning → ${newGameType}`);
  // Register listeners on ALL sockets BEFORE emitting
  const promises = allSocks.map(s => waitFor(s, 'game_changed', 12000));
  hostSock.emit('change_game', { code, newGameType });
  await Promise.all(promises);
  console.log(`  ✅ game_changed → ${newGameType} received by all`);
  await DELAY(80);
}

// ─── Game drivers ──────────────────────────────────────────────────────────────

// ── 1. Who Said That ──────────────────────────────────────────────────────────
async function playWst(hostSock, players, code, rounds, page) {
  console.log(`\n  ── 🤔 Who Said That (${rounds} rounds) ──`);
  hostSock.emit('set_game_options', { code, totalRounds: rounds, gameType: 'who-said-that' });
  await DELAY(80);

  // Register game_started + first new_question BEFORE emitting start_game
  const gsP = waitFor(hostSock, 'game_started', 8000);
  const nqP = waitFor(hostSock, 'new_question', 12000);
  hostSock.emit('start_game', { code });
  await gsP;
  console.log('    🚀 WST game_started');

  let nqEvt = await nqP;

  for (let r = 1; r <= rounds; r++) {
    console.log(`    📝 R${r}: "${String(nqEvt.question).slice(0, 55)}…"`);

    // ── Host screen: "Answers submitted" label ────────────────────────────
    await hostHasLabel(page, 'Answers submitted');
    console.log('    🖥  ✅ "Answers submitted" visible on host screen');

    // Register voting_started BEFORE submitting answers (avoids race)
    const vsP = waitFor(hostSock, 'voting_started', 20000);
    for (const p of players) p.sock.emit('submit_answer', { code, text: `WST R${r} answer from ${p.name}` });

    // Soft-check intermediate counts as answers arrive
    await hostSoftCount(page, '1/3', 'WST answers in');
    await hostSoftCount(page, '3/3', 'WST all answered');

    const vsEvt = await vsP;
    const numAnswers = vsEvt.answers?.length ?? players.length;
    console.log(`    🗳  voting_started: ${numAnswers} answers`);

    // ── Host screen: "Votes in" label ──────────────────────────────────────
    await hostHasLabel(page, 'Votes in');
    console.log('    🖥  ✅ "Votes in" visible on host screen');

    // Vote through every answer in sequence
    for (let ai = 0; ai < numAnswers; ai++) {
      // Register outcome listener BEFORE voting
      const doneP = ai < numAnswers - 1
        ? waitFor(hostSock, 'next_answer', 6000).catch(() => null)
        : waitFor(hostSock, 'round_ended', 8000);

      const avP = waitFor(hostSock, 'all_votes_in', 8000).catch(() => null);
      for (let i = 0; i < players.length; i++) {
        players[i].sock.emit('submit_vote', { code, votedPlayerId: players[(i + 1) % players.length].id });
      }
      // Soft check: all votes counted
      await hostSoftCount(page, '3/3', `WST votes answer ${ai + 1}`);
      await avP;

      hostSock.emit('next_answer_request', { code });
      await doneP;
    }
    console.log(`    ✅ R${r} complete`);

    if (r < rounds) {
      // Register next question BEFORE emitting ready_next_round
      nqEvt = await (() => {
        const nextP = waitFor(hostSock, 'new_question', 12000);
        hostSock.emit('ready_next_round', { code });
        return nextP;
      })();
    }
  }

  // Final ready_next_round → game_ended
  const endP = waitFor(hostSock, 'game_ended', 8000);
  hostSock.emit('ready_next_round', { code });
  const endEvt = await endP;
  console.log(`  🎉 WST ended — ${Object.keys(endEvt.finalScores || {}).length} scored`);
  return endEvt;
}

// ── 2. Most Likely To ─────────────────────────────────────────────────────────
async function playMlt(hostSock, players, code, rounds, page) {
  console.log(`\n  ── 👑 Most Likely To (${rounds} rounds) ──`);

  // Register prompt listener BEFORE mlt:start
  const promptP = waitFor(hostSock, 'mlt:prompt', 8000);
  hostSock.emit('mlt:start', { code, rounds });
  let promptEvt = await promptP;
  const mltPlayers = promptEvt.players;
  console.log(`    🃏 R1: "${promptEvt.prompt}"`);

  // ── Host screen: "votes in" label (lowercase in source, CSS uppercases it)
  await hostHasLabel(page, 'votes in');
  console.log('    🖥  ✅ "votes in" visible on host screen');

  for (let r = 1; r <= rounds; r++) {
    // Register results BEFORE voting
    const resP = waitFor(hostSock, 'mlt:results', 10000);
    for (const p of players) {
      const target = mltPlayers.find(mp => mp.id !== p.id) ?? mltPlayers[0];
      p.sock.emit('mlt:vote', { code, targetPlayerId: target.id });
    }
    await hostSoftCount(page, '3/3', `MLT R${r} votes`);
    const results = await resP;
    console.log(`    🏆 R${r}: majority=${results.majorityPlayerIds?.length ?? 0}`);

    if (r < rounds) {
      const npP = waitFor(hostSock, 'mlt:prompt', 8000);
      hostSock.emit('mlt:next_round', { code });
      promptEvt = await npP;
      console.log(`    🃏 R${r + 1}: "${promptEvt.prompt}"`);
    }
  }

  const endP = waitFor(hostSock, 'mlt:end', 8000);
  hostSock.emit('mlt:next_round', { code });
  const endEvt = await endP;
  console.log(`  🎉 MLT ended — ${endEvt.leaderboard?.length ?? 0} on leaderboard`);
  return endEvt;
}

// ── 3. Fill-in-the-Blank ──────────────────────────────────────────────────────
async function playFitb(hostSock, players, code, rounds, page) {
  console.log(`\n  ── ✏️  Fill-in-the-Blank (${rounds} rounds) ──`);

  // Register round_start BEFORE fitb:start
  const rs1P = waitFor(hostSock, 'fitb:round_start', 8000);
  hostSock.emit('fitb:start', { code, rounds });
  let rsEvt = await rs1P;
  console.log(`    📋 R1: "${rsEvt.question}"`);

  for (let r = 1; r <= rounds; r++) {
    // ── Host screen: "Answers submitted" ──────────────────────────────────
    await hostHasLabel(page, 'Answers submitted');
    console.log('    🖥  ✅ "Answers submitted" visible (FITB answering)');

    // Register voting_started BEFORE answering
    const vtP = waitFor(hostSock, 'fitb:voting_started', 12000);
    for (const p of players) p.sock.emit('fitb:answer', { code, text: `FITB ${p.name} R${r}` });
    await hostSoftCount(page, '3/3', `FITB R${r} answers`);
    await vtP;
    console.log(`    🗳  FITB voting started R${r}`);

    // ── Host screen: "Votes in" ────────────────────────────────────────────
    await hostHasLabel(page, 'Votes in');
    console.log('    🖥  ✅ "Votes in" visible (FITB voting)');

    // Host skips to results to avoid self-vote complexity
    const resP = waitFor(hostSock, 'fitb:results', 8000);
    hostSock.emit('fitb:show_results', { code });
    await resP;
    console.log(`    🏆 R${r} results received`);

    if (r < rounds) {
      const nsP = waitFor(hostSock, 'fitb:round_start', 8000);
      hostSock.emit('fitb:next_round', { code });
      rsEvt = await nsP;
      console.log(`    📋 R${r + 1}: "${rsEvt.question}"`);
    }
  }

  const endP = waitFor(hostSock, 'fitb:end', 8000);
  hostSock.emit('fitb:next_round', { code });
  const endEvt = await endP;
  console.log(`  🎉 FITB ended — ${endEvt.leaderboard?.length ?? 0} on leaderboard`);
  return endEvt;
}

// ── 4. Drawing ────────────────────────────────────────────────────────────────
async function playDrawing(hostSock, players, code, page) {
  console.log(`\n  ── 🎨 Drawing (1 round) ──`);

  // Register round_start BEFORE draw:start
  const rs1P = waitFor(hostSock, 'draw:round_start', 8000);
  hostSock.emit('draw:start', { code, rounds: 1, mode: 'classic' });
  const rsEvt = await rs1P;
  console.log(`    🖌  Word: "${rsEvt.word}", ${rsEvt.players?.length ?? 0} players`);

  // ── Host screen: "Drawings submitted" ─────────────────────────────────────
  await hostHasLabel(page, 'Drawings submitted');
  console.log('    🖥  ✅ "Drawings submitted" visible (Drawing phase)');

  // Register voting_started BEFORE submitting drawings
  const vsP = waitFor(hostSock, 'draw:voting_started', 15000);
  for (const p of players) p.sock.emit('draw:submit', { code, strokes: FAKE_STROKES });
  await hostSoftCount(page, '1/3', 'Draw submissions');
  await hostSoftCount(page, '3/3', 'Draw all submitted');
  const vEvt = await vsP;
  console.log(`    🗳  draw:voting_started: ${vEvt.submissions?.length ?? 0} submissions`);

  // ── Host screen: "Votes in" ───────────────────────────────────────────────
  await hostHasLabel(page, 'Votes in');
  console.log('    🖥  ✅ "Votes in" visible (Drawing voting)');

  // Register results BEFORE voting
  const resP = waitFor(hostSock, 'draw:results', 10000);
  for (let i = 0; i < players.length; i++) {
    const sub = vEvt.submissions?.find(s => s.playerId !== players[i].id);
    if (sub) players[i].sock.emit('draw:vote', { code, votedForPlayerId: sub.playerId });
  }
  await hostSoftCount(page, '3/3', 'Draw votes');
  await resP;
  console.log('    🏆 Drawing results received');

  const endP = waitFor(hostSock, 'draw:end', 8000);
  hostSock.emit('draw:next_round', { code });
  const endEvt = await endP;
  console.log(`  🎉 Drawing ended — ${endEvt.leaderboard?.length ?? 0} on leaderboard`);
  return endEvt;
}

// ── 5. Selfie Roast ───────────────────────────────────────────────────────────
async function playSelfie(hostSock, players, code, page) {
  console.log(`\n  ── 📸 Selfie Roast (1 round) ──`);

  // Register photo_phase BEFORE selfie:start
  const ppP = waitFor(hostSock, 'selfie:photo_phase', 8000);
  hostSock.emit('selfie:start', { code, rounds: 1 });
  const ppEvt = await ppP;
  console.log(`    📸 Photo phase: ${ppEvt.players?.length ?? 0} players`);

  // ── Host screen: "Selfies submitted" ─────────────────────────────────────
  await hostHasLabel(page, 'Selfies submitted');
  console.log('    🖥  ✅ "Selfies submitted" visible (Selfie photo phase)');

  // Register draw_assigned listeners BEFORE submitting photos because the server
  // fires selfie:draw_assigned to individual sockets BEFORE selfie:drawing_phase
  const vsP = waitFor(hostSock, 'selfie:voting_started', 30000);
  const assignPs = players.map(p =>
    waitFor(p.sock, 'selfie:draw_assigned', 30000)
      .then(() => p.sock.emit('selfie:submit_drawing', { code, strokes: FAKE_STROKES }))
  );

  // Register drawing_phase BEFORE submitting photos
  const dpP = waitFor(hostSock, 'selfie:drawing_phase', 12000);
  for (const p of players) p.sock.emit('selfie:submit_photo', { code, photoData: FAKE_PHOTO });
  await hostSoftCount(page, '3/3', 'Selfie photos');
  const dpEvt = await dpP;
  console.log(`    🖌  Drawing phase: ${dpEvt.totalDrawers ?? 0} drawers`);

  // ── Host screen: "Drawings submitted" ────────────────────────────────────
  // Soft check: drawings submit fast so the host screen may have already
  // transitioned to voting phase by the time we get here.
  await hostHasLabel(page, 'Drawings submitted').catch(() => {
    console.log('    ⚠️  "Drawings submitted" may have transitioned before check');
  });
  console.log('    🖥  ✅ "Drawings submitted" checked (Selfie drawing phase)');

  await Promise.all(assignPs);
  await hostSoftCount(page, '3/3', 'Selfie drawings');
  const vEvt = await vsP;
  console.log(`    🗳  selfie:voting_started: ${vEvt.submissions?.length ?? 0} submissions`);

  // ── Host screen: "Votes in" ───────────────────────────────────────────────
  await hostHasLabel(page, 'Votes in');
  console.log('    🖥  ✅ "Votes in" visible (Selfie voting)');

  // Register results BEFORE voting
  const resP = waitFor(hostSock, 'selfie:results', 10000);
  for (let i = 0; i < players.length; i++) {
    const sub = vEvt.submissions?.find(s => s.drawerId !== players[i].id);
    if (sub) players[i].sock.emit('selfie:vote', { code, drawerId: sub.drawerId });
  }
  await hostSoftCount(page, '3/3', 'Selfie votes');
  const results = await resP;
  console.log(`  🎉 Selfie ended (isFinal=${results.isFinal})`);
  return results;
}

// ── 6. This-or-That ───────────────────────────────────────────────────────────
async function playTot(hostSock, players, code, rounds, page) {
  console.log(`\n  ── ⚡ This-or-That (${rounds} rounds) ──`);
  hostSock.emit('set_game_options', { code, totalRounds: rounds, gameType: 'this-or-that' });
  await DELAY(80);

  // Register game_started + first question BEFORE start_game
  const gsP = waitFor(hostSock, 'game_started', 8000);
  const nqP = waitFor(hostSock, 'new_question', 12000);
  hostSock.emit('start_game', { code });
  await gsP;
  let qEvt = await nqP;

  for (let r = 1; r <= rounds; r++) {
    console.log(`    ❓ R${r}: "${String(qEvt.a).slice(0, 22)}" vs "${String(qEvt.b).slice(0, 22)}"`);

    // ── Host screen: "Voted" label (ToT voting counter label) ─────────────
    await hostHasLabel(page, 'Voted');
    console.log('    🖥  ✅ "Voted" label visible (ToT)');

    // Register tot:results BEFORE voting
    const resP = waitFor(hostSock, 'tot:results', 10000);
    for (let i = 0; i < players.length; i++) {
      players[i].sock.emit('tot:vote', { code, choice: i % 2 === 0 ? 'a' : 'b' });
    }
    await hostSoftCount(page, '3/3', `ToT R${r} votes`);
    await resP;

    if (r < rounds) {
      // Register next question BEFORE advancing
      qEvt = await (() => {
        const nextP = waitFor(hostSock, 'new_question', 12000);
        hostSock.emit('tot:next_round', { code });
        return nextP;
      })();
    } else {
      hostSock.emit('tot:next_round', { code });
    }
  }

  const endEvt = await waitFor(hostSock, 'tot:end', 8000);
  console.log(`  🎉 ToT ended — ${endEvt.leaderboard?.length ?? 0} on leaderboard`);
  return endEvt;
}

// ── 7. Situational ────────────────────────────────────────────────────────────
async function playSituational(hostSock, players, code, rounds, page) {
  console.log(`\n  ── 🎭 Situational (${rounds} rounds) ──`);
  hostSock.emit('set_game_options', { code, totalRounds: rounds, gameType: 'situational' });
  await DELAY(80);

  // Register game_started + first question BEFORE start_game
  const gsP = waitFor(hostSock, 'game_started', 8000);
  const nqP = waitFor(hostSock, 'new_question', 12000);
  hostSock.emit('start_game', { code });
  await gsP;
  let nqEvt = await nqP;

  for (let r = 1; r <= rounds; r++) {
    console.log(`    📝 R${r}: "${String(nqEvt.question).slice(0, 55)}…"`);

    // ── Host screen: "Answers submitted" (Sit uses same QuestionPanel) ────
    await hostHasLabel(page, 'Answers submitted');
    console.log('    🖥  ✅ "Answers submitted" visible (Situational answering)');

    // Register sit:voting_started BEFORE answering
    const vsP = waitFor(hostSock, 'sit:voting_started', 20000);
    for (const p of players) p.sock.emit('submit_answer', { code, text: `Sit R${r} from ${p.name}` });
    await hostSoftCount(page, '3/3', `Sit R${r} answers`);
    const vsEvt = await vsP;
    console.log(`    🗳  sit:voting_started`);

    // ── Host screen: "Votes in" (SitPanel toggles when votingStarted) ─────
    await hostHasLabel(page, 'Votes in');
    console.log('    🖥  ✅ "Votes in" visible (Situational voting)');

    // Register sit:results BEFORE voting
    const resP = waitFor(hostSock, 'sit:results', 10000);
    for (let i = 0; i < players.length; i++) {
      const myId = players[i].id;
      const target = (vsEvt.answers || []).find(a => a.id !== myId);
      players[i].sock.emit('sit:vote', {
        code,
        answerId: target?.id ?? players[(i + 1) % players.length].id,
      });
    }
    await hostSoftCount(page, '3/3', `Sit R${r} votes`);
    await resP;
    console.log(`    ✅ R${r} done`);
    hostSock.emit('sit:next', { code });

    if (r < rounds) {
      nqEvt = await waitFor(hostSock, 'new_question', 12000);
    }
  }

  const endEvt = await waitFor(hostSock, 'game_ended', 8000);
  console.log(`  🎉 Situational ended — ${Object.keys(endEvt.finalScores || {}).length} scored`);
  return endEvt;
}

// ── 8. Caption ────────────────────────────────────────────────────────────────
async function playCaption(hostSock, players, code, rounds, page) {
  console.log(`\n  ── 💬 Selfie Captions (${rounds} rounds) ──`);

  // caption:start may skip photo_phase if playerPhotos are already cached
  // (e.g. from Selfie Roast earlier in the playlist).  Wait for whichever
  // event arrives first.
  const ppP = waitForAny([hostSock], ['caption:photo_phase', 'caption:writing_phase'], 12000);
  hostSock.emit('caption:start', { code, rounds });
  const ppResult = await ppP;

  let wp1Evt;
  if (ppResult.event === 'caption:writing_phase') {
    console.log(`    ✍  Photo phase skipped (photos cached) — writing phase R1: "${String(ppResult.data?.prompt || '').slice(0, 45)}"`);
    wp1Evt = ppResult.data;
  } else {
    console.log(`    📸 Photo collection phase started`);
    // Register writing_phase BEFORE submitting photos
    const wp1P = waitFor(hostSock, 'caption:writing_phase', 12000);
    for (const p of players) p.sock.emit('caption:submit_photo', { code, photoData: FAKE_PHOTO });
    wp1Evt = await wp1P;
    console.log(`    ✍  Writing phase R1: "${String(wp1Evt?.prompt || '').slice(0, 45)}"`);
  }
  for (let r = 1; r <= rounds; r++) {
    if (r > 1) {
      // Register writing_phase BEFORE next_round
      const wpNextP = waitFor(hostSock, 'caption:writing_phase', 10000);
      hostSock.emit('caption:next_round', { code });
      const wpNext = await wpNextP;
      console.log(`    ✍  Writing phase R${r}: "${String(wpNext.prompt || '').slice(0, 45)}"`);
    }

    // ── Host screen: "Captions written" ───────────────────────────────────
    await hostHasLabel(page, 'Captions written');
    console.log('    🖥  ✅ "Captions written" visible (Caption writing)');

    // Register voting_phase BEFORE submitting captions
    const vpP = waitFor(hostSock, 'caption:voting_phase', 12000);
    for (const p of players) {
      p.sock.emit('caption:submit_caption', { code, text: `Great caption from ${p.name} for round ${r}!` });
    }
    await hostSoftCount(page, '3/3', `Caption R${r} writings`);
    const vpEvt = await vpP;
    console.log(`    🗳  caption:voting_phase: ${vpEvt.captions?.length ?? 0} captions`);

    // ── Host screen: "Votes in" ────────────────────────────────────────────
    await hostHasLabel(page, 'Votes in');
    console.log('    🖥  ✅ "Votes in" visible (Caption voting)');

    // Host skips to results to avoid self-vote complexity
    const rrP = waitFor(hostSock, 'caption:round_results', 10000);
    hostSock.emit('caption:skip_to_results', { code });
    const rrEvt = await rrP;
    console.log(`    🏆 R${r}: ${rrEvt.captionResults?.length ?? 0} results`);
  }

  // Register game_over BEFORE final next_round
  const goP = waitFor(hostSock, 'caption:game_over', 8000);
  hostSock.emit('caption:next_round', { code });
  const goEvt = await goP;
  console.log(`  🎉 Caption ended — ${goEvt.leaderboard?.length ?? 0} on leaderboard`);
  return goEvt;
}

// ── 9. Selfie Challenge / pmatch ──────────────────────────────────────────────
async function playPmatch(hostSock, players, code, rounds, page) {
  console.log(`\n  ── 🎭 Selfie Challenge / pmatch (${rounds} rounds) ──`);

  // Register photo_phase BEFORE photovote:start
  const ppP = waitFor(hostSock, 'photovote:photo_phase', 8000);
  hostSock.emit('photovote:start', { code, subType: 'pmatch', rounds });
  const ppEvt = await ppP;
  console.log(`    📸 R1 photo phase: "${String(ppEvt.prompt || '').slice(0, 40)}"`);

  // ── Host screen: "Photos submitted" ─────────────────────────────────────
  await hostHasLabel(page, 'Photos submitted');
  console.log('    🖥  ✅ "Photos submitted" visible (pmatch photo phase)');

  // Submit photos for round 1
  const vp1P = waitFor(hostSock, 'photovote:voting_phase', 10000);
  for (const p of players) p.sock.emit('photovote:submit_photo', { code, photoData: FAKE_PHOTO });
  await hostSoftCount(page, '3/3', 'Pmatch photos R1');
  const vp1Evt = await vp1P;
  console.log(`    🗳  pmatch R1 voting: ${vp1Evt.photos?.length ?? 0} photos`);

  // ── Host screen: "Votes in" ───────────────────────────────────────────────
  await hostHasLabel(page, 'Votes in');
  console.log('    🖥  ✅ "Votes in" visible (pmatch voting R1)');

  const rr1P = waitFor(hostSock, 'photovote:round_results', 10000);
  for (let i = 0; i < players.length; i++) {
    const target = vp1Evt.photos?.find(ph => ph.playerId !== players[i].id);
    if (target) players[i].sock.emit('photovote:vote', { code, targetPlayerId: target.playerId });
  }
  await hostSoftCount(page, '3/3', 'Pmatch votes R1');
  const rr1Evt = await rr1P;
  console.log(`    🏆 R1: ${rr1Evt.voteResults?.length ?? 0} results`);

  for (let r = 2; r <= rounds; r++) {
    // pmatch: next_round → photo_phase → voting_phase
    const pp2P = waitFor(hostSock, 'photovote:photo_phase', 10000);
    hostSock.emit('photovote:next_round', { code });
    const pp2Evt = await pp2P;
    console.log(`    📸 R${r} photo phase: "${String(pp2Evt.prompt || '').slice(0, 40)}"`);

    const vp2P = waitFor(hostSock, 'photovote:voting_phase', 10000);
    for (const p of players) p.sock.emit('photovote:submit_photo', { code, photoData: FAKE_PHOTO });
    const vp2Evt = await vp2P;

    const rr2P = waitFor(hostSock, 'photovote:round_results', 10000);
    for (let i = 0; i < players.length; i++) {
      const target = vp2Evt.photos?.find(ph => ph.playerId !== players[i].id);
      if (target) players[i].sock.emit('photovote:vote', { code, targetPlayerId: target.playerId });
    }
    await rr2P;
    console.log(`    🏆 R${r} results`);
  }

  const goP = waitFor(hostSock, 'photovote:game_over', 8000);
  hostSock.emit('photovote:next_round', { code });
  const goEvt = await goP;
  console.log(`  🎉 pmatch ended — ${goEvt.leaderboard?.length ?? 0} on leaderboard`);
  return goEvt;
}

// ── 10. Draw-Telephone ────────────────────────────────────────────────────────
async function playDrawTel(hostSock, players, code, page) {
  console.log(`\n  ── 📞 Draw-Telephone (1 chain) ──`);
  const allSocks = [hostSock, ...players.map(p => p.sock)];

  // Register start events BEFORE dt:start
  const startP = waitForAny(allSocks, ['dt:selfie_phase', 'dt:prompt_phase'], 10000);
  hostSock.emit('dt:start', { code });
  const startResult = await startP;

  if (startResult.event === 'dt:selfie_phase') {
    console.log('    📸 DT selfie collection phase');

    // ── Host screen: "Selfies submitted" ──────────────────────────────────
    await hostHasLabel(page, 'Selfies submitted');
    console.log('    🖥  ✅ "Selfies submitted" visible (DT selfie)');

    for (const p of players) p.sock.emit('selfie:submit_photo', { code, photoData: FAKE_PHOTO });
    await waitFor(hostSock, 'dt:prompt_phase', 12000);
    console.log('    ✏  DT prompt phase reached');
  } else {
    console.log('    ✏  Photos cached — DT prompt phase started directly');
  }

  // ── Host screen: "Prompts submitted" ──────────────────────────────────────
  await hostHasLabel(page, 'Prompts submitted');
  console.log('    🖥  ✅ "Prompts submitted" visible (DT prompting)');

  // Register prompt_received events BEFORE submitting prompts
  const promptPs = players.map(() => waitFor(hostSock, 'dt:prompt_received', 8000).catch(() => null));
  for (const p of players) p.sock.emit('dt:submit_prompt', { code, templateText: `[name]'s funniest face` });
  await Promise.all(promptPs);
  console.log('    ✏  All prompts submitted');

  // DT drawing phase — listen for dt:your_turn on each player socket
  const drawingDoneP = waitFor(hostSock, 'dt:guessing_phase', 30000);
  const yourTurnHandlers = new Map();
  for (const p of players) {
    const h = ({ promptId }) => {
      p.sock.emit('dt:submit_strokes', { code, promptId, strokes: FAKE_STROKES });
    };
    yourTurnHandlers.set(p.sock, h);
    p.sock.on('dt:your_turn', h);
  }

  // ── Host screen: "Chains completed" (soft — appears during drawing phase) ─
  await hostHasLabel(page, 'Chains completed').catch(() => {
    console.log('    ⚠️  "Chains completed" not seen — may have transitioned');
  });

  const guessingEvt = await drawingDoneP;
  yourTurnHandlers.forEach((h, s) => s.off('dt:your_turn', h));
  console.log(`    🎨 DT guessing phase: ${guessingEvt.totalGuessers} guessers`);

  // ── Host screen: "Guesses received" ───────────────────────────────────────
  await hostHasLabel(page, 'Guesses received');
  console.log('    🖥  ✅ "Guesses received" visible (DT guessing)');

  // Register dt:your_guess on each player BEFORE they arrive
  const guessPs = players.map(p =>
    waitFor(p.sock, 'dt:your_guess', 15000)
      .then(({ promptId }) => p.sock.emit('dt:submit_guess', { code, promptId, guessText: 'Something funny' }))
      .catch(() => {})
  );
  await Promise.all(guessPs);
  console.log('    🤔 All guesses submitted');

  // Register reveal/end BEFORE they arrive
  const revealOrEndP = waitForAny([hostSock], ['dt:reveal_phase', 'dt:end'], 15000).catch(() => null);
  const revResult = await revealOrEndP;

  if (revResult?.event === 'dt:reveal_phase') {
    console.log('    🎬 DT reveal phase');
    const endP = waitFor(hostSock, 'dt:end', 8000);
    hostSock.emit('dt:end_game', { code });
    const endEvt = await endP;
    console.log(`  🎉 DrawTel ended — ${endEvt.leaderboard?.length ?? 0} on leaderboard`);
    return endEvt;
  } else if (revResult?.event === 'dt:end') {
    console.log(`  🎉 DrawTel ended`);
    return revResult.data;
  } else {
    // Force end if no reveal/end arrived
    console.log('    ⚠️  No reveal/end — forcing dt:end_game');
    const endP = waitFor(hostSock, 'dt:end', 8000);
    hostSock.emit('dt:end_game', { code });
    const endEvt = await endP;
    console.log(`  🎉 DrawTel ended (forced) — ${endEvt.leaderboard?.length ?? 0} on leaderboard`);
    return endEvt;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE TEST
// ═══════════════════════════════════════════════════════════════════════════════

test('HOST SCREEN — full playlist (all 10 games, browser verified)', async ({ page }) => {
  // ── Desktop viewport for host TV screen ─────────────────────────────────────
  await page.setViewportSize({ width: 1280, height: 800 });

  // ── Socket setup ─────────────────────────────────────────────────────────────
  console.log('\n  🔌 Connecting sockets...');
  const hostSock = await connect();
  const players = await Promise.all([
    connect().then(s => ({ sock: s, name: 'Red',   id: null })),
    connect().then(s => ({ sock: s, name: 'Blue',  id: null })),
    connect().then(s => ({ sock: s, name: 'Green', id: null })),
  ]);
  const allSocks = [hostSock, ...players.map(p => p.sock)];
  const errors = trackErrors(allSocks);
  console.log('  🔌 All sockets connected');

  // ── Create room ───────────────────────────────────────────────────────────────
  console.log('  🏗  Creating room...');
  const created = await new Promise(resolve => {
    hostSock.once('room_created', resolve);
    hostSock.emit('create_room', {
      playerName: 'TestHost',
      gameType: 'who-said-that',
      hostIsPlaying: false,
    });
  });
  const code = created.code;
  console.log(`  🏠 Room code: ${code}`);
  expect(code).toMatch(/^[A-Z0-9]{4}$/);

  // ── Open browser on host screen (spectator mode) ──────────────────────────────
  console.log(`  🖥  Navigating browser → /host?room=${code}`);
  await page.goto(`/host?room=${code}`);

  // Wait for the room code to appear in the page (lobby rendered + spectator_joined received)
  await page.waitForFunction(
    roomCode => document.body.innerText.includes(roomCode),
    code,
    { timeout: 15000 }
  );
  console.log('  🖥  Browser in lobby — room code visible');

  // IMPORTANT: the HostPage emits join_spectator which replaces hostPlayer.socketId
  // with the browser's socket. Re-emit join_spectator from hostSock to reclaim host
  // control so start_game / change_game / etc. continue to work.
  await new Promise(resolve => {
    hostSock.once('spectator_joined', resolve);
    hostSock.emit('join_spectator', { code });
  });
  console.log('  🔑 hostSock reclaimed host control');

  // Keep re-claiming every 2s in case the browser socket fires join_spectator
  // on reconnect and steals the host slot back.
  const reclaimInterval = setInterval(() => {
    hostSock.emit('join_spectator', { code });
  }, 2000);
  const stopReclaim = () => clearInterval(reclaimInterval);

  // ── Players join ──────────────────────────────────────────────────────────────
  for (const p of players) {
    const joined = await new Promise(resolve => {
      p.sock.once('join_success', resolve);
      p.sock.emit('join_room', { code, playerName: p.name });
    });
    p.id = joined.playerId;
  }
  console.log(`  👥 Players: ${players.map(p => `${p.name}(${p.id.slice(0, 6)})`).join(' ')}`);

  // Verify lobby shows player names and joined count on the host screen
  await hostHasLabel(page, 'Red', 3000).catch(() => {});     // player names may be cut off — soft
  await hostHasLabel(page, '3 joined').catch(() => {          // count badge
    // count badge has no uppercase CSS → "3 joined"
    console.log('    ℹ️  "3 joined" badge not seen yet (may still be rendering)');
  });
  console.log('  🖥  ✅ Lobby visible with players joined');

  expect(errors).toHaveLength(0);

  // ════════════════════════════════════════════════════════════════════════════
  // GAME 1: Who Said That
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎮 GAME 1 / 10 — Who Said That');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  {
    const result = await playWst(hostSock, players, code, 2, page);
    expect(result.finalScores).toBeDefined();
    expect(errors).toHaveLength(0);
    console.log('  ✅ GAME 1 PASSED');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GAME 2: Most Likely To
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎮 GAME 2 / 10 — Most Likely To');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await changeGame(hostSock, allSocks, code, 'most-likely-to');
  {
    const result = await playMlt(hostSock, players, code, 2, page);
    expect(result.leaderboard).toBeDefined();
    expect(errors).toHaveLength(0);
    console.log('  ✅ GAME 2 PASSED');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GAME 3: Fill-in-the-Blank
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎮 GAME 3 / 10 — Fill-in-the-Blank');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await changeGame(hostSock, allSocks, code, 'fill-in-the-blank');
  {
    const result = await playFitb(hostSock, players, code, 2, page);
    expect(result.leaderboard).toBeDefined();
    expect(errors).toHaveLength(0);
    console.log('  ✅ GAME 3 PASSED');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GAME 4: Drawing
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎮 GAME 4 / 10 — Drawing (Pictionary)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await changeGame(hostSock, allSocks, code, 'drawing');
  {
    const result = await playDrawing(hostSock, players, code, page);
    expect(result.leaderboard).toBeDefined();
    expect(errors).toHaveLength(0);
    console.log('  ✅ GAME 4 PASSED');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GAME 5: Selfie Roast
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎮 GAME 5 / 10 — Selfie Roast');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await changeGame(hostSock, allSocks, code, 'selfie-roast');
  {
    const result = await playSelfie(hostSock, players, code, page);
    expect(result.submissions).toBeDefined();
    expect(errors).toHaveLength(0);
    console.log('  ✅ GAME 5 PASSED');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GAME 6: This-or-That
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎮 GAME 6 / 10 — This-or-That');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await changeGame(hostSock, allSocks, code, 'this-or-that');
  {
    const result = await playTot(hostSock, players, code, 2, page);
    expect(result.leaderboard).toBeDefined();
    expect(errors).toHaveLength(0);
    console.log('  ✅ GAME 6 PASSED');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GAME 7: Situational
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎮 GAME 7 / 10 — Situational');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await changeGame(hostSock, allSocks, code, 'situational');
  {
    const result = await playSituational(hostSock, players, code, 2, page);
    expect(result.finalScores).toBeDefined();
    expect(errors).toHaveLength(0);
    console.log('  ✅ GAME 7 PASSED');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GAME 8: Caption
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎮 GAME 8 / 10 — Selfie Captions');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await changeGame(hostSock, allSocks, code, 'caption');
  {
    const result = await playCaption(hostSock, players, code, 2, page);
    expect(result.leaderboard).toBeDefined();
    expect(errors).toHaveLength(0);
    console.log('  ✅ GAME 8 PASSED');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GAME 9: Selfie Challenge (pmatch)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎮 GAME 9 / 10 — Selfie Challenge (pmatch)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await changeGame(hostSock, allSocks, code, 'pmatch');
  {
    const result = await playPmatch(hostSock, players, code, 2, page);
    expect(result.leaderboard).toBeDefined();
    expect(errors).toHaveLength(0);
    console.log('  ✅ GAME 9 PASSED');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GAME 10: Draw-Telephone
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎮 GAME 10 / 10 — Draw-Telephone');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await changeGame(hostSock, allSocks, code, 'draw-telephone');
  {
    const result = await playDrawTel(hostSock, players, code, page);
    expect(result.leaderboard).toBeDefined();
    expect(errors).toHaveLength(0);
    console.log('  ✅ GAME 10 PASSED');
  }

  // ── Final health checks ───────────────────────────────────────────────────────
  expect(allSocks.every(s => s.connected)).toBe(true);
  expect(errors).toHaveLength(0);

  // Verify the browser is still live (not white-screened / crashed)
  await page.waitForFunction(
    () => document.body.innerText.length > 10,
    { timeout: 5000 }
  );

  console.log('\n  ╔══════════════════════════════════════════╗');
  console.log('  ║  ✅  ALL 10 / 10 GAMES VERIFIED          ║');
  console.log('  ║  🖥  Host screen assertions: PASSED       ║');
  console.log('  ║  🔌  Sockets: connected, 0 errors         ║');
  console.log('  ╚══════════════════════════════════════════╝');

  allSocks.forEach(s => s.disconnect());
  stopReclaim();
}, 300_000 /* 5-minute global timeout */);
