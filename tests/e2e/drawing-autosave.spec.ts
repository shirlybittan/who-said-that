import { test, expect } from './fixtures';
import { GameActions } from './helpers/gameActions';

/**
 * Phase 2: in-progress drawing must survive a refresh/reconnect. Strokes are
 * autosaved to localStorage on every change and restored when the canvas
 * remounts, so a player who refreshes mid-drawing (or whose phone reloads the
 * tab) doesn't lose their work. Runs against live dev servers (:5173 / :3001).
 */
test.describe('Drawing autosave', () => {
  test('strokes drawn before submitting survive a page refresh', async ({ hostPage, playerPages }) => {
    // --- Create a classic Pictionary Battle and get everyone in ---
    await hostPage.goto('http://localhost:5173/host');
    await hostPage.getByTestId('host-btn-create-room').click();
    await hostPage.locator('button', { hasText: 'Pictionary Battle' }).first().click();
    const classic = hostPage.locator('button', { hasText: 'Classic' });
    if (await classic.isVisible().catch(() => false)) await classic.click();
    await hostPage.locator('button', { hasText: 'Create & Display' }).click();
    const pin = (await hostPage.getByTestId('host-lobby-pin').innerText()).trim();

    await GameActions.joinGame(playerPages[0], pin, 'Player_1');
    await expect(playerPages[0].getByText('Player_1')).toBeVisible({ timeout: 5000 });
    await Promise.all(
      playerPages.slice(1).map((p, i) => GameActions.joinGame(p, pin, `Player_${i + 2}`))
    );

    await GameActions.startGame(hostPage);

    // --- Player_1 reaches the drawing canvas ---
    const player = playerPages[0];
    const canvas = player.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // The Clear button starts disabled (no strokes yet).
    const clearBtn = player.getByRole('button', { name: /Clear/ });
    await expect(clearBtn).toBeDisabled();

    // --- Draw a few strokes with the mouse ---
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await player.mouse.move(cx - 60, cy - 40);
    await player.mouse.down();
    await player.mouse.move(cx, cy, { steps: 8 });
    await player.mouse.move(cx + 60, cy + 40, { steps: 8 });
    await player.mouse.up();

    // Strokes now exist → Clear enabled, and an autosave entry was written.
    await expect(clearBtn).toBeEnabled();
    const savedBefore = await player.evaluate(() =>
      Object.keys(localStorage).filter(k => k.startsWith('wst_draw_autosave:')).length
    );
    expect(savedBefore).toBeGreaterThan(0);

    // --- Refresh mid-drawing (before any submit) ---
    await player.reload();

    // Back on the drawing screen with the strokes restored (Clear enabled again).
    await expect(player.locator('canvas').first()).toBeVisible({ timeout: 15000 });
    await expect(player).not.toHaveURL(/.*lobby/);
    await expect(player.getByRole('button', { name: /Clear/ })).toBeEnabled({ timeout: 10000 });
  });
});
