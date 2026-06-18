import { test, expect } from '@playwright/test';

test('Draw Telephone - selfie to drawing phase integration', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  await hostPage.goto('http://localhost:5173/host');

  // Host Creates Room
  await hostPage.locator('button:has-text("Create New Room")').click();
  // Select "Drawing in Chain" (which is Draw Telephone)
  const dtBtn = hostPage.locator('button', { hasText: /Drawing in Chain/i }).first();
  await expect(dtBtn).toBeVisible({ timeout: 5000 });
  await dtBtn.click();

  await hostPage.locator('button:has-text("Create & Display")').click();

  const codeLocator = hostPage.locator('p.text-5xl');
  await codeLocator.waitFor({ state: 'visible', timeout: 10000 });
  const roomCode = (await codeLocator.innerText()).replace(/\s+/g, '');
  expect(roomCode.length).toBe(4);

  // Players join
  const players = [];
  for (let i = 1; i <= 3; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`http://localhost:5173/?join=${roomCode}`);
    await page.locator('input[placeholder*="Name"], input[type="text"]').first().fill(`Player${i}`);
    await page.locator('button:has-text("Join")').click();
    players.push(page);
  }

  // Host starts game
  await hostPage.locator('button:has-text("Start Game")').click();

  // Test proceeds through DT flow: Selfie -> Prompt -> Draw
  // Auto-play script inside the test
  let loops = 0;
  let reachedDrawPhase = false;
  
  while (loops < 40 && !reachedDrawPhase) {
    loops++;
    await hostPage.waitForTimeout(1000);

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      
      // If we are on Draw page
      const isDrawPage = await p.locator('canvas').count() > 0 && await p.locator('text=Draw this prompt!').isVisible().catch(() => false);
      if (isDrawPage) {
        reachedDrawPhase = true;
        // Assertions for Drawing Phase bug
        const promptTextElement = p.locator('p').filter({ hasText: /"/ }); // Prompt is usually in quotes like "funny text"
        const promptText = await promptTextElement.first().innerText().catch(() => '');
        expect(promptText.trim().length).toBeGreaterThan(0);
        expect(promptText).not.toBe('""'); // Ensure it's not literally just empty quotes
        
        // Assert canvas background image (Selfie photo)
        const bgImage = p.locator('img[alt="selfie background"]');
        await expect(bgImage).toBeVisible();
        const src = await bgImage.getAttribute('src');
        expect(src).toBeTruthy();
        expect(src).toContain('data:image');
      }

      // Handle Inputs (e.g. Prompt phase)
      const inputs = p.locator('input[type="text"], textarea');
      const count = await inputs.count();
      for (let j = 0; j < count; j++) {
        const input = inputs.nth(j);
        if (await input.isVisible() && (await input.inputValue()) === "") {
          await input.fill(`A funny prompt [Name] ${Math.random()}`);
        }
      }

      // Upload mock selfie if in selfie phase
      const fileInput = p.locator('input[type="file"]');
      if (await fileInput.count() > 0 && await p.locator('text=Take / Choose Photo').isVisible().catch(() => false)) {
        await fileInput.setInputFiles({
           name: 'dummy.png',
           mimeType: 'image/png',
           buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64')
        });
      }

      // Handle Submit buttons
      const submitBtn = p.locator('button', { hasText: /Submit|Confirm|Use This/i });
      if (await submitBtn.count() > 0 && await submitBtn.first().isVisible()) {
        await submitBtn.first().click().catch(() => {});
      }
      
      // Handle Drawing Phase
      const canvas = p.locator('canvas').last();
      if (await canvas.count() > 0 && await canvas.isVisible()) {
        await canvas.dragTo(canvas, {
          sourcePosition: { x: 50, y: 50 },
          targetPosition: { x: 100, y: 100 }
        });
        // Click Submit Drawing
        const submitDrawBtn = p.locator('button', { hasText: /Submit Drawing|Done/i });
        if (await submitDrawBtn.count() > 0 && await submitDrawBtn.isVisible()) {
          await submitDrawBtn.click();
        }
      }

      // Handle Guessing Phase
      const isGuessPage = await p.locator('text="What\'s the original prompt?"').isVisible().catch(() => false);
      if (isGuessPage) {
        const guessInput = p.locator('input[type="text"]');
        if (await guessInput.isVisible() && (await guessInput.inputValue()) === "") {
          await guessInput.fill(`My guess is ${Math.random()}`);
          await p.locator('button', { hasText: /Submit Guess/i }).click();
        }
      }

      // Handle Voting in Reveal Phase
      const voteBtns = p.locator('button', { hasText: /Correct|Close|Wrong/i });
      if (await voteBtns.count() > 0 && await voteBtns.first().isVisible()) {
        await voteBtns.first().click().catch(() => {});
      }
    }
    
    // Host handles Next during Reveal
    const hostNextBtn = hostPage.locator('button', { hasText: /Next|Advance|See Scores/i });
    if (await hostNextBtn.count() > 0 && await hostNextBtn.isVisible()) {
      await hostNextBtn.click().catch(() => {});
    }
  }

  if (!reachedDrawPhase) {
    await hostPage.screenshot({ path: 'failure-host.png' });
    for (let i = 0; i < players.length; i++) {
      await players[i].screenshot({ path: `failure-player-${i}.png` });
    }
  }

  expect(reachedDrawPhase).toBe(true);

  // Close contexts
  for (const p of players) {
    await p.context().close();
  }
  await hostContext.close();
});
