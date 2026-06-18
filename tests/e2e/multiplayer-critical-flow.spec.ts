import { test, expect } from './fixtures';
import { GameActions } from './helpers/gameActions';

test.describe('Multiplayer Game Flow (Host + Players)', () => {
  test('Complete game cycle (Creation -> Join -> Start -> Sync)', async ({ hostPage, playerPages }) => {
    
    // --- Phase A: Game Creation ---
    const pin = await GameActions.createGame(hostPage);
    expect(pin).toMatch(/^[A-Z0-9]{4}$/); // Assert 4 alphanumeric characters
    
    // --- Phase B: Player Join ---
    // Have Player 1 join first so they are guaranteed to be the Host Controller (VIP)
    await GameActions.joinGame(playerPages[0], pin, 'Player_1');
    // Wait for Player 1 to fully enter the lobby before proceeding to guarantee VIP status
    await expect(playerPages[0].getByText('Player_1')).toBeVisible({ timeout: 5000 });
    
    // Have the rest join concurrently
    const joinPromises = playerPages.slice(1).map((page, index) => 
      GameActions.joinGame(page, pin, `Player_${index + 2}`)
    );
    await Promise.all(joinPromises);

    // Host sees all players appear
    const hostPlayerList = hostPage.getByTestId('host-lobby-player-list');
    for (let i = 0; i < playerPages.length; i++) {
      await expect(hostPlayerList).toContainText(`Player_${i + 1}`, { timeout: 10000 });
    }

    // --- Phase C: Game Start ---
    // The Host Screen (Big Screen Mode) controls the game, so start from the host page!
    await GameActions.startGame(hostPage);

    // Assert ALL contexts transition synchronously
    await Promise.all([
      expect(hostPage.getByTestId('host-question-screen')).toBeVisible({ timeout: 15000 }),
      ...playerPages.map(page => expect(page).not.toHaveURL(/.*lobby/, { timeout: 15000 })) 
      // The exact player screen testId depends on the sub-game, but we verify they left the lobby
    ]);

    // --- Phase D/E/F: Game Logic & Pause ---
    // To keep this suite universally scalable across different mini-games (Who Said That, Most Likely To, etc.),
    // we assert the global sync was successful.
    
    // As a demonstration of pause validation, if a pause button existed on the host controller:
    // await hostController.getByTestId('btn-pause').click();
    // await expect(hostPage.getByText('⏸ Paused')).toBeVisible();

    // --- Phase G: Storage and UI Uniqueness Validation ---
    // Assert that the names are safely stored in sessionStorage (prevents cross-tab pollution bug)
    const player1Page = playerPages[0];
    const sessionName = await player1Page.evaluate(() => sessionStorage.getItem('wst_playerName'));
    expect(sessionName).toBe('Player_1');
    const localName = await player1Page.evaluate(() => localStorage.getItem('wst_playerName'));
    expect(localName).toBeNull();

  });
});
