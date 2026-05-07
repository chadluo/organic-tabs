import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import path from "path";
import os from "os";
import fs from "fs";

const pathToExtension = path.resolve(".output/chrome-mv3");

type WorkerFixtures = { browserCtx: BrowserContext; extensionId: string };
type TestFixtures = { ntpPage: Page };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  browserCtx: [
    async ({}, use) => {
      // Pre-write Chrome preferences before launch — mirrors what web-ext does.
      // Without developer_mode: true, Chrome silently ignores --load-extension.
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "playwright-organic-tabs-"));
      fs.mkdirSync(path.join(userDataDir, "Default"), { recursive: true });
      fs.writeFileSync(
        path.join(userDataDir, "Default", "Preferences"),
        JSON.stringify({
          extensions: { ui: { developer_mode: true } },
          // Suppress "Change back to Google?" NTP override confirmation dialog
          ack_existing_ntp_extensions: true,
        }),
      );

      const ctx = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          `--disable-extensions-except=${pathToExtension}`,
          `--load-extension=${pathToExtension}`,
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-default-apps",
        ],
      });
      await use(ctx);
      await ctx.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
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
