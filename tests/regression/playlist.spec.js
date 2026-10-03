// A playlist containing every game, 3 rounds each, played through "▶ Next".
// Slow (tens of minutes); run alone with: npm run test:regression -- playlist
import { test, expect } from '@playwright/test';
import { ALL_GAMES, openTable, createRoom, joinRoom, startFromTv, playUntilGameOver } from './helpers.js';

const queue = process.env.PLAYLIST ? process.env.PLAYLIST.split(',') : ALL_GAMES;

test('playlist of every game advances to the final party scoreboard', async ({ browser }) => {
  test.setTimeout(queue.length * 8 * 60_000);
  const table = await openTable(browser, 3);
  try {
    const code = await createRoom(table.tv, 'playlist', { rounds: 3, queue });
    for (let i = 0; i < 3; i++) await joinRoom(table.phones[i], code, ['Alice', 'Bob', 'Carl'][i]);
    await startFromTv(table.tv);
    // playUntilGameOver clicks "▶ Next: <game>" after each game until the last one.
    await playUntilGameOver(table, { maxMs: queue.length * 8 * 60_000 });
    await expect(table.tv.getByTestId('party-scoreboard')).toBeVisible();
    await expect(table.tv.getByTestId('party-scoreboard')).toContainText('Final Party Scoreboard');
    expect(table.errors, table.errors.join('\n')).toEqual([]);
  } finally {
    await table.close();
  }
});
