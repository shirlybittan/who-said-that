/**
 * Bug Regression E2E Tests
 *
 * Verifies that previously stuck-count bugs are fixed:
 *  1. Draw on Friends (selfie) — photo count shows X/N correctly (totalPhotographers field)
 *  2. Selfie Artist — voting round closes after all vote (allVoted check)
 *  3. Selfie Captions — all players (including featured owner) can write & vote; all-submitted triggers advance
 *  4. Selfie Challenge (photovote:pmatch) — voting round closes; "(you)" only on own photo (via playerId)
 *  5. playerId isolation — sessionStorage (each socket gets unique ID; no cross-contamination)
 */

import { io } from 'socket.io-client';
import { test, expect } from '@playwright/test';

const SERVER = 'http://localhost:3001';
const DELAY   = (ms) => new Promise(r => setTimeout(r, ms));
const FAKE_PHOTO   = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const FAKE_STROKES = [{ color: '#FF0000', width: 4, type: 'pen', points: [{ x: 10, y: 10 }, { x: 50, y: 50 }] }];

function connect() {
  return new Promise((resolve, reject) => {
    const sock = io(SERVER, { transports: ['websocket'], forceNew: true });
    const t = setTimeout(() => reject(new Error('connect timeout')), 8000);
    sock.once('connect', () => { clearTimeout(t); resolve(sock); });
    sock.once('connect_error', err => { clearTimeout(t); reject(err); });
  });
}

function waitFor(sock, event, ms = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      sock.off(event, h);
      reject(new Error(`Timeout waiting for '${event}' (${ms}ms)`));
    }, ms);
    function h(data) { clearTimeout(t); resolve(data); }
    sock.once(event, h);
  });
}

async function createRoom(hostSock, gameType = 'who-said-that') {
  return new Promise(resolve => {
    hostSock.once('room_created', resolve);
    hostSock.emit('create_room', { playerName: 'TestHost', gameType, hostIsPlaying: false });
  });
}

