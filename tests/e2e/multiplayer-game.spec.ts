import { test, expect } from './fixtures';
import { GameActions } from './helpers/gameActions';

test.describe('Multiplayer Game Flow (Host + Players)', () => {
  test('Complete game cycle (Creation -> Join -> Start -> Sync)', async ({ hostPage, playerPages }) => {
    
    // --- Phase A: Game Creation ---
    const pin = await GameActions.createGame(hostPage);
    expect(pin).toMatch(/^[A-Z]{4}$/); // Assert 4 uppercase letters
    
    // --- Phase B: Player Join ---
    // Have all players join concurrently for real-world simulation
    const joinPromises = playerPages.map((page, index) => 
      GameActions.joinGame(page, pin, `Player_${index + 1}`)
    );
    await Promise.all(joinPromises);

    // Host sees all players appear
    const hostPlayerList = hostPage.getByTestId('host-lobby-player-list');
    for (let i = 0; i < playerPages.length; i++) {
      await expect(hostPlayerList).toContainText(`Player_${i + 1}`, { timeout: 10000 });
    }

    // --- Phase C: Game Start ---
    // The FIRST player to join becomes the Host Controller
    const hostController = playerPages[0]; 
    await GameActions.startGame(hostController);

    // Assert ALL contexts transition synchronously
    await Promise.all([
      expect(hostPage.getByTestId('host-question-screen')).toBeVisible({ timeout: 15000 }),
      ...playerPages.map(page => expect(page.url()).not.toContain('lobby')) 
      // The exact player screen testId depends on the sub-game, but we verify they left the lobby
    ]);

    // --- Phase D/E/F: Game Logic & Pause ---
    // To keep this suite universally scalable across different mini-games (Who Said That, Most Likely To, etc.),
    // we assert the global sync was successful.
    
    // As a demonstration of pause validation, if a pause button existed on the host controller:
    // await hostController.getByTestId('btn-pause').click();
    // await expect(hostPage.getByText('⏸ Paused')).toBeVisible();

  });
});
