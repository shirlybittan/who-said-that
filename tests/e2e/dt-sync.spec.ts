import { test, expect } from './fixtures';
import { GameActions } from './helpers/gameActions';

test.describe('Draw Telephone Game Flow', () => {
  test('Guessing phase synchronizes properly across all players', async ({ hostPage, playerPages }) => {
    
    // --- Phase A: Game Creation ---
    // Use Draw Telephone game type
    const pin = await GameActions.createGame(hostPage, 'Drawing in Chain');
    expect(pin).toMatch(/^[A-Z0-9]{4}$/);
    
    // --- Phase B: Player Join ---
    // Have Player 1 join first so they are guaranteed to be the Host Controller
    await GameActions.joinGame(playerPages[0], pin, 'Player_1');
    await expect(playerPages[0].getByText('Player_1')).toBeVisible({ timeout: 5000 });
    
    // Have the rest join concurrently
    const joinPromises = playerPages.slice(1).map((page, index) => 
      GameActions.joinGame(page, pin, `Player_${index + 2}`)
    );
    await Promise.all(joinPromises);

    // --- Phase C: Game Start ---
    await GameActions.startGame(hostPage);

    // --- Phase D: Selfie Phase ---
    const dummyImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    await Promise.all(playerPages.map(async page => {
      // The file input is hidden, so we set files directly on it
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'test.png',
        mimeType: 'image/png',
        buffer: dummyImageBuffer
      });
      const usePhotoBtn = page.getByRole('button', { name: /Use This!/i });
      await expect(usePhotoBtn).toBeVisible({ timeout: 5000 });
      await usePhotoBtn.click();
    }));

    // --- Phase E: Prompt Phase ---
    await Promise.all(playerPages.map(async page => {
      const input = page.getByPlaceholder('e.g. [name] riding a dinosaur to work');
      await expect(input).toBeVisible({ timeout: 15000 });
      await input.fill('[name] doing e2e testing');
      const submitBtn = page.getByRole('button', { name: /Submit/i });
      await submitBtn.click();
    }));

    // --- Phase F: Drawing Phase ---
    await Promise.all(playerPages.map(async page => {
      // Find canvas or done button
      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible({ timeout: 15000 });
      // Just click Done since we don't strictly need to draw
      const doneBtn = page.getByRole('button', { name: /Finished Drawing/i });
      await doneBtn.click();
    }));

    // --- Phase G: Guessing Phase ---
    // Ensure ALL players get to the guessing page synchronously!
    await Promise.all(playerPages.map(async page => {
      // The bug caused 1/3 players to get stuck on "Waiting for guessers..."
      // Ensure they all see the text box for "What's the original prompt?"
      const guessInput = page.getByPlaceholder('Type your guess here...');
      await expect(guessInput).toBeVisible({ timeout: 15000 });
    }));
  });
});