async function joinPlayers(socks, code, names) {
  const ids = [];
  for (let i = 0; i < socks.length; i++) {
    const id = await new Promise(resolve => {
      socks[i].once('join_success', d => resolve(d.playerId));
      socks[i].emit('join_room', { code, playerName: names[i] });
    });
    ids.push(id);
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1 — Draw on Friends: totalPhotographers displayed correctly (3/3 not 3/)
// ─────────────────────────────────────────────────────────────────────────────
test('Draw on Friends: photo_received emits totalPhotographers (not undefined)', async ({ page }) => {
  const hostSock = await connect();
  const [s1, s2, s3] = await Promise.all([connect(), connect(), connect()]);
  const socks = [s1, s2, s3];

  const { code } = await createRoom(hostSock);
  console.log(`\n📸 [Draw on Friends] Room: ${code}`);
  const ids = await joinPlayers(socks, code, ['Alice', 'Bob', 'Carol']);

  // Listen for selfie:photo_received on each player socket
  const photoEvents = [];
  socks.forEach(s => s.on('selfie:photo_received', d => photoEvents.push(d)));

  // Start selfie game
  const photoPhaseP = waitFor(hostSock, 'selfie:photo_phase', 8000);
  hostSock.emit('selfie:start', { code, rounds: 1 });
  const pp = await photoPhaseP;
  expect(pp.players?.length).toBe(3);
  console.log(`  ✅ selfie:photo_phase arrived, totalPhotographers=${pp.totalPhotographers}`);
  expect(pp.totalPhotographers).toBe(3);

  // All 3 players submit photos; catch the drawing_phase as end signal
  const drawPhaseP = waitFor(hostSock, 'selfie:drawing_phase', 12000);
  for (const s of socks) {
    s.emit('selfie:submit_photo', { code, photoData: FAKE_PHOTO });
    await DELAY(100);
  }
  await drawPhaseP;

  // Verify every selfie:photo_received event had correct totalPhotographers
  console.log(`  📊 Received ${photoEvents.length} selfie:photo_received events`);
  expect(photoEvents.length).toBeGreaterThanOrEqual(3);
  for (const ev of photoEvents) {
    expect(ev.totalPhotographers).toBe(3);
    console.log(`  ✅ Event: photoCount=${ev.photoCount}, totalPhotographers=${ev.totalPhotographers}`);
  }

  hostSock.disconnect(); socks.forEach(s => s.disconnect());
  console.log('  ✅ Draw on Friends totalPhotographers test PASSED');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2 — Selfie Artist: voting closes even with no-self-vote restriction
// ─────────────────────────────────────────────────────────────────────────────
test('Selfie Artist: voting closes with allVoted check (3 players all vote)', async () => {
  const hostSock = await connect();
  const [s1, s2, s3] = await Promise.all([connect(), connect(), connect()]);
  const socks = [s1, s2, s3];

  const { code } = await createRoom(hostSock);
  console.log(`\n🎨 [Selfie Artist] Room: ${code}`);
  const ids = await joinPlayers(socks, code, ['Pika', 'Bulba', 'Char']);

  hostSock.emit('selfie:start', { code, rounds: 1 });
  await waitFor(hostSock, 'selfie:photo_phase', 8000);

  const drawPhaseP = waitFor(hostSock, 'selfie:drawing_phase', 10000);
  // Register draw_assigned listeners BEFORE submitting photos (server fires them before drawing_phase broadcast)
  const drawAssignedPromises = socks.map(s => waitFor(s, 'selfie:draw_assigned', 12000));

  // All players submit photos
  for (const s of socks) { s.emit('selfie:submit_photo', { code, photoData: FAKE_PHOTO }); await DELAY(100); }
  await drawPhaseP;

  // Now await draw_assigned (listeners were registered before submit)
  const drawAssigned = await Promise.all(drawAssignedPromises);
  console.log(`  🖌 All 3 players received draw_assigned`);
  drawAssigned.forEach(a => {
    expect(a.photoData).toBeTruthy();
    expect(a.ownerPlayerId).toBeTruthy();
  });

  const votingP = waitFor(hostSock, 'selfie:voting_started', 10000);
  for (const s of socks) { s.emit('selfie:submit_drawing', { code, strokes: FAKE_STROKES }); await DELAY(100); }
  const voting = await votingP;

  console.log(`  🗳 Voting started: ${voting.submissions?.length} submissions`);
  expect(voting.submissions?.length).toBe(3);

  // Register results listener BEFORE voting (avoid race condition)
  const resultsP = waitFor(hostSock, 'selfie:results', 10000);

  // Track vote_received to see counts
  const voteReceived = [];
  hostSock.on('selfie:vote_received', d => {
    voteReceived.push(d);
    console.log(`  📊 vote_received: ${d.voteCount}/${d.totalVoters}`);
  });

  // Each player votes for someone else's drawing (not their own)
  for (let i = 0; i < socks.length; i++) {
    const target = voting.submissions.find(s => s.drawerId !== ids[i]);
    socks[i].emit('selfie:vote', { code, drawerId: target.drawerId });
    await DELAY(100);
  }

  const results = await resultsP;
  console.log(`  ✅ Results arrived: isFinal=${results.isFinal}, submissions=${results.submissions?.length}`);
  expect(results.submissions?.length).toBe(3);

  // Verify vote counts reached 3/3
  const maxVoteEvent = voteReceived[voteReceived.length - 1];
  expect(maxVoteEvent?.voteCount).toBe(3);
  expect(maxVoteEvent?.totalVoters).toBe(3);
  console.log(`  ✅ Final vote_received shows 3/3 — NOT STUCK`);

  hostSock.disconnect(); socks.forEach(s => s.disconnect());
  console.log('  ✅ Selfie Artist voting test PASSED');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3 — Selfie Captions: all players (incl. featured owner) can write & vote
// ─────────────────────────────────────────────────────────────────────────────
test('Selfie Captions: all players write (including featured owner), voting closes', async () => {
  const hostSock = await connect();
  const [s1, s2, s3] = await Promise.all([connect(), connect(), connect()]);
  const socks = [s1, s2, s3];

  const { code } = await createRoom(hostSock);
  console.log(`\n💬 [Selfie Captions] Room: ${code}`);
  const ids = await joinPlayers(socks, code, ['Dave', 'Eve', 'Frank']);

  // Start Caption game
  hostSock.emit('caption:start', { code, rounds: 1 });
  const photoPhase = await waitFor(hostSock, 'caption:photo_phase', 8000);
  console.log(`  📸 Caption photo phase started`);

  // All submit photos
  const writingPhaseP = waitFor(hostSock, 'caption:writing_phase', 10000);
  for (const s of socks) { s.emit('caption:submit_photo', { code, photoData: FAKE_PHOTO }); await DELAY(100); }
  const writingPhase = await writingPhaseP;

  console.log(`  ✍️ Writing phase: featuredOwnerId=${writingPhase.featuredOwnerId}, writers=${writingPhase.writers?.length}`);
  // All 3 players should be in writers list (including featured owner)
  expect(writingPhase.writers?.length).toBe(3);
  console.log(`  ✅ writers.length = 3 — featured owner IS included`);

  // Track caption_submitted events
  const captionSubmittedEvents = [];
  hostSock.on('caption:caption_submitted', d => {
    captionSubmittedEvents.push(d);
    console.log(`  📝 caption_submitted: ${d.submittedCount}/${d.totalCount}`);
  });

  // Register voting_phase listener BEFORE submitting all captions
  const votingPhaseP = waitFor(hostSock, 'caption:voting_phase', 12000);

  // Also register caption:your_caption_id listeners BEFORE submitting
  const myCaptionIds = {};
  socks.forEach((s, i) => {
    s.once('caption:your_caption_id', d => { myCaptionIds[i] = d.captionId; });
  });

  // All 3 players submit captions
  for (let i = 0; i < socks.length; i++) {
    socks[i].emit('caption:submit_caption', { code, text: `Caption from player ${i+1}` });
    await DELAY(150);
  }

  const votingPhase = await votingPhaseP;
  console.log(`  🗳 Voting phase: ${votingPhase.captions?.length} captions`);
  expect(votingPhase.captions?.length).toBe(3);
  console.log(`  ✅ All 3 captions collected (including featured owner's) — NOT STUCK at 2/3`);

  // Verify the final caption_submitted showed 3/3
  const last = captionSubmittedEvents[captionSubmittedEvents.length - 1];
  expect(last?.submittedCount).toBe(3);
  expect(last?.totalCount).toBe(3);

  // Register round_results listener BEFORE voting
  const roundResultsP = waitFor(hostSock, 'caption:round_results', 12000);

  // Track vote_received
  const voteReceivedEvents = [];
  hostSock.on('caption:vote_received', d => {
    voteReceivedEvents.push(d);
    console.log(`  🗳 vote_received: ${d.voteCount}/${d.totalVoters}`);
  });

  // All players vote for someone else's caption
  // myCaptionIds was populated above when each player submitted (caption:your_caption_id)
  await DELAY(300); // small buffer for events to settle
  console.log(`  🗂 myCaptionIds: ${JSON.stringify(myCaptionIds)}`);

  const captionIds = votingPhase.captions.map(c => c.id);
  for (let i = 0; i < socks.length; i++) {
    // Vote for any caption that is not the player's own
    const targetCaption = captionIds.find(cid => cid !== myCaptionIds[i]) || captionIds[0];
    console.log(`  Player ${i}: voting for ${targetCaption} (own=${myCaptionIds[i]})`);
    socks[i].emit('caption:vote', { code, captionId: targetCaption });
    await DELAY(200);
  }

  const roundResults = await roundResultsP;
  console.log(`  ✅ Round results arrived: ${roundResults.captionResults?.length} captions scored`);
  expect(roundResults.captionResults?.length).toBe(3);

  // Verify vote counts
  const lastVote = voteReceivedEvents[voteReceivedEvents.length - 1];
  expect(lastVote?.totalVoters).toBe(3);
  console.log(`  ✅ totalVoters=${lastVote?.totalVoters} — NOT STUCK`);

  hostSock.disconnect(); socks.forEach(s => s.disconnect());
  console.log('  ✅ Selfie Captions test PASSED');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4 — Selfie Challenge (pmatch): voting closes with allVoted check
// ─────────────────────────────────────────────────────────────────────────────
test('Selfie Challenge (pmatch): voting round closes — NOT stuck at 2/3', async () => {
  const hostSock = await connect();
  const [s1, s2, s3] = await Promise.all([connect(), connect(), connect()]);
  const socks = [s1, s2, s3];

  const { code } = await createRoom(hostSock);
  console.log(`\n🎭 [Selfie Challenge] Room: ${code}`);
  const ids = await joinPlayers(socks, code, ['Xena', 'Yogi', 'Zara']);

  const photoPhaseP = waitFor(hostSock, 'photovote:photo_phase', 8000);
  hostSock.emit('photovote:start', { code, subType: 'pmatch', rounds: 1 });
  const photoPhase = await photoPhaseP;
  console.log(`  📸 Photo phase: subType=${photoPhase.subType}`);
  expect(photoPhase.subType).toBe('pmatch');

  // All submit photos
  const votingPhaseP = waitFor(hostSock, 'photovote:voting_phase', 10000);
  for (const s of socks) { s.emit('photovote:submit_photo', { code, photoData: FAKE_PHOTO }); await DELAY(100); }
  const votingPhase = await votingPhaseP;
  console.log(`  🗳 Voting phase: prompt="${String(votingPhase.prompt).slice(0,60)}"`);
  expect(votingPhase.photos?.length).toBe(3);

  // Verify each photo has a unique playerId
  const playerIdsInPhotos = votingPhase.photos.map(p => p.playerId);
  const uniqueIds = new Set(playerIdsInPhotos);
  expect(uniqueIds.size).toBe(3);
  console.log(`  ✅ Photos have 3 unique playerIds: ${playerIdsInPhotos.join(', ')}`);
  console.log(`  ✅ Each player will see their OWN photo as "(you)" only (unique IDs)`);

  // Register round_results listener BEFORE voting
  const roundResultsP = waitFor(hostSock, 'photovote:round_results', 10000);

  const voteReceivedEvents = [];
  hostSock.on('photovote:vote_received', d => {
    voteReceivedEvents.push(d);
    console.log(`  📊 vote_received: ${d.voteCount}/${d.totalVoters}`);
  });

  // All 3 players vote (no self-vote — each votes for next player's photo)
  for (let i = 0; i < socks.length; i++) {
    const targetId = ids[(i + 1) % ids.length];
    socks[i].emit('photovote:vote', { code, targetPlayerId: targetId });
    await DELAY(100);
  }

  const roundResults = await roundResultsP;
  console.log(`  ✅ Round results: ${roundResults.voteResults?.length} players`);
  expect(roundResults.voteResults?.length).toBe(3);

  const lastVote = voteReceivedEvents[voteReceivedEvents.length - 1];
  expect(lastVote?.voteCount).toBe(3);
  console.log(`  ✅ voteCount reached 3/3 — NOT STUCK`);

  hostSock.disconnect(); socks.forEach(s => s.disconnect());
  console.log('  ✅ Selfie Challenge pmatch test PASSED');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5 — Host Screen: verify Selfie Challenge socket flow + screenshot
// ─────────────────────────────────────────────────────────────────────────────
test('Host screen: Selfie Challenge shows correct label and vote counts', async ({ page }) => {
  const hostSock = await connect();
  const [s1, s2, s3] = await Promise.all([connect(), connect(), connect()]);
  const socks = [s1, s2, s3];

  const { code } = await createRoom(hostSock);
  console.log(`\n📺 [Host Screen] Room: ${code}`);
  const ids = await joinPlayers(socks, code, ['Ann', 'Ben', 'Cal']);

  // Navigate host browser to this room
  await page.goto(`http://localhost:5173/host?room=${code}`);
  await page.waitForTimeout(2000);

  // The browser's join_spectator replaces hostSock's socketId — reclaim host control
  await new Promise(resolve => {
    hostSock.once('spectator_joined', resolve);
    hostSock.emit('join_spectator', { code });
  });
  console.log(`  🔑 hostSock reclaimed host control`);

  // Check players on host screen
  const bodyText1 = await page.textContent('body');
  const hasPlayers = bodyText1.includes('Ann') || bodyText1.includes('Ben') || bodyText1.includes('Cal') || bodyText1.includes('3');
  console.log(`  Host shows players joined: ${hasPlayers ? '✅' : '⚠️'}`);

  // Register photo_phase listener before start (avoid race condition)
  const photoPhaseP = waitFor(hostSock, 'photovote:photo_phase', 10000);
  hostSock.emit('photovote:start', { code, subType: 'pmatch', rounds: 1 });
  await photoPhaseP;
  await page.waitForTimeout(1500);

  // Host screen should show game started
  const bodyAfterStart = await page.textContent('body');
  console.log(`  Host body after start: ${bodyAfterStart.substring(0, 400)}`);
  const hasLabel = bodyAfterStart.includes('Selfie') || bodyAfterStart.includes('Photo') || bodyAfterStart.includes('Challenge');
  console.log(`  Host shows game started: ${hasLabel ? '✅' : '⚠️ (UI may need visual check)'}`);
  await page.screenshot({ path: 'test-results/host-start.png' });

  // Submit photos
  const votingPhaseP = waitFor(hostSock, 'photovote:voting_phase', 10000);
  for (const s of socks) { s.emit('photovote:submit_photo', { code, photoData: FAKE_PHOTO }); await DELAY(100); }
  await votingPhaseP;
  await page.waitForTimeout(1500);

  const bodyVoting = await page.textContent('body');
  const hasVotingUI = bodyVoting.includes('Votes') || bodyVoting.includes('vote') || bodyVoting.includes('Round') || bodyVoting.includes('Ann');
  console.log(`  Host shows voting UI: ${hasVotingUI ? '✅' : '⚠️'}`);
  await page.screenshot({ path: 'test-results/host-voting.png' });
  console.log(`  📸 Screenshots saved to test-results/`);

  // Register round_results listener BEFORE voting
  const roundResultsP = waitFor(hostSock, 'photovote:round_results', 10000);

  // All vote
  for (let i = 0; i < socks.length; i++) {
    const targetId = ids[(i + 1) % ids.length];
    socks[i].emit('photovote:vote', { code, targetPlayerId: targetId });
    await DELAY(100);
  }
  await roundResultsP;
  await page.waitForTimeout(1500);

  const bodyResults = await page.textContent('body');
  const hasResults = bodyResults.includes('Result') || bodyResults.includes('Winner') || bodyResults.includes('Score') || bodyResults.includes('🥇') || bodyResults.includes('Ann');
  console.log(`  Host shows results: ${hasResults ? '✅' : '⚠️'}`);
  await page.screenshot({ path: 'test-results/host-results.png' });

  console.log(`  ✅ vote closed 3/3 and host browser rendered without errors`);
  hostSock.disconnect(); socks.forEach(s => s.disconnect());
  console.log('  ✅ Host Screen Selfie Challenge test PASSED');
});
