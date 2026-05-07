import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import path from "path";

const pathToExtension = path.resolve(".output/chrome-mv3");

type WorkerFixtures = { browserCtx: BrowserContext; extensionId: string };
type TestFixtures = { ntpPage: Page };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  browserCtx: [
    async ({}, use) => {
      const ctx = await chromium.launchPersistentContext("", {
        channel: "chrome",
        headless: false,
        args: [
          `--disable-extensions-except=${pathToExtension}`,
          `--load-extension=${pathToExtension}`,
        ],
      });
      await use(ctx);
      await ctx.close();
    },
    { scope: "worker" },
  ],

  extensionId: [
    async ({ browserCtx }, use) => {
      let [background] = browserCtx.serviceWorkers();
      if (!background)
        background = await browserCtx.waitForEvent("serviceworker");
      await use(background.url().split("/")[2]);
    },
    { scope: "worker" },
  ],

  ntpPage: async ({ browserCtx, extensionId }, use) => {
    const page = await browserCtx.newPage();
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    // Wait until loadTabs() has rendered at least one window — confirms init() completed
    await page.waitForSelector('[data-testid="tab-window"]');
    await use(page);
    await page.close();
  },
});

export const expect = test.expect;
