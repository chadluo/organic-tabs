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
      const extensionId = background.url().split("/")[2];

      // Chrome installs the extension asynchronously after launch. Navigate to
      // the NTP once so the service worker fully activates before tests run.
      const warmup = await browserCtx.newPage();
      await warmup.goto(`chrome-extension://${extensionId}/newtab.html`);
      await warmup.waitForLoadState("domcontentloaded");
      await warmup.close();

      await use(extensionId);
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
