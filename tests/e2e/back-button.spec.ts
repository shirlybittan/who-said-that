import { test, expect } from './fixtures';
import { GameActions } from './helpers/gameActions';

/**
 * Regression for the browser-Back stuck-view: hitting Back mid-game pops to the
 * lobby, the reconciler instantly corrects the URL back to the live screen — but
 * with AnimatePresence mode="wait" the VIEW could stick on the old (lobby) page
 * even though the URL was right. This asserts the live screen's CONTENT is
 * actually rendered, not just the URL. Runs against live dev servers.
 */
test.describe('Browser back button mid-game', () => {
  test('returns the player to the live screen — view, not just URL', async ({ hostPage, playerPages }) => {
    const pin = await GameActions.createGame(hostPage);
    await GameActions.joinGame(playerPages[0], pin, 'P1');
    await expect(playerPages[0].getByText('P1')).toBeVisible({ timeout: 5000 });
    await Promise.all(playerPages.slice(1).map((p, i) => GameActions.joinGame(p, pin, `P${i + 2}`)));
    await GameActions.startGame(hostPage);

    const player = playerPages[0];
    await expect(player).not.toHaveURL(/.*lobby/, { timeout: 15000 });
    // The live question screen is rendered (answer input present).
    await expect(player.getByTestId('player-answer-input')).toBeVisible({ timeout: 15000 });

    // Hit browser Back → pops to /lobby; the reconciler corrects the URL. The
    // rendered VIEW must be the live screen again, not stuck on the lobby.
    await player.goBack();
    await expect(player).not.toHaveURL(/.*lobby/, { timeout: 10000 });
    await expect(player.getByTestId('player-answer-input')).toBeVisible({ timeout: 10000 });
    // And no lobby content is left rendered.
    await expect(player.getByText('Waiting for host to start...')).toHaveCount(0);
  });
});
