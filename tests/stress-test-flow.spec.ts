import { test, expect } from '@playwright/test';

// Extremely long timeout for a 10-player playlist run
test.setTimeout(1800000); // 30 minutes

test('Massive 10-Player Playlist Stress Test', async ({ browser }) => {
  const TOTAL_PLAYERS = 15;
  
  // 1. Host Context
  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  await hostPage.goto('http://localhost:5173/host');

  // Host Creates Room
  await hostPage.locator('button:has-text("Create New Room")').click();
  
  // Select "Playlist"
  await hostPage.locator('button', { hasText: /Playlist/i }).click();

  // The playlist UI might require adding games
  // Let's assume there's an 'Add to Queue' or we can select multiple
  // Actually, wait, the easiest way to test EVERYTHING is to inject the config
  // Let's intercept the request to force a massive playlist if the UI is hard to click
  
  // But let's try standard UI first
  // The host clicks "Create & Display"
  await hostPage.locator('button:has-text("Create & Display")').click();

  const codeLocator = hostPage.locator('p.text-5xl');
  await codeLocator.waitFor({ state: 'visible', timeout: 10000 });
  const roomCode = (await codeLocator.innerText()).replace(/\s+/g, '');
  expect(roomCode.length).toBe(4);
  console.log(`[Host] Created room: ${roomCode}`);

  // 2. Players Join
  const players = [];
  for (let i = 1; i <= TOTAL_PLAYERS - 1; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`http://localhost:5173/?join=${roomCode}`);
    await page.locator('input[placeholder*="Name"], input[type="text"]').first().fill(`Player_${i}`);
    await page.locator('button:has-text("Join")').click();
    players.push(page);
    console.log(`[Player_${i}] Joined room.`);
  }

  // 3. Host starts game
  await hostPage.locator('button:has-text("Start Game")').click();
  console.log(`[Host] Started Game`);

  // 4. Universal Auto-Player Loop
  let loops = 0;
  let isGameOver = false;

  // We loop until game over screen
  while (loops < 1000 && !isGameOver) {
    loops++;
    await hostPage.waitForTimeout(1000); // Wait 1s between ticks
    
    // Check if host sees "End Game" or "Game Over"
    const gameOverLocator = hostPage.locator('text=Game Over');
    if (await gameOverLocator.isVisible().catch(() => false)) {
      isGameOver = true;
      break;
    }

    // Host Progress buttons
    const nextBtns = hostPage.locator('button:has-text("Next"), button:has-text("Show Results"), button:has-text("Start Game"), button:has-text("Play Next Game")');
    if (await nextBtns.count() > 0 && await nextBtns.first().isVisible()) {
      await nextBtns.first().click().catch(() => {});
      console.log(`[Host] Clicked Next/Advance`);
    }

    // Prepare arrays to hold submit promises for the race condition test
    const submitPromises = [];

    // Loop through all players (including host if host plays? Host is not playing in this setup if they didn't join as a player)
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      
      try {
        // Upload mock selfie if in selfie phase
        const fileInput = p.locator('input[type="file"]');
        if (await fileInput.count() > 0 && await p.locator('text=Take / Choose Photo').isVisible().catch(() => false)) {
          await fileInput.setInputFiles({
             name: 'dummy.png',
             mimeType: 'image/png',
             buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64')
          });
          console.log(`[Player_${i+1}] Uploaded selfie`);
        }

        // Text inputs
        const inputs = p.locator('input[type="text"], textarea');
        const count = await inputs.count();
        for (let j = 0; j < count; j++) {
          const input = inputs.nth(j);
          if (await input.isVisible() && (await input.inputValue()) === "") {
            await input.fill(`A funny prompt [Name] stress test ${Math.random()}`);
            console.log(`[Player_${i+1}] Filled text input`);
          }
        }

        // Target Selection (voting / guessing)
        // Usually these are buttons with player names or avatars
        // Let's just find buttons that are NOT Submit/Confirm/Edit
        const voteBtns = p.locator('button').filter({ hasNotText: /Submit|Confirm|Edit|Take|Use|Wait/i });
        if (await voteBtns.count() > 0 && await voteBtns.first().isVisible()) {
           // Click a random vote button (careful not to click UI navigation)
           // We'll look for buttons inside a specific grid or with an avatar
           const avatarBtns = p.locator('button:has(img)');
           if (await avatarBtns.count() > 0) {
             await avatarBtns.nth(Math.floor(Math.random() * (await avatarBtns.count()))).click().catch(() => {});
           }
        }

        // Canvas Drawing
        const canvas = p.locator('canvas');
        if (await canvas.count() > 0 && await canvas.isVisible()) {
           // Simulate a drag to draw
           const box = await canvas.boundingBox();
           if (box) {
             await p.mouse.move(box.x + 10, box.y + 10);
             await p.mouse.down();
             await p.mouse.move(box.x + 50, box.y + 50);
             await p.mouse.up();
           }
        }

        // Submit/Confirm buttons -> Add to race condition batch
        const submitBtn = p.locator('button', { hasText: /Submit|Confirm|Use This/i });
        if (await submitBtn.count() > 0 && await submitBtn.first().isVisible() && !(await submitBtn.first().isDisabled())) {
          submitPromises.push(submitBtn.first().click().catch(() => {}));
          console.log(`[Player_${i+1}] Ready to submit`);
        }
      } catch (err) {
        // Ignore stale elements during rapid transitions
      }
    }

    // Execute race condition simulation
    if (submitPromises.length > 0) {
      console.log(`[SIMULATION] Firing ${submitPromises.length} simultaneous submissions...`);
      await Promise.all(submitPromises);
    }
  }

  expect(isGameOver).toBe(true);

  // Close contexts
  for (const p of players) {
    await p.context().close();
  }
  await hostContext.close();
});
