// Shared helpers for the multiplayer regression suite: 1 TV (host screen) + N
// phones, each in its own browser context, driving the real UI.
import { expect } from '@playwright/test';

export const CLIENT = process.env.CLIENT_URL || 'http://localhost:5173';
export const SERVER = process.env.SERVER_URL || 'http://localhost:3001';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Game ids → the label shown on the TV picker (games/registry.js names).
export const GAME_LABELS = {
  'who-said-that': 'Who Said That?', situational: 'Situational', 'most-likely-to': 'Most Likely To',
  'this-or-that': 'This or That', 'fill-in-the-blank': 'Fill in the Blank', drawing: 'Pictionary Battle',
  'draw-telephone': 'Drawing in Chain', 'selfie-roast': 'Draw on Friends', caption: 'Selfie Captions',
  pmatch: 'Selfie Challenge', photoassoc: 'Prompt Match', mixed: 'Mixed Pack', playlist: 'Playlist',
};
export const ALL_GAMES = Object.keys(GAME_LABELS).filter((g) => !['mixed', 'playlist'].includes(g));

/** Open 1 TV + `players` phones (360×740), collecting console errors. */
export async function openTable(browser, players = 3) {
  const errors = [];
  const mk = async (name, viewport) => {
    const ctx = await browser.newContext({ viewport, permissions: ['camera'] });
    const page = await ctx.newPage();
    page.__name = name;
    page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/503|Failed to load resource/.test(m.text())) errors.push(`[${name}] ${m.text().slice(0, 200)}`);
    });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    return { ctx, page };
  };
  const tv = await mk('TV', { width: 1280, height: 800 });
  const phones = [];
  for (let i = 0; i < players; i++) phones.push(await mk(`P${i + 1}`, { width: 360, height: 740 }));
  return {
    tv: tv.page,
    phones: phones.map((p) => p.page),
    contexts: [tv.ctx, ...phones.map((p) => p.ctx)],
    errors,
    async close() { for (const c of [tv.ctx, ...phones.map((p) => p.ctx)]) await c.close().catch(() => {}); },
  };
}

/** Create a room on the TV. Returns the 4-character room code. */
export async function createRoom(tv, gameId, { rounds, queue } = {}) {
  await tv.goto(`${CLIENT}/host`);
  await tv.getByTestId('host-btn-create-room').click();
  await tv.locator('button', { hasText: GAME_LABELS[gameId] }).first().click();
  if (queue) {
    for (const g of queue) await tv.locator('button', { hasText: '+ ' }).filter({ hasText: GAME_LABELS[g] }).first().click();
  }
  if (rounds) {
    const btns = tv.locator('button', { hasText: new RegExp(`^${rounds}$`) });
    const n = await btns.count();
    for (let i = 0; i < n; i++) await btns.nth(i).click();
  }
  await tv.locator('button', { hasText: /^30s$/ }).click();
  await tv.locator('button', { hasText: 'Create & Display' }).click();
  const pin = await tv.getByTestId('host-lobby-pin');
  await expect(pin).toBeVisible({ timeout: 10_000 });
  return (await pin.innerText()).trim();
}

export async function joinRoom(phone, code, name) {
  await phone.goto(`${CLIENT}/`);
  await phone.getByTestId('player-input-name').fill(name);
  await phone.getByTestId('player-input-pin').fill(code);
  await phone.getByTestId('player-btn-join').click();
  await phone.waitForURL(/\/lobby/, { timeout: 10_000 });
}

export async function startFromTv(tv) {
  await tv.getByTestId('lobby-start-btn').click();
}

// ── Generic auto-player ─────────────────────────────────────────────────────
const SUBMIT_RE = /submit|confirm|lock in|use this|upload|i'm ready/i;
const SKIP_RE = /^(🔊|🔇)$|EN|FR|HE|sound|lang/i;

