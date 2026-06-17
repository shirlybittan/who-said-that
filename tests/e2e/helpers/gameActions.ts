import { Page, expect } from '@playwright/test';

export class GameActions {
  static async createGame(hostPage: Page) {
    await hostPage.goto('http://localhost:5173/host');
    const setupCreateBtn = hostPage.getByTestId('host-btn-create-room');
    await expect(setupCreateBtn).toBeVisible({ timeout: 5000 });
    await setupCreateBtn.click();
    
    // Select the specific game type
    const gameTypeBtn = hostPage.locator('button', { hasText: 'Who Said That?' });
    await expect(gameTypeBtn).toBeVisible({ timeout: 5000 });
    await gameTypeBtn.click();
    
    // Click final create room
    const finalCreateBtn = hostPage.locator('button', { hasText: 'Create & Display' });
    await expect(finalCreateBtn).toBeVisible();
    await finalCreateBtn.click();
    
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

  static async startGame(playerPage: Page) {
    const startBtn = playerPage.getByTestId('lobby-start-btn');
    await expect(startBtn).toBeVisible({ timeout: 5000 });
    await startBtn.click();
  }

  static async submitAnswer(playerPage: Page, answer: string) {
    const input = playerPage.getByTestId('player-answer-input');
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill(answer);
    
    const submit = playerPage.getByTestId('player-answer-submit');
    await submit.click();
  }

  // Answer flow will depend on the exact game type chosen.
  // Assuming a generic text-input prompt or similar for "Who Said That?" or "Most Likely To"
}
