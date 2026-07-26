import { test, expect } from './fixtures';
import { GameActions } from './helpers/gameActions';

// A tiny valid PNG; the app compresses it to JPEG in a real browser canvas.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const SAVED_SELFIE = 'data:image/png;base64,' + PNG.toString('base64');

/**
 * UI coverage for the shared SelfieCapture flow (Draw-on-Friends / Caption /
 * Photo-Vote all use it). The socket harness can't see rendering; these drive
 * the real capture path in a browser and guard SelfieCapture + photoUpload
 * against render regressions. Runs against live dev servers.
 */
// Note: GameActions.createGame() was tried here for consistency (review nit #4)
// but it interacts badly when two photo games run back-to-back in one suite
// (the 2nd game's photo phase gets skipped), so this game keeps its own create
// helper. Both still hardcode the dev URL like the rest of the e2e suite.
async function createPhotoGame(hostPage) {
  await hostPage.goto('http://localhost:5173/host');
  await hostPage.getByTestId('host-btn-create-room').click();
  await hostPage.locator('button', { hasText: 'Draw on Friends' }).first().click();
  const createBtn = hostPage.locator('button', { hasText: 'Create & Display' });
  await expect(createBtn).toBeVisible({ timeout: 8000 });
  await createBtn.click();
  return (await hostPage.getByTestId('host-lobby-pin').innerText()).trim();
}

async function joinAndStart(hostPage, playerPages, pin) {
  await GameActions.joinGame(playerPages[0], pin, 'P1');
  await expect(playerPages[0].getByText('P1')).toBeVisible({ timeout: 5000 });
  await Promise.all(playerPages.slice(1).map((p, i) => GameActions.joinGame(p, pin, `P${i + 2}`)));
  await GameActions.startGame(hostPage);
}

test.describe('Photo capture UI (SelfieCapture)', () => {
  test('capture via the file input → preview → submit → waiting card', async ({ hostPage, playerPages }) => {
    const pin = await createPhotoGame(hostPage);
    await joinAndStart(hostPage, playerPages, pin);

    for (const p of playerPages) {
      // Fresh context → no saved selfie → the camera dropzone (not the reuse choice).
      await expect(p.getByTestId('selfie-dropzone')).toBeVisible({ timeout: 15000 });
      await expect(p.getByTestId('selfie-reuse-choice')).toHaveCount(0);

      // Drive the hidden file input; the app compresses it and shows a preview.
      await p.setInputFiles('#selfie-capture-input', { name: 'selfie.png', mimeType: 'image/png', buffer: PNG });
      const submit = p.getByTestId('selfie-submit-btn');
      await expect(submit).toBeVisible({ timeout: 10000 });

      await submit.click();
      await expect(p.getByTestId('selfie-waiting')).toBeVisible({ timeout: 10000 });
    }
  });

  test('a returning player gets the explicit "Use your previous photo?" choice and can reuse', async ({ hostPage, playerPages, playerContexts }) => {
    // Seed P1 with a saved selfie BEFORE their app loads (store reads it at init).
    await playerContexts[0].addInitScript((data) => {
      localStorage.setItem('wst_saved_selfie', data);
    }, SAVED_SELFIE);

    const pin = await createPhotoGame(hostPage);
    await joinAndStart(hostPage, playerPages, pin);

    const p = playerPages[0];
    // With a saved selfie, SelfieCapture shows the explicit choice, not the camera.
    await expect(p.getByTestId('selfie-reuse-choice')).toBeVisible({ timeout: 15000 });
    await expect(p.getByText('Use your previous photo?')).toBeVisible();
    await expect(p.getByTestId('selfie-dropzone')).toHaveCount(0);

    // Reuse → preview → submit → waiting card.
    await p.getByTestId('selfie-reuse-btn').click();
    const submit = p.getByTestId('selfie-submit-btn');
    await expect(submit).toBeVisible({ timeout: 10000 });
    await submit.click();
    await expect(p.getByTestId('selfie-waiting')).toBeVisible({ timeout: 10000 });
  });
});
