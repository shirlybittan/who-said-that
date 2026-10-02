// Connection & room lifecycle: refresh, permanent disconnect, late join,
// TV refresh / view-only display, host on a phone.
import { test, expect } from '@playwright/test';
import { CLIENT, openTable, createRoom, joinRoom, startFromTv, autoStep, sleep } from './helpers.js';

async function toQuestion(table, game = 'who-said-that') {
  const code = await createRoom(table.tv, game, { rounds: 3 });
  for (let i = 0; i < table.phones.length; i++) await joinRoom(table.phones[i], code, ['Alice', 'Bob', 'Carl', 'Dana'][i]);
  await startFromTv(table.tv);
  for (const p of table.phones) await p.getByTestId('intro-ready-btn').click();
  await table.phones[0].waitForURL(/\/question/, { timeout: 15_000 });
  return code;
}

test('a phone that refreshes mid-round keeps its submitted answer', async ({ browser }) => {
  const table = await openTable(browser, 3);
  try {
    await toQuestion(table);
    const [alice] = table.phones;
    await alice.getByTestId('player-answer-input').fill('my answer');
    await alice.getByTestId('player-answer-submit').click();
    await expect(alice.getByTestId('player-waiting')).toBeVisible();
    await alice.reload();
    await expect(alice.getByTestId('player-waiting')).toBeVisible({ timeout: 10_000 });
    await expect(alice.locator('body')).toContainText('1 / 3');
  } finally { await table.close(); }
});

test('a player who leaves for good does not hold up the round', async ({ browser }) => {
  const table = await openTable(browser, 3);
  try {
    await toQuestion(table);
    await table.contexts[3].close(); // Carl's phone is gone
    const start = Date.now();
    await autoStep(table.phones[0]);
    await autoStep(table.phones[1]);
    await table.phones[0].waitForURL(/\/vote/, { timeout: 20_000 });
    expect(Date.now() - start).toBeLessThan(15_000); // not the 30s answer timer
  } finally { await table.close(); }
});

test('a late joiner waits in the lobby and plays from the next round', async ({ browser }) => {
  const table = await openTable(browser, 3);
  try {
    const code = await toQuestion(table);
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
    const dana = await ctx.newPage();
    await joinRoom(dana, code, 'Dana');
    await expect(dana.locator('body')).toContainText("You've joined");
    await expect(table.tv.locator('body')).toContainText('0/3');
    for (const p of table.phones) await autoStep(p);
    await sleep(2500);
    await expect(dana).toHaveURL(/\/lobby/);
    await ctx.close();
  } finally { await table.close(); }
});

test('the TV keeps control after a refresh; a keyless screen is view-only', async ({ browser }) => {
  const table = await openTable(browser, 3);
  try {
    const code = await createRoom(table.tv, 'who-said-that', { rounds: 3 });
    for (let i = 0; i < 3; i++) await joinRoom(table.phones[i], code, ['Alice', 'Bob', 'Carl'][i]);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const viewer = await ctx.newPage();
    await viewer.goto(`${CLIENT}/host?room=${code}`);
    await sleep(2000);
    await expect(viewer.getByTestId('lobby-start-btn')).toHaveCount(0);
    await table.tv.reload();
    await expect(table.tv.getByTestId('lobby-start-btn')).toBeVisible({ timeout: 10_000 });
    await ctx.close();
  } finally { await table.close(); }
});

test('a game can be hosted and played from a phone with no TV', async ({ browser }) => {
  const table = await openTable(browser, 3);
  try {
    const [host, bob, carl] = table.phones;
    await host.goto(`${CLIENT}/`);
    await host.getByTestId('player-input-name').fill('Hosty');
    await host.getByTestId('player-btn-host-phone').click();
    await host.waitForURL(/\/lobby/);
    const badge = host.getByTestId('room-code-badge');
    await expect(badge).toBeVisible();
    const code = (await badge.innerText()).trim().slice(-4);
    await expect(host.getByTestId('show-on-tv')).toBeVisible();
    await joinRoom(bob, code, 'Bob');
    await joinRoom(carl, code, 'Carl');
    await host.getByTestId('lobby-start-btn').click();
    await expect(host.getByTestId('game-intro')).toBeVisible();
    for (const p of table.phones) await p.getByTestId('intro-ready-btn').click();
    await host.waitForURL(/\/question/, { timeout: 15_000 });
  } finally { await table.close(); }
});

test('a TV refresh mid-question keeps the round counter', async ({ browser }) => {
  const table = await openTable(browser, 3);
  try {
    await toQuestion(table);
    await expect(table.tv.locator('body')).toContainText(/Round 1/i);
    await table.tv.reload();
    await expect(table.tv.locator('body')).toContainText(/Round 1/i, { timeout: 10_000 });
    await expect(table.tv.locator('body')).not.toContainText(/Round 0/i);
  } finally { await table.close(); }
});

test('an unsent answer survives a refresh', async ({ browser }) => {
  const table = await openTable(browser, 3);
  try {
    await toQuestion(table);
    const [alice] = table.phones;
    await alice.getByTestId('player-answer-input').fill('half-typed thought');
    await alice.reload();
    await expect(alice.getByTestId('player-answer-input')).toHaveValue('half-typed thought', { timeout: 10_000 });
  } finally { await table.close(); }
});
