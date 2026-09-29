// Timer expiry: nobody submits → the game still advances; the host can end a
// timed phase early with Continue; the shell timer is the only timer shown.
import { test, expect } from '@playwright/test';
import { openTable, createRoom, joinRoom, startFromTv } from './helpers.js';

async function startGame(table, game) {
  const code = await createRoom(table.tv, game, { rounds: 3 });
  for (let i = 0; i < 3; i++) await joinRoom(table.phones[i], code, ['Alice', 'Bob', 'Carl'][i]);
  await startFromTv(table.tv);
  await table.tv.getByTestId('host-intro-start-now').click();
}

test('WST: nobody answers → the answer timer moves everyone to voting', async ({ browser }) => {
  test.setTimeout(120_000);
  const table = await openTable(browser, 3);
  try {
    await startGame(table, 'who-said-that');
    const [alice] = table.phones;
    await alice.waitForURL(/\/question/, { timeout: 15_000 });
    await expect(alice.getByTestId('game-timer')).toBeVisible();
    await expect(alice.locator('text=/⏳/')).toHaveCount(0); // no second, page-level timer
    await alice.waitForURL(/\/vote/, { timeout: 45_000 });
  } finally { await table.close(); }
});

test('Caption: the host Continue ends the photo phase once 2 photos are in', async ({ browser }) => {
  test.setTimeout(120_000);
  const table = await openTable(browser, 3);
  try {
    await startGame(table, 'caption');
    await expect(table.tv.getByTestId('timed-phase-controls')).toBeVisible({ timeout: 15_000 });
    const photo = await table.phones[0].evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const b = await new Promise((r) => c.toBlob(r, 'image/jpeg'));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    for (const p of table.phones.slice(0, 2)) {
      await p.locator('input[type=file]').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photo) });
      await p.locator('button', { hasText: 'Use This!' }).click();
    }
    await table.tv.locator('button', { hasText: '⏭ Continue' }).click();
    await table.phones[0].waitForURL(/\/caption-write/, { timeout: 15_000 });
  } finally { await table.close(); }
});
