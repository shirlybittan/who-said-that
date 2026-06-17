import { test as base, Page, BrowserContext } from '@playwright/test';

// Scalable setup: change this constant to test with 5, 10, etc.
const PLAYER_COUNT = 3;

export type MultiplayerFixtures = {
  hostPage: Page;
  playerPages: Page[];
  hostContext: BrowserContext;
  playerContexts: BrowserContext[];
};

export const test = base.extend<MultiplayerFixtures>({
  // The Host context & page
  hostContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },
  hostPage: async ({ hostContext }, use) => {
    const page = await hostContext.newPage();
    await use(page);
  },

  // The Player contexts & pages (N players)
  playerContexts: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    for (let i = 0; i < PLAYER_COUNT; i++) {
      contexts.push(await browser.newContext());
    }
    await use(contexts);
    for (const ctx of contexts) {
      await ctx.close();
    }
  },
  playerPages: async ({ playerContexts }, use) => {
    const pages: Page[] = [];
    for (const ctx of playerContexts) {
      pages.push(await ctx.newPage());
    }
    await use(pages);
  },
});

export { expect } from '@playwright/test';
