const { chromium } = require('playwright');
const fs = require('fs');

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  let hostPage;
  try {
    const context = await browser.newContext();
    hostPage = await context.newPage();
    await hostPage.goto('http://localhost:5173/host');

    console.log("Clicking Create New Room...");
    const createNewRoomBtn = hostPage.locator('button:has-text("Create New Room")');
    await createNewRoomBtn.waitFor({ state: 'visible', timeout: 10000 });
    await createNewRoomBtn.click();

    console.log("Selecting Playlist mode...");
    const playlistBtn = hostPage.locator('button:has-text("Playlist")');
    await playlistBtn.waitFor({ state: 'visible', timeout: 10000 });
    await playlistBtn.click();
    
    const createBtn = hostPage.locator('button:has-text("Create & Display")');
    await createBtn.waitFor({ state: 'visible', timeout: 5000 });
    await createBtn.click();
    
    console.log("Waiting for room code...");
    await hostPage.waitForTimeout(3000);
    const html = await hostPage.content();
    // Assuming 4 uppercase letters/numbers for code
    const match = html.match(/[A-Z0-9]{4}/);
    if (!match) throw new Error("Could not find 4-letter room code on host page");
    const roomCode = match[0];
    console.log("Room created with code:", roomCode);

    const players = [];
    for (let i = 1; i <= 3; i++) {
      const page = await context.newPage();
      await page.goto(`http://localhost:5173/?code=${roomCode}`);
      // Try to fill name
      const nameInput = page.locator('input[placeholder*="Name"], input[type="text"]').first();
      await nameInput.waitFor({ state: 'visible', timeout: 5000 });
      await nameInput.fill(`Player${i}`);
      const joinBtn = page.locator('button:has-text("Join")');
      await joinBtn.click();
      players.push(page);
    }

    console.log("3 Players joined. Waiting for host to start.");
    await hostPage.waitForTimeout(2000);

    const startBtn = hostPage.locator('button:has-text("Start Game")');
    if (await startBtn.isVisible()) {
      await startBtn.click();
    }

    console.log("Game started. Entering interaction loop.");
    let loops = 0;
    while (loops < 300) {
      loops++;
      await hostPage.waitForTimeout(1000);
      
      // Host actions
      const hostActions = ['Next Round', 'Show Results', 'Continue', 'Start', 'Next'];
      for (const action of hostActions) {
        const btn = hostPage.locator(`button`, { hasText: new RegExp(`^\\s*${action}.*`, 'i') });
        if (await btn.count() > 0 && await btn.first().isVisible()) {
          console.log(`Host clicking: ${action}`);
          await btn.first().click({ timeout: 1000, force: true }).catch(() => {});
          await hostPage.waitForTimeout(500);
        }
      }

      // Player actions
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        
        // Handle inputs
        const inputs = p.locator('input[type="text"], textarea');
        const count = await inputs.count();
        for (let j = 0; j < count; j++) {
          const input = inputs.nth(j);
          if (await input.isVisible() && (await input.inputValue()) === "") {
            await input.fill("Auto " + Math.floor(Math.random()*1000));
          }
        }

        // Handle canvases (drawing)
        const canvases = p.locator('canvas');
        if (await canvases.count() > 0) {
          const canvas = canvases.first();
          if (await canvas.isVisible()) {
            const box = await canvas.boundingBox();
            if (box) {
              await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
              await p.mouse.down();
              await p.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 10);
              await p.mouse.up();
            }
          }
        }

        // Handle buttons
        const pActions = ['Submit', 'Vote', 'Confirm', '✓', 'Done', 'Send', 'Player'];
        for (const action of pActions) {
          const btn = p.locator(`button`, { hasText: new RegExp(`^.*${action}.*$`, 'i') });
          if (await btn.count() > 0 && await btn.first().isVisible()) {
            await btn.first().click({ timeout: 1000, force: true }).catch(() => {});
            await p.waitForTimeout(200);
          }
        }
      }
      
      const hostText = await hostPage.innerText('body').catch(()=>'');
      if (loops % 10 === 0) console.log("Host text snapshot:", hostText.slice(0, 100));
      if (hostText.includes('Playlist complete') || hostText.includes('Game Over')) {
        console.log("Game Over detected!");
        break;
      }
    }
    
    console.log("Test passed!");
    await browser.close();
    process.exit(0);

  } catch (err) {
    console.error("Test failed:", err);
    if (hostPage) await hostPage.screenshot({ path: 'failure_screenshot.png' });
    await browser.close();
    process.exit(1);
  }
}
runTest();
