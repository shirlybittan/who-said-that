import { Page, expect } from '@playwright/test';

export class GameActions {
  static async createGame(hostPage: Page) {
    await hostPage.goto('http://localhost:5173/host');
    
    // Wait for room code to be generated and visible
    const pinLocator = hostPage.getByTestId('host-lobby-pin');
    await expect(pinLocator).toBeVisible({ timeout: 10000 });
    
    const pin = await pinLocator.innerText();
    return pin.trim();
  }

  static async joinGame(playerPage: Page, pin: string, nickname: string) {
    await playerPage.goto('http://localhost:5173/');
    
    await playerPage.getByTestId('player-input-name').fill(nickname);
    await playerPage.getByTestId('player-input-pin').fill(pin);
    await playerPage.getByTestId('player-btn-join').click();

    // Verify player is in the lobby
    await expect(playerPage.getByTestId('host-btn-start').or(playerPage.getByTestId('player-waiting-screen'))).toBeVisible({ timeout: 10000 });
  }

  static async startGame(playerHostController: Page) {
    const startBtn = playerHostController.getByTestId('host-btn-start');
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
  }

  // Answer flow will depend on the exact game type chosen.
  // Assuming a generic text-input prompt or similar for "Who Said That?" or "Most Likely To"
}
