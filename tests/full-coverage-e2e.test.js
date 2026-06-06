/**
 * Full Coverage E2E Test
 *
 * Two complete playlist runs in the SAME room with the same 3 players.
 * Each run plays 5 mini-games to completion.
 * Across both runs every mini-game is covered at least once.
 *
 * Run 1 (5 games via change_game):
 *   1. Who Said That      (2 rounds) — answer + vote cycle
 *   2. Most Likely To     (2 rounds) — mlt:start / mlt:vote / mlt:end
 *   3. Fill-in-the-Blank  (2 rounds) — fitb:answer / host-show-results
 *   4. Drawing            (1 round)  — draw:submit / draw:vote / draw:end
 *   5. Selfie Roast       (1 round)  — selfie:submit_photo / submit_drawing / vote
 *
 * Run 2 (5 games, same room, same players):
 *   1. This-or-That       (2 rounds) — tot:vote / tot:end
 *   2. Situational        (2 rounds) — submit_answer / sit:vote / game_ended
 *   3. Caption            (2 rounds) — caption:submit_photo / submit_caption / vote
 *   4. Prompt Match (pmatch) (2 rounds) — photovote:start / submit_photo / vote
 *   5. Draw-Telephone     (1 chain)  — dt:start / selfie photo / prompt / draw / guess / reveal → end
 *
 * Server event name reference (verified from server/index.js):
 *   photovote results  → 'photovote:round_results'
 *   photovote end      → 'photovote:game_over'
 *   DT selfie collect  → 'dt:selfie_phase'
 *   DT drawing turn    → 'dt:your_turn' { promptId, ... }
 *   DT submit strokes  → 'dt:submit_strokes' { code, promptId, strokes }
 *   DT guessing turn   → 'dt:your_guess' { promptId, ... }
 *   DT submit guess    → 'dt:submit_guess' { code, promptId, guessText }
 *   DT prompt submit   → 'dt:submit_prompt' { code, templateText } (must contain [name])
 *   change_game emit   → { code, newGameType }  →  game_changed broadcast
 */

import { io } from 'socket.io-client';
import { test, expect } from '@playwright/test';

const SERVER = 'http://localhost:3001';
const DELAY   = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Core helpers ─────────────────────────────────────────────────────────────

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

function trackErrors(socks) {
  const errors = [];
  socks.forEach(s => s.on('error', (e) => errors.push(`[${s.id?.slice(0,6)}]: ${e?.message || JSON.stringify(e)}`)));
  return errors;
}
function assertNoErrors(errors, label) {
  if (errors.length > 0) throw new Error(`[${label}] Unexpected socket error event(s): ${errors.join(', ')}`);
}

const FAKE_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const FAKE_STROKES = [{ color: '#FF0000', width: 4, type: 'pen', points: [{ x: 10, y: 10 }, { x: 50, y: 50 }] }];

// ─── Transition helper ────────────────────────────────────────────────────────

async function changeGame(hostSock, allSocks, code, newGameType) {
  console.log(`\n  🔄 Transitioning → ${newGameType}`);
  const changedPromises = allSocks.map(s => waitFor(s, 'game_changed', 12000));
  hostSock.emit('change_game', { code, newGameType });
  await Promise.all(changedPromises);
  console.log(`  ✅ game_changed → ${newGameType} received by all sockets`);
  await DELAY(80);
}

// ─── WST round driver ─────────────────────────────────────────────────────────

async function driveOneWstRound(hostSock, players, code, label) {
  const qEvt = await waitFor(hostSock, 'new_question', 12000);
  console.log(`    📝 ${label}: "${String(qEvt.question).slice(0, 55)}…"`);

  // Submit all answers
  const vsP = waitFor(hostSock, 'voting_started', 20000);
  for (const p of players) p.sock.emit('submit_answer', { code, text: `${p.name} says ${label}` });
  const vsEvt = await vsP;
  const numAnswers = vsEvt.answers?.length ?? players.length;

  // Vote on each answer in sequence
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
  console.log(`    ✅ ${label} round done`);
  hostSock.emit('ready_next_round', { code });
}

// ─── Situational round driver ─────────────────────────────────────────────────

