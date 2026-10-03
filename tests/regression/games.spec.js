// Happy path for every game: 1 TV + 3 phones play a full game through the
// shared intro, gameplay and end screen. Filter with GAMES=caption,drawing.
import { test, expect } from '@playwright/test';
import { ALL_GAMES, openTable, createRoom, joinRoom, startFromTv, playUntilGameOver } from './helpers.js';

const games = process.env.GAMES ? process.env.GAMES.split(',') : ALL_GAMES;

for (const game of games) {
  test(`${game}: full game with 1 TV + 3 phones`, async ({ browser }) => {
    test.setTimeout(10 * 60_000);
    const table = await openTable(browser, 3);
    try {
      const code = await createRoom(table.tv, game, { rounds: 3 });
      for (let i = 0; i < 3; i++) await joinRoom(table.phones[i], code, ['Alice', 'Bob', 'Carl'][i]);
      await startFromTv(table.tv);

      // Every game starts with the shared intro on every phone.
      for (const p of table.phones) await expect(p.getByTestId('game-intro')).toBeVisible({ timeout: 10_000 });

      const tvText = await playUntilGameOver(table);
      expect(tvText).toMatch(/Game Over|Final Results|That's a Wrap/i);
      // Every phone ends on the shared end screen, host-only buttons hidden.
      for (const p of table.phones) {
        await expect(p.getByTestId('waiting-host')).toBeVisible({ timeout: 10_000 });
        await expect(p.locator('button', { hasText: 'Play Again' })).toHaveCount(0);
      }
      expect(table.errors, table.errors.join('\n')).toEqual([]);
    } finally {
      await table.close();
    }
  });
}