async function photoBuffer(page) {
  const bytes = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    const x = c.getContext('2d');
    for (let i = 0; i < 40; i++) { x.fillStyle = `hsl(${i * 37},80%,50%)`; x.fillRect((i * 53) % 380, (i * 31) % 280, 60, 60); }
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

async function drawOn(page) {
  const canvas = await page.$('canvas');
  const bb = canvas && (await canvas.boundingBox());
  if (!bb || bb.width < 20) return false;
  for (let s = 0; s < 2; s++) {
    await page.mouse.move(bb.x + 20 + s * 30, bb.y + 20);
    await page.mouse.down();
    for (let k = 1; k < 6; k++) await page.mouse.move(bb.x + 20 + s * 30 + k * 10, bb.y + 20 + k * (bb.height - 40) / 6, { steps: 2 });
    await page.mouse.up();
  }
  return true;
}

async function enabledButtons(page) {
  return page.$$eval('button', (bs) => bs.map((b, i) => {
    const r = b.getBoundingClientRect();
    return { i, text: (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '), ok: !b.disabled && r.width > 0 && r.height > 0 };
  }).filter((b) => b.ok));
}

/** One step of play on a phone: photo / text / drawing / choice + submit. */
export async function autoStep(page, { pick = 0, text } = {}) {
  const path = new URL(page.url()).pathname;
  const file = await page.$('input[type=file]');
  if (file && !(await page.evaluate(() => /waiting|submitted|✓/i.test(document.body.innerText)))) {
    await file.setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: await photoBuffer(page) }).catch(() => {});
    await sleep(600);
  }
  const box = await page.$('fieldset:not([disabled]) textarea, fieldset:not([disabled]) input[type=text], fieldset:not([disabled]) input:not([type])');
  let typed = false;
  if (box && (await box.isVisible()) && !(await box.inputValue())) { await box.fill(text ?? `${page.__name} was here`); typed = true; }
  if (/draw/.test(path) && !/end|reveal|wait/.test(path)) await drawOn(page);
  let buttons = (await enabledButtons(page)).filter((b) => !SKIP_RE.test(b.text));
  let submit = buttons.find((b) => SUBMIT_RE.test(b.text));
  if (!submit && !typed) {
    const choices = buttons.filter((b) => b.text && !/pause|skip|undo|clear|eraser|retake|change|joker|back|menu|edit|continue|next|show/i.test(b.text));
    const c = choices[pick % Math.max(choices.length, 1)];
    if (c) {
      await (await page.$$('button'))[c.i].click().catch(() => {});
      await sleep(300);
      buttons = (await enabledButtons(page)).filter((b) => !SKIP_RE.test(b.text));
      submit = buttons.find((b) => SUBMIT_RE.test(b.text));
    }
  }
  if (submit) await (await page.$$('button'))[submit.i].click().catch(() => {});
}

const TV_ADVANCE = /^▶ Next:|^Next Round|^Next Answer|^Show Results|^▶ Start now|^⏭ Continue|^Next →$/;

/**
 * Play until the TV shows a finished game (Play Again visible and no "▶ Next").
 * Returns the TV text at the end. Fails if nothing changes for `stallMs`.
 */
export async function playUntilGameOver(table, { maxMs = 8 * 60_000, stallMs = 90_000, stopAtQueueEnd = true } = {}) {
  const { tv, phones } = table;
  const start = Date.now();
  let last = '';
  let lastChange = Date.now();
  let tick = 0;
  while (Date.now() - start < maxMs) {
    tick++;
    await sleep(1500);
    for (let i = 0; i < phones.length; i++) await autoStep(phones[i], { pick: i + 1 }).catch(() => {});
    const tvText = (await tv.innerText('body')).replace(/\s+/g, ' ');
    const sig = tvText + phones.length;
    if (sig !== last) { last = sig; lastChange = Date.now(); }
    if (Date.now() - lastChange > stallMs) throw new Error(`Game stalled for ${stallMs / 1000}s. TV: ${tvText.slice(0, 300)}`);
    const btns = (await enabledButtons(tv)).map((b) => b.text);
    const hasNextGame = btns.some((t) => /^▶ Next:/.test(t));
    if (btns.includes('🔄 Play Again') && (!hasNextGame || !stopAtQueueEnd)) return tvText;
    const adv = btns.find((t) => TV_ADVANCE.test(t));
    if (adv && tick % 2 === 0) await tv.locator('button', { hasText: adv }).first().click().catch(() => {});
  }
  throw new Error('Game did not finish in time');
}