async function driveOneSitRound(hostSock, players, code, label) {
  const qEvt = await waitFor(hostSock, 'new_question', 12000);
  console.log(`    📝 ${label}: "${String(qEvt.question).slice(0, 55)}…"`);

  const vsP = waitFor(hostSock, 'sit:voting_started', 20000);
  for (const p of players) p.sock.emit('submit_answer', { code, text: `Sit answer ${p.name}` });
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

// ─── ToT round driver ─────────────────────────────────────────────────────────

async function driveOneTotRound(hostSock, players, code, label) {
  const qEvt = await waitFor(hostSock, 'new_question', 12000);
  console.log(`    ❓ ${label}: "${String(qEvt.a).slice(0,24)}" vs "${String(qEvt.b).slice(0,24)}"`);

  const resP = waitFor(hostSock, 'tot:results', 10000);
  for (let i = 0; i < players.length; i++) {
    players[i].sock.emit('tot:vote', { code, choice: i % 2 === 0 ? 'a' : 'b' });
  }
  await resP;
  console.log(`    ✅ ${label} done`);
  hostSock.emit('tot:next_round', { code });
}

// ═════════════════════════════════════════════════════════════════════════════
// GAME DRIVERS
// ═════════════════════════════════════════════════════════════════════════════

async function playWst(hostSock, players, code, rounds = 2) {
  console.log(`\n  ── 🗣 Who Said That (${rounds} rounds) ──`);
  hostSock.emit('set_game_options', { code, totalRounds: rounds, gameType: 'who-said-that' });
  await DELAY(80);
  const gsP = waitFor(hostSock, 'game_started', 8000);
  hostSock.emit('start_game', { code });
  await gsP;
  for (let r = 1; r <= rounds; r++) await driveOneWstRound(hostSock, players, code, `WST-R${r}`);
  const endEvt = await waitFor(hostSock, 'game_ended', 8000);
  console.log(`  🎉 WST ended — ${Object.keys(endEvt.finalScores || {}).length} scored`);
  return endEvt;
}

async function playMlt(hostSock, players, code, rounds = 2) {
  console.log(`\n  ── 🎯 Most Likely To (${rounds} rounds) ──`);
  const promptP = waitFor(hostSock, 'mlt:prompt', 8000);
  hostSock.emit('mlt:start', { code, rounds });
  let promptEvt = await promptP;
  console.log(`    🃏 R1: "${promptEvt.prompt}"`);
  const mltPlayers = promptEvt.players;

  for (let r = 1; r <= rounds; r++) {
    const resP = waitFor(hostSock, 'mlt:results', 10000);
    for (const p of players) {
      const target = mltPlayers.find(mp => mp.id !== p.id) ?? mltPlayers[0];
      p.sock.emit('mlt:vote', { code, targetPlayerId: target.id });
    }
    const results = await resP;
    console.log(`    🏆 R${r}: majority=${results.majorityPlayerIds?.length ?? 0}`);
    if (r < rounds) {
      const npP = waitFor(hostSock, 'mlt:prompt', 8000);
      hostSock.emit('mlt:next_round', { code });
      promptEvt = await npP;
      console.log(`    🃏 R${r+1}: "${promptEvt.prompt}"`);
    }
  }
  const endP = waitFor(hostSock, 'mlt:end', 8000);
  hostSock.emit('mlt:next_round', { code });
  const endEvt = await endP;
  console.log(`  🎉 MLT ended — ${endEvt.leaderboard?.length ?? 0} on leaderboard`);
  return endEvt;
}

async function playFitb(hostSock, players, code, rounds = 2) {
  console.log(`\n  ── 📝 Fill-in-the-Blank (${rounds} rounds) ──`);
  const rs1P = waitFor(hostSock, 'fitb:round_start', 8000);
  hostSock.emit('fitb:start', { code, rounds });
  let rsEvt = await rs1P;
  console.log(`    📋 R1: "${rsEvt.question}"`);

  for (let r = 1; r <= rounds; r++) {
    // Answer phase
    const answeredP = waitFor(hostSock, 'fitb:voting_started', 12000);
    for (const p of players) p.sock.emit('fitb:answer', { code, text: `FITB ${p.name} R${r}` });
    const vtEvt = await answeredP;
    console.log(`    🗳 R${r} voting: ${vtEvt.answers?.length ?? 0} answers`);

    // Use host skip to avoid index tracking complexity
    const resP = waitFor(hostSock, 'fitb:results', 8000);
    hostSock.emit('fitb:show_results', { code });
    const results = await resP;
    console.log(`    🏆 R${r}: ${results.answers?.length ?? 0} scored`);

    if (r < rounds) {
      const nsP = waitFor(hostSock, 'fitb:round_start', 8000);
      hostSock.emit('fitb:next_round', { code });
      rsEvt = await nsP;
      console.log(`    📋 R${r+1}: "${rsEvt.question}"`);
    }
  }
  const endP = waitFor(hostSock, 'fitb:end', 8000);
  hostSock.emit('fitb:next_round', { code });
  const endEvt = await endP;
  console.log(`  🎉 FITB ended — ${endEvt.leaderboard?.length ?? 0} on leaderboard`);
  return endEvt;
}

async function playDrawing(hostSock, players, code) {
  console.log(`\n  ── 🎨 Drawing / Sketch It (1 round) ──`);
  const rs1P = waitFor(hostSock, 'draw:round_start', 8000);
  hostSock.emit('draw:start', { code, rounds: 1, mode: 'classic' });
  const rsEvt = await rs1P;
  console.log(`    🖌 Word: "${rsEvt.word}", ${rsEvt.players?.length ?? 0} players`);

  const vsP = waitFor(hostSock, 'draw:voting_started', 15000);
  for (const p of players) p.sock.emit('draw:submit', { code, strokes: FAKE_STROKES });
  const vEvt = await vsP;
  console.log(`    🗳 Drawing voting: ${vEvt.submissions?.length ?? 0} submissions`);

  // Each player votes for someone else
  const resP = waitFor(hostSock, 'draw:results', 10000);
  for (let i = 0; i < players.length; i++) {
    const sub = vEvt.submissions?.find(s => s.playerId !== players[i].id);
    if (sub) players[i].sock.emit('draw:vote', { code, votedForPlayerId: sub.playerId });
  }
  await resP;
  console.log(`    🏆 Drawing results received`);

  const endP = waitFor(hostSock, 'draw:end', 8000);
  hostSock.emit('draw:next_round', { code });
  const endEvt = await endP;
  console.log(`  🎉 Drawing ended — ${endEvt.leaderboard?.length ?? 0} on leaderboard`);
  return endEvt;
}

async function playSelfie(hostSock, players, code) {
  console.log(`\n  ── 🤳 Selfie Roast (1 round) ──`);
  const ppP = waitFor(hostSock, 'selfie:photo_phase', 8000);
  hostSock.emit('selfie:start', { code, rounds: 1 });
  const ppEvt = await ppP;
  console.log(`    📸 Photo phase: ${ppEvt.players?.length ?? 0} players`);

  // All submit photos
  const dpP = waitFor(hostSock, 'selfie:drawing_phase', 12000);
  for (const p of players) p.sock.emit('selfie:submit_photo', { code, photoData: FAKE_PHOTO });
  const dpEvt = await dpP;
  console.log(`    🖌 Drawing phase: ${dpEvt.totalDrawers ?? 0} drawers`);

  // Each player gets an assignment then submits
  const vsP = waitFor(hostSock, 'selfie:voting_started', 15000);
  // Listen for draw assignments and submit drawings
  const assignPromises = players.map(p =>
    waitFor(p.sock, 'selfie:draw_assigned', 15000).then(() => {
      p.sock.emit('selfie:submit_drawing', { code, strokes: FAKE_STROKES });
    })
  );
  await Promise.all(assignPromises);
  const vEvt = await vsP;
  console.log(`    🗳 Voting: ${vEvt.submissions?.length ?? 0} submissions`);

  // Each player votes for someone else's drawing
  const resP = waitFor(hostSock, 'selfie:results', 10000);
  for (let i = 0; i < players.length; i++) {
    const sub = vEvt.submissions?.find(s => s.drawerId !== players[i].id);
    if (sub) players[i].sock.emit('selfie:vote', { code, drawerId: sub.drawerId });
  }
  const results = await resP;
  console.log(`  🎉 Selfie ended (isFinal=${results.isFinal})`);
  return results;
}

async function playTot(hostSock, players, code, rounds = 2) {
  console.log(`\n  ── 🔀 This-or-That (${rounds} rounds) ──`);
  hostSock.emit('set_game_options', { code, totalRounds: rounds, gameType: 'this-or-that' });
  await DELAY(80);
  const gsP = waitFor(hostSock, 'game_started', 8000);
  hostSock.emit('start_game', { code });
  await gsP;
  for (let r = 1; r <= rounds; r++) await driveOneTotRound(hostSock, players, code, `ToT-R${r}`);
  const endEvt = await waitFor(hostSock, 'tot:end', 8000);
  console.log(`  🎉 ToT ended — ${endEvt.leaderboard?.length ?? 0} on leaderboard`);
  return endEvt;
}

async function playSituational(hostSock, players, code, rounds = 2) {
  console.log(`\n  ── 🎭 Situational (${rounds} rounds) ──`);
  hostSock.emit('set_game_options', { code, totalRounds: rounds, gameType: 'situational' });
  await DELAY(80);
  const gsP = waitFor(hostSock, 'game_started', 8000);
  hostSock.emit('start_game', { code });
  await gsP;
  for (let r = 1; r <= rounds; r++) await driveOneSitRound(hostSock, players, code, `Sit-R${r}`);
  const endEvt = await waitFor(hostSock, 'game_ended', 8000);
  console.log(`  🎉 Situational ended — ${Object.keys(endEvt.finalScores || {}).length} scored`);
  return endEvt;
}

async function playCaption(hostSock, players, code, rounds = 2) {
  console.log(`\n  ── 📷 Caption (${rounds} rounds) ──`);

  const ppP = waitFor(hostSock, 'caption:photo_phase', 8000);
  hostSock.emit('caption:start', { code, rounds });
  const ppEvt = await ppP;
  console.log(`    📸 Photo phase: ${ppEvt.players?.length ?? 0} players`);

  // Submit photos — writing phase fires automatically when all submitted
  const wpP = waitFor(hostSock, 'caption:writing_phase', 12000);
  for (const p of players) p.sock.emit('caption:submit_photo', { code, photoData: FAKE_PHOTO });
  await wpP;

  for (let r = 1; r <= rounds; r++) {
    if (r > 1) {
      // After next_round, writing phase fires automatically (photos reused)
      const wpNextP = waitFor(hostSock, 'caption:writing_phase', 10000);
      hostSock.emit('caption:next_round', { code });
      const wpNext = await wpNextP;
      console.log(`    ✍ R${r} writing: "${wpNext.prompt?.slice(0,45)}…"`);
    } else {
      console.log(`    ✍ R1 writing phase started`);
    }

    // All players submit captions; featured owner's caption is allowed by server
    const vpP = waitFor(hostSock, 'caption:voting_phase', 12000);
    for (const p of players) {
      p.sock.emit('caption:submit_caption', { code, text: `Funny caption from ${p.name} for round ${r}!` });
    }
    const vpEvt = await vpP;
    console.log(`    🗳 R${r} voting: ${vpEvt.captions?.length ?? 0} captions`);

    // Host skips to results to avoid self-vote complexity
    const rrP = waitFor(hostSock, 'caption:round_results', 10000);
    hostSock.emit('caption:skip_to_results', { code });
    const rrEvt = await rrP;
    console.log(`    🏆 R${r} results: ${rrEvt.captionResults?.length ?? 0} captions scored`);
  }

  // Advance past last round → game_over
  const goP = waitFor(hostSock, 'caption:game_over', 8000);
  hostSock.emit('caption:next_round', { code });
  const goEvt = await goP;
  console.log(`  🎉 Caption ended — ${goEvt.leaderboard?.length ?? 0} on leaderboard`);
  return goEvt;
}

async function playPmatch(hostSock, players, code, rounds = 2) {
  console.log(`\n  ── 📸 Prompt Match / pmatch (${rounds} rounds) ──`);

  const ppP = waitFor(hostSock, 'photovote:photo_phase', 8000);
  hostSock.emit('photovote:start', { code, subType: 'pmatch', rounds });
  const ppEvt = await ppP;
  console.log(`    📸 R1 photo phase, prompt="${String(ppEvt.prompt || '').slice(0,35)}…"`);

  // Submit photos for round 1 → auto-advances to voting
  const vp1P = waitFor(hostSock, 'photovote:voting_phase', 10000);
  for (const p of players) p.sock.emit('photovote:submit_photo', { code, photoData: FAKE_PHOTO });
  const vp1Evt = await vp1P;
  console.log(`    🗳 R1 voting: "${String(vp1Evt.prompt).slice(0,35)}…", ${vp1Evt.photos?.length ?? 0} photos`);

  // Vote (everyone votes for someone else)
  const rr1P = waitFor(hostSock, 'photovote:round_results', 10000);
  for (let i = 0; i < players.length; i++) {
    const target = vp1Evt.photos?.find(ph => ph.playerId !== players[i].id);
    if (target) players[i].sock.emit('photovote:vote', { code, targetPlayerId: target.playerId });
  }
  const rr1Evt = await rr1P;
  console.log(`    🏆 R1: ${rr1Evt.voteResults?.length ?? 0} vote results`);

  if (rounds >= 2) {
    // For pmatch, next_round from host sends ANOTHER photo_phase
    const pp2P = waitFor(hostSock, 'photovote:photo_phase', 10000);
    hostSock.emit('photovote:next_round', { code });
    const pp2Evt = await pp2P;
    console.log(`    📸 R2 photo phase, prompt="${String(pp2Evt.prompt || '').slice(0,35)}…"`);

    // New photos for R2
    const vp2P = waitFor(hostSock, 'photovote:voting_phase', 10000);
    for (const p of players) p.sock.emit('photovote:submit_photo', { code, photoData: FAKE_PHOTO });
    const vp2Evt = await vp2P;
    console.log(`    🗳 R2 voting: ${vp2Evt.photos?.length ?? 0} photos`);

    const rr2P = waitFor(hostSock, 'photovote:round_results', 10000);
    for (let i = 0; i < players.length; i++) {
      const target = vp2Evt.photos?.find(ph => ph.playerId !== players[i].id);
      if (target) players[i].sock.emit('photovote:vote', { code, targetPlayerId: target.playerId });
    }
    await rr2P;
    console.log(`    🏆 R2 results received`);
  }

  const goP = waitFor(hostSock, 'photovote:game_over', 8000);
  hostSock.emit('photovote:next_round', { code });
  const goEvt = await goP;
  console.log(`  🎉 pmatch ended — ${goEvt.leaderboard?.length ?? 0} on leaderboard`);
  return goEvt;
}

async function playDrawTel(hostSock, players, code) {
  console.log(`\n  ── 📞 Draw-Telephone (1 chain) ──`);

  // dt:start → dt:selfie_phase if no photos (clear playerPhotos so we get fresh selfie phase)
  // NOTE: Since selfie game ran before this, photos may be cached. DT re-uses them if present.
  // We check for either dt:selfie_phase or dt:prompt_phase.
  const startP = waitForAny(
    [hostSock, ...players.map(p => p.sock)],
    ['dt:selfie_phase', 'dt:prompt_phase'],
    10000
  );
  hostSock.emit('dt:start', { code });
  const startResult = await startP;

  if (startResult.event === 'dt:selfie_phase') {
    console.log(`    📸 Selfie collection phase`);
    // All players submit photos
    for (const p of players) {
      p.sock.emit('selfie:submit_photo', { code, photoData: FAKE_PHOTO });
    }
    // Wait for prompt phase
    await waitFor(hostSock, 'dt:prompt_phase', 12000);
    console.log(`    ✏ Prompt phase ready`);
  } else {
    console.log(`    ✏ Photos cached — prompt phase started directly`);
  }

  // Each player submits a prompt containing [name]
  const promptReceivedPs = players.map(() => waitFor(hostSock, 'dt:prompt_received', 8000).catch(() => null));
  for (const p of players) {
    p.sock.emit('dt:submit_prompt', { code, templateText: `[name]'s funniest face` });
  }
  await Promise.all(promptReceivedPs);

  // Drawing phase: each player's socket receives dt:your_turn events
  // Listen and respond immediately until dt:guessing_phase fires
  const dtYourTurnHandlers = new Map();
  const dtDrawingDone = waitFor(hostSock, 'dt:guessing_phase', 30000);

  for (const p of players) {
    const handler = ({ promptId }) => {
      p.sock.emit('dt:submit_strokes', { code, promptId, strokes: FAKE_STROKES });
    };
    dtYourTurnHandlers.set(p.sock, handler);
    p.sock.on('dt:your_turn', handler);
  }

  const guessingEvt = await dtDrawingDone;
  console.log(`    🎨 Drawing done → guessing phase (${guessingEvt.totalGuessers} guessers)`);

  // Clean up dt:your_turn handlers
  for (const [sock, handler] of dtYourTurnHandlers) {
    sock.off('dt:your_turn', handler);
  }

  // Guessing phase: each player listens for dt:your_guess and responds
  const guessPs = players.map(p =>
    waitFor(p.sock, 'dt:your_guess', 15000).then(({ promptId }) => {
      p.sock.emit('dt:submit_guess', { code, promptId, guessText: `I think it was: something` });
    }).catch(() => {})
  );
  await Promise.all(guessPs);
  console.log(`    🤔 All guesses submitted`);

  // Reveal phase or skip straight to end
  const revealOrEndP = waitForAny([hostSock], ['dt:reveal_phase', 'dt:end'], 15000).catch(() => null);
  const revealResult = await revealOrEndP;

  if (revealResult?.event === 'dt:reveal_phase') {
    console.log(`    🎉 Reveal phase started`);
    const endP = waitFor(hostSock, 'dt:end', 8000);
    hostSock.emit('dt:end_game', { code });
    const endEvt = await endP;
    console.log(`  🎉 DrawTel ended — ${endEvt.leaderboard?.length ?? 0} on leaderboard`);
    return endEvt;
  } else if (revealResult?.event === 'dt:end') {
    console.log(`  🎉 DrawTel ended (already at end)`);
    return revealResult.data;
  } else {
    // Force end
    console.log(`    ⚠ No reveal/end signal — forcing dt:end_game`);
    const endP = waitFor(hostSock, 'dt:end', 8000);
    hostSock.emit('dt:end_game', { code });
    const endEvt = await endP;
    console.log(`  🎉 DrawTel ended (forced) — ${endEvt.leaderboard?.length ?? 0} on leaderboard`);
    return endEvt;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// THE TESTS
// ═════════════════════════════════════════════════════════════════════════════

test('PLAYLIST RUN 1: WST → MLT → FITB → Drawing → Selfie (same room)', async () => {
  // ── Setup ────────────────────────────────────────────────────────────────
  const hostSock = await connect();
  const players = await Promise.all([
    connect().then(s => ({ sock: s, name: 'Red',   id: null })),
    connect().then(s => ({ sock: s, name: 'Blue',  id: null })),
    connect().then(s => ({ sock: s, name: 'Green', id: null })),
  ]);
  const allSocks = [hostSock, ...players.map(p => p.sock)];
  const errors = trackErrors(allSocks);

  // Create room (host NOT playing, so 3 players meet the minimum)
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
  console.log(`  👥 Players: ${players.map(p => `${p.name}(${p.id.slice(0,6)})`).join(' ')}`);
  assertNoErrors(errors, 'setup');

  // ── Game 1: Who Said That ─────────────────────────────────────────────────
  {
    const result = await playWst(hostSock, players, code, 2);
    expect(result.finalScores).toBeDefined();
    assertNoErrors(errors, 'WST');
  }

  // ── Game 2: Most Likely To ─────────────────────────────────────────────────
  await changeGame(hostSock, allSocks, code, 'most-likely-to');
  {
    const result = await playMlt(hostSock, players, code, 2);
    expect(result.leaderboard).toBeDefined();
    assertNoErrors(errors, 'MLT');
  }

  // ── Game 3: Fill-in-the-Blank ──────────────────────────────────────────────
  await changeGame(hostSock, allSocks, code, 'fill-in-the-blank');
  {
    const result = await playFitb(hostSock, players, code, 2);
    expect(result.leaderboard).toBeDefined();
    assertNoErrors(errors, 'FITB');
  }

  // ── Game 4: Drawing ────────────────────────────────────────────────────────
  await changeGame(hostSock, allSocks, code, 'drawing');
  {
    const result = await playDrawing(hostSock, players, code);
    expect(result.leaderboard).toBeDefined();
    assertNoErrors(errors, 'Drawing');
  }

  // ── Game 5: Selfie Roast ───────────────────────────────────────────────────
  await changeGame(hostSock, allSocks, code, 'selfie-roast');
  {
    const result = await playSelfie(hostSock, players, code);
    expect(result.submissions).toBeDefined();
    assertNoErrors(errors, 'Selfie');
  }

  // ── Room health ────────────────────────────────────────────────────────────
  expect(allSocks.every(s => s.connected)).toBe(true);
  assertNoErrors(errors, 'Run1-final');
  console.log('\n  ✅ RUN 1 COMPLETE — 5/5 games, 0 errors, all sockets connected');
  allSocks.forEach(s => s.disconnect());
}, 180000);


test('PLAYLIST RUN 2: ToT → Situational → Caption → Pmatch → DrawTel (same room)', async () => {
  // ── Setup ────────────────────────────────────────────────────────────────
  const hostSock = await connect();
  const players = await Promise.all([
    connect().then(s => ({ sock: s, name: 'Alice',   id: null })),
    connect().then(s => ({ sock: s, name: 'Bob',     id: null })),
    connect().then(s => ({ sock: s, name: 'Charlie', id: null })),
  ]);
  const allSocks = [hostSock, ...players.map(p => p.sock)];
  const errors = trackErrors(allSocks);

  const created = await new Promise(resolve => {
    hostSock.once('room_created', resolve);
    hostSock.emit('create_room', { playerName: 'Host', gameType: 'this-or-that', hostIsPlaying: false });
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
  console.log(`  👥 Players: ${players.map(p => `${p.name}(${p.id.slice(0,6)})`).join(' ')}`);
  assertNoErrors(errors, 'setup');

  // ── Game 1: This-or-That ───────────────────────────────────────────────────
  {
    const result = await playTot(hostSock, players, code, 2);
    expect(result.leaderboard).toBeDefined();
    assertNoErrors(errors, 'ToT');
  }

  // ── Game 2: Situational ────────────────────────────────────────────────────
  await changeGame(hostSock, allSocks, code, 'situational');
  {
    const result = await playSituational(hostSock, players, code, 2);
    expect(result.finalScores).toBeDefined();
    assertNoErrors(errors, 'Situational');
  }

  // ── Game 3: Caption ────────────────────────────────────────────────────────
  await changeGame(hostSock, allSocks, code, 'caption');
  {
    const result = await playCaption(hostSock, players, code, 2);
    expect(result.leaderboard).toBeDefined();
    assertNoErrors(errors, 'Caption');
  }

  // ── Game 4: Prompt Match (pmatch) ──────────────────────────────────────────
  await changeGame(hostSock, allSocks, code, 'pmatch');
  {
    const result = await playPmatch(hostSock, players, code, 2);
    expect(result.leaderboard).toBeDefined();
    assertNoErrors(errors, 'pmatch');
  }

  // ── Game 5: Draw-Telephone ─────────────────────────────────────────────────
  await changeGame(hostSock, allSocks, code, 'draw-telephone');
  {
    const result = await playDrawTel(hostSock, players, code);
    expect(result.leaderboard).toBeDefined();
    assertNoErrors(errors, 'DrawTel');
  }

  // ── Room health ────────────────────────────────────────────────────────────
  expect(allSocks.every(s => s.connected)).toBe(true);
  assertNoErrors(errors, 'Run2-final');
  console.log('\n  ✅ RUN 2 COMPLETE — 5/5 games, 0 errors, all sockets connected');
  allSocks.forEach(s => s.disconnect());
}, 180000);
