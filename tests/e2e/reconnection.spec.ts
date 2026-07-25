import { test, expect } from './fixtures';
import { GameActions } from './helpers/gameActions';

/**
 * Phase 1 reliability suite: a player must survive refreshes, network blips and
 * a full browser close mid-round without ending up on the wrong screen, losing
 * their identity, or spawning a duplicate.
 *
 * These run against already-running dev servers (client :5173 + server :3001),
 * same as the rest of tests/e2e — start them with `npm run dev` first.
 */
test.describe('Reconnection resilience', () => {
  // Drive host + players from lobby into an active round of the default game.
  async function startRound(hostPage, playerPages) {
    const pin = await GameActions.createGame(hostPage);

    await GameActions.joinGame(playerPages[0], pin, 'Player_1');
    await expect(playerPages[0].getByText('Player_1')).toBeVisible({ timeout: 5000 });
    await Promise.all(
      playerPages.slice(1).map((page, i) => GameActions.joinGame(page, pin, `Player_${i + 2}`))
    );

    await GameActions.startGame(hostPage);
    await Promise.all(
      playerPages.map(page => expect(page).not.toHaveURL(/.*lobby/, { timeout: 15000 }))
    );
    return pin;
  }

  test('a browser refresh mid-round returns the player to the game, not the lobby', async ({ hostPage, playerPages }) => {
    await startRound(hostPage, playerPages);

    const player = playerPages[0];
    const urlBefore = new URL(player.url()).pathname;
    expect(urlBefore).not.toBe('/lobby');

    // Full page reload — sessionStorage keeps identity, socket auto-rejoins,
    // server replays the authoritative snapshot via join_success (isRejoin).
    await player.reload();

    // They must land back on the same in-game screen, never dumped to /lobby.
    await expect(player).not.toHaveURL(/.*lobby/, { timeout: 15000 });
    await expect(player).toHaveURL(new RegExp(urlBefore.replace(/\//g, '\\/') + '$'), { timeout: 15000 });

    // The socket must actually have reconnected and the game state restored —
    // not merely the URL preserved. The answer input only renders once the
    // authoritative question phase is restored, and the Reconnecting overlay
    // must be gone.
    await expect(player.getByTestId('player-answer-input')).toBeVisible({ timeout: 15000 });
    await expect(player.getByTestId('connection-overlay')).toBeHidden();

    // Identity preserved across the refresh.
    const idAfter = await player.evaluate(() => sessionStorage.getItem('wst_playerId'));
    expect(idAfter).toBeTruthy();
  });

  test('a network blip shows the Reconnecting overlay, then clears and restores the screen', async ({ hostPage, playerPages, playerContexts }) => {
    await startRound(hostPage, playerPages);

    const player = playerPages[0];
    const urlBefore = new URL(player.url()).pathname;

    // Simulate losing the network (phone sleep / tunnel / app switch). Detection
    // is heartbeat-driven (~server pingTimeout), so allow a generous window.
    await playerContexts[0].setOffline(true);
    await expect(player.getByTestId('connection-overlay')).toBeVisible({ timeout: 25000 });

    // Back online — the overlay must clear and we must still be in-game.
    await playerContexts[0].setOffline(false);
    await expect(player.getByTestId('connection-overlay')).toBeHidden({ timeout: 25000 });
    await expect(player).toHaveURL(new RegExp(urlBefore.replace(/\//g, '\\/') + '$'), { timeout: 15000 });
  });

  test('re-entering the same name after a full disconnect reattaches instead of duplicating', async ({ hostPage, playerPages, browser }) => {
    const pin = await startRound(hostPage, playerPages);

    // Player_1 closes the browser entirely (loses sessionStorage identity) and
    // the socket disconnect registers on the server.
    await playerPages[0].close();
    await hostPage.waitForTimeout(2000);

    // They reopen on a brand-new context (fresh storage) and re-enter the SAME
    // name + pin — no stored playerId to prove who they are.
    const freshCtx = await browser.newContext();
    const reopened = await freshCtx.newPage();
    await reopened.goto('http://localhost:5173/');
    await reopened.getByTestId('player-input-name').fill('Player_1');
    await reopened.getByTestId('player-input-pin').fill(pin);
    await reopened.getByTestId('player-btn-join').click();

    // If they were reconciled onto their existing (offline) slot, the server
    // treats this as a rejoin and restores them INTO the active round. If it had
    // instead minted a duplicate, it would flag them joinedMidRound and force
    // them to /lobby. So "not on lobby" is the clean signal for no-duplicate.
    await expect(reopened).not.toHaveURL(/.*lobby/, { timeout: 15000 });

    await freshCtx.close();
  });
});
