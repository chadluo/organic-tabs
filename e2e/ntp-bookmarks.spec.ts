import { test, expect } from "./fixtures";
import { NtpPage } from "./pages/ntp";

const FOLDER_TITLE = "__e2e_bookmarks__";
const TEST_URLS = [
  "https://example.com/e2e-one",
  "https://example.com/e2e-two",
  "https://example.com/e2e-three",
];

let testFolderId: string;

test.beforeAll(async ({ browserCtx, extensionId }) => {
  const page = await browserCtx.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab.html`);

  testFolderId = await page.evaluate(async (title) => {
    const folder = await chrome.bookmarks.create({ title });
    return folder.id;
  }, FOLDER_TITLE);

  for (const url of TEST_URLS) {
    await page.evaluate(
      async ({ parentId, url, title }) => {
        await chrome.bookmarks.create({ parentId, url, title });
      },
      { parentId: testFolderId, url, title: url },
    );
  }

  await page.close();
});

test.afterAll(async ({ browserCtx, extensionId }) => {
  const page = await browserCtx.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab.html`);
  await page.evaluate(async (id) => {
    await chrome.bookmarks.removeTree(id);
  }, testFolderId);
  await page.close();
});

test("bookmark folder appears in bookmarks section", async ({ ntpPage }) => {
  const ntp = new NtpPage(ntpPage);
  const folder = ntp.bookmarkFolder(testFolderId);
  await expect(folder).toBeVisible();
  await expect(ntp.bookmarksSection()).toContainText(FOLDER_TITLE);
});

test("bookmark links appear inside their folder", async ({ ntpPage }) => {
  const ntp = new NtpPage(ntpPage);
  const folder = ntp.bookmarkFolder(testFolderId);

  await folder.locator("summary").click();

  for (const url of TEST_URLS) {
    await expect(folder.locator(`bookmark-link[url="${url}"]`)).toBeVisible();
  }
});

test("bookmark links are in bookmarks section, not reading list or tabs", async ({
  ntpPage,
}) => {
  const ntp = new NtpPage(ntpPage);
  await ntp.bookmarkFolder(testFolderId).locator("summary").click();

  for (const url of TEST_URLS) {
    await expect(ntp.bookmarksSection().locator(`bookmark-link[url="${url}"]`)).toBeVisible();
    await expect(ntp.readingListSection().locator(`reading-list-link[url="${url}"]`)).not.toBeAttached();
    await expect(ntp.tabsSection().locator(`tab-link[url="${url}"]`)).not.toBeAttached();
  }
});
