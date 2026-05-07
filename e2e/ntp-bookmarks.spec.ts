import { test, expect } from "./fixtures";
import { NtpPage } from "./pages/ntp";

const FOLDER_TITLE = "__e2e_bookmarks__";
const TEST_URLS = [
  "https://example.com/e2e-one",
  "https://example.com/e2e-two",
  "https://example.com/e2e-three",
];

let testFolderId: string;
let testParentFolderId: string;

test.beforeAll(async ({ browserCtx, extensionId }) => {
  const page = await browserCtx.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab.html`);

  const result = await page.evaluate(async (title) => {
    const folder = await chrome.bookmarks.create({ title });
    return { id: folder.id, parentId: folder.parentId! };
  }, FOLDER_TITLE);
  testFolderId = result.id;
  testParentFolderId = result.parentId;

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
  // toContainText works on section text regardless of details open/closed state
  await expect(ntp.bookmarksSection()).toContainText(FOLDER_TITLE);
  // Folder is in DOM but inside a collapsed parent folder — toBeAttached is sufficient
  await expect(ntp.bookmarkFolder(testFolderId)).toBeAttached();
});

test("bookmark links appear inside their folder", async ({ ntpPage }) => {
  const ntp = new NtpPage(ntpPage);
  // Open the containing parent folder (Other Bookmarks), then the test folder
  await ntp.openBookmarkFolder(testParentFolderId);
  await ntp.openBookmarkFolder(testFolderId);

  for (const url of TEST_URLS) {
    await expect(ntp.bookmarkFolder(testFolderId).locator(`bookmark-link[url="${url}"]`)).toBeVisible();
  }
});

test("bookmark links are in bookmarks section, not reading list or tabs", async ({
  ntpPage,
}) => {
  const ntp = new NtpPage(ntpPage);
  await ntp.openBookmarkFolder(testParentFolderId);
  await ntp.openBookmarkFolder(testFolderId);

  for (const url of TEST_URLS) {
    await expect(ntp.bookmarksSection().locator(`bookmark-link[url="${url}"]`)).toBeVisible();
    await expect(ntp.readingListSection().locator(`reading-list-link[url="${url}"]`)).not.toBeAttached();
    await expect(ntp.tabsSection().locator(`tab-link[url="${url}"]`)).not.toBeAttached();
  }
});
