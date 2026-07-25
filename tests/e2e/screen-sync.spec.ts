import { test, expect } from './fixtures';
import { GameActions } from './helpers/gameActions';

/**
 * Phase 3: the server is the authority on which screen each player belongs on.
 * A client periodically confirms its screen against the server and self-corrects
 * precise per-player mismatches (usePhaseSync handles instant coarse ones). The
 * correctness of the server's per-player route decision is unit-tested in
 * server/game/__tests__/canonicalRoute.test.js; here we guard the end-to-end
 * behaviour: the periodic check must NOT disturb a correctly-placed player, and
 * a player must not be left stranded on the lobby once the game is live.
 * Runs against live dev servers (:5173 / :3001).
 */
test.describe('Screen self-heal', () => {
  async function startRound(hostPage, playerPages) {
    const pin = await GameActions.createGame(hostPage);
    await GameActions.joinGame(playerPages[0], pin, 'Player_1');
    await expect(playerPages[0].getByText('Player_1')).toBeVisible({ timeout: 5000 });
    await Promise.all(
      playerPages.slice(1).map((p, i) => GameActions.joinGame(p, pin, `Player_${i + 2}`))
    );
    await GameActions.startGame(hostPage);
    await Promise.all(
      playerPages.map(p => expect(p).not.toHaveURL(/.*lobby/, { timeout: 15000 }))
    );
  }

  test('the periodic screen check never navigates a correctly-placed player', async ({ hostPage, playerPages }) => {
    await startRound(hostPage, playerPages);
    const player = playerPages[0];
    const url = new URL(player.url()).pathname;

    // Sit through more than one poll interval (7s). A correctly-placed player
    // must stay exactly where they are — the check only acts on real mismatches.
    await player.waitForTimeout(9000);
    expect(new URL(player.url()).pathname).toBe(url);
    await expect(player.getByTestId('connection-overlay')).toBeHidden();
  });

  test('after a reconnect the player is on the authoritative live screen, never the lobby', async ({ hostPage, playerPages, playerContexts }) => {
    await startRound(hostPage, playerPages);
    const player = playerPages[0];
    const liveUrl = new URL(player.url()).pathname;

    // Drop and restore the network — the player must come back on the correct
    // live screen (the server decides), not stuck on a stale one or the lobby.
    await playerContexts[0].setOffline(true);
    await expect(player.getByTestId('connection-overlay')).toBeVisible({ timeout: 25000 });
    await playerContexts[0].setOffline(false);
    await expect(player.getByTestId('connection-overlay')).toBeHidden({ timeout: 25000 });

    await expect(player).toHaveURL(new RegExp(liveUrl.replace(/\//g, '\\/') + '$'), { timeout: 15000 });
    await expect(player).not.toHaveURL(/.*lobby/);
  });
});
