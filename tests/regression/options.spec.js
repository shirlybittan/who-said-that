// Host options that change the rules must actually change them.
import { test, expect } from '@playwright/test';
import { CLIENT, GAME_LABELS, openTable, joinRoom, startFromTv } from './helpers.js';

test('MLT with "vote for themselves" off: your own name is not a choice', async ({ browser }) => {
  const table = await openTable(browser, 3);
  try {
    const { tv, phones } = table;
    await tv.goto(`${CLIENT}/host`);
    await tv.getByTestId('host-btn-create-room').click();
    await tv.locator('button', { hasText: GAME_LABELS['most-likely-to'] }).first().click();
    await tv.getByTestId('mlt-allow-self-vote').locator('input').uncheck();
    await tv.locator('button', { hasText: 'Create & Display' }).click();
    const code = (await tv.getByTestId('host-lobby-pin').innerText()).trim();
    const names = ['Alice', 'Bob', 'Carl'];
    for (let i = 0; i < 3; i++) await joinRoom(phones[i], code, names[i]);
    await startFromTv(tv);
    for (const p of phones) await p.getByTestId('intro-ready-btn').click();
    await phones[0].waitForURL(/\/mlt-vote/, { timeout: 15_000 });
    const choices = phones[0].locator('button', { hasText: /^(A|B|C)\s*(Alice|Bob|Carl)/ });
    await expect(choices).toHaveCount(2);
    await expect(phones[0].locator('button', { hasText: 'Alice' })).toHaveCount(0);
    await expect(phones[1].locator('button', { hasText: 'Bob' })).toHaveCount(0);
  } finally { await table.close(); }
});
