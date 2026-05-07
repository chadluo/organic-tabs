import { test, expect } from "./fixtures";
import { NtpPage } from "./pages/ntp";

// Unique URL prefix per test run to avoid cross-test contamination
const run = Date.now();
const url = (suffix: string) => `https://example.com/e2e-drag-${run}-${suffix}`;

test("drop target highlights on dragenter", async ({ ntpPage }) => {
  const ntp = new NtpPage(ntpPage);
  await ntp.assertDropTargetHighlights(ntp.readingListUnread(), "application/x-bookmark");
});

test("bookmark → reading list (unread): entry created, NTP updated", async ({
  ntpPage,
  context,
  extensionId,
}) => {
  const bookmarkUrl = url("bm-to-rl");
  const bookmarkTitle = "E2E Drag Test Bookmark";
  const ntp = new NtpPage(ntpPage);

  // Seed a bookmark and a folder to hold it
  const { folderId, bookmarkId } = await ntpPage.evaluate(
    async ({ url, title }) => {
      const folder = await chrome.bookmarks.create({ title: "__e2e_drag_folder__" });
      const bm = await chrome.bookmarks.create({ parentId: folder.id, url, title: title ?? url });
      return { folderId: folder.id, bookmarkId: bm.id };
    },
    { url: bookmarkUrl, title: bookmarkTitle },
  );

  // Wait for the NTP to reactively render the bookmark item
  await ntpPage.waitForSelector(`[data-testid="bookmark-item"][data-url="${bookmarkUrl}"]`);
  await ntp.bookmarkFolder(folderId).locator("summary").click();

  // Open the unread reading list group (drop target must be open or visible)
  await ntp.readingListUnread().locator("summary").click();

  // Drag bookmark → reading list unread
  await ntp.dragTo(ntp.bookmarkItem(bookmarkUrl), ntp.readingListUnread());

  // 1. Assert Chrome API state: entry exists with correct params
  const entries = await ntpPage.evaluate(async (u) => {
    const api = (globalThis as any).chrome?.readingList;
    return api ? api.query({ url: u }) : [];
  }, bookmarkUrl);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ url: bookmarkUrl, title: bookmarkTitle, hasBeenRead: false });

  // 2. Assert NTP DOM: reading list link appears in unread group
  await expect(
    ntp.readingListUnread().locator(`reading-list-link[url="${bookmarkUrl}"]`),
  ).toBeVisible();

  // Cleanup
  await ntpPage.evaluate(
    async ({ folderId, bookmarkUrl }) => {
      await chrome.bookmarks.removeTree(folderId);
      const api = (globalThis as any).chrome?.readingList;
      if (api) await api.removeEntry({ url: bookmarkUrl });
    },
    { folderId, bookmarkUrl },
  );
});

test("bookmark → bookmark folder (intra-section move)", async ({ ntpPage }) => {
  const bookmarkUrl = url("bm-move");
  const ntp = new NtpPage(ntpPage);

  // Seed: folder A with a bookmark, folder B as the target
  const { folderAId, folderBId, bookmarkId } = await ntpPage.evaluate(
    async (u) => {
      const a = await chrome.bookmarks.create({ title: "__e2e_drag_folderA__" });
      const b = await chrome.bookmarks.create({ title: "__e2e_drag_folderB__" });
      const bm = await chrome.bookmarks.create({
        parentId: a.id,
        url: u,
        title: "Move Me",
      });
      return { folderAId: a.id, folderBId: b.id, bookmarkId: bm.id };
    },
    bookmarkUrl,
  );

  await ntpPage.waitForSelector(`[data-testid="bookmark-item"][data-url="${bookmarkUrl}"]`);
  await ntp.bookmarkFolder(folderAId).locator("summary").click();

  // Drag bookmark from folder A to folder B
  await ntp.dragTo(ntp.bookmarkItem(bookmarkUrl), ntp.bookmarkFolder(folderBId));

  // 1. Assert Chrome API: bookmark is now in folder B, not folder A
  const childrenA = await ntpPage.evaluate(
    (id) => chrome.bookmarks.getChildren(id),
    folderAId,
  );
  const childrenB = await ntpPage.evaluate(
    (id) => chrome.bookmarks.getChildren(id),
    folderBId,
  );
  expect(childrenA.find((c: chrome.bookmarks.BookmarkTreeNode) => c.url === bookmarkUrl)).toBeUndefined();
  expect(childrenB.find((c: chrome.bookmarks.BookmarkTreeNode) => c.url === bookmarkUrl)).toBeDefined();

  // 2. Assert NTP DOM: link no longer in folder A, now in folder B
  await ntp.bookmarkFolder(folderBId).locator("summary").click();
  await expect(
    ntp.bookmarkFolder(folderBId).locator(`bookmark-link[url="${bookmarkUrl}"]`),
  ).toBeVisible();
  await expect(
    ntp.bookmarkFolder(folderAId).locator(`bookmark-link[url="${bookmarkUrl}"]`),
  ).not.toBeAttached();

  // Cleanup
  await ntpPage.evaluate(
    async ({ a, b }) => {
      await chrome.bookmarks.removeTree(a);
      await chrome.bookmarks.removeTree(b);
    },
    { a: folderAId, b: folderBId },
  );
});

test("drag to read group: accept confirm → entry added as read", async ({
  ntpPage,
}) => {
  const bookmarkUrl = url("bm-read-accept");
  const bookmarkTitle = "E2E Read Accept";
  const ntp = new NtpPage(ntpPage);

  const { folderId } = await ntpPage.evaluate(
    async ({ url, title }) => {
      const folder = await chrome.bookmarks.create({ title: "__e2e_drag_read__" });
      await chrome.bookmarks.create({ parentId: folder.id, url, title });
      return { folderId: folder.id };
    },
    { url: bookmarkUrl, title: bookmarkTitle },
  );

  await ntpPage.waitForSelector(`[data-testid="bookmark-item"][data-url="${bookmarkUrl}"]`);
  await ntp.bookmarkFolder(folderId).locator("summary").click();
  await ntp.readingListRead().locator("summary").click();

  ntpPage.once("dialog", (dialog) => dialog.accept());
  await ntp.dragTo(ntp.bookmarkItem(bookmarkUrl), ntp.readingListRead());

  const entries = await ntpPage.evaluate(async (u) => {
    const api = (globalThis as any).chrome?.readingList;
    return api ? api.query({ url: u }) : [];
  }, bookmarkUrl);
  expect(entries).toHaveLength(1);
  expect(entries[0].hasBeenRead).toBe(true);

  await expect(
    ntp.readingListRead().locator(`reading-list-link[url="${bookmarkUrl}"]`),
  ).toBeVisible();

  // Cleanup
  await ntpPage.evaluate(
    async ({ folderId, bookmarkUrl }) => {
      await chrome.bookmarks.removeTree(folderId);
      const api = (globalThis as any).chrome?.readingList;
      if (api) await api.removeEntry({ url: bookmarkUrl });
    },
    { folderId, bookmarkUrl },
  );
});

test("drag to read group: dismiss confirm → no entry added", async ({
  ntpPage,
}) => {
  const bookmarkUrl = url("bm-read-dismiss");
  const bookmarkTitle = "E2E Read Dismiss";
  const ntp = new NtpPage(ntpPage);

  const { folderId } = await ntpPage.evaluate(
    async ({ url, title }) => {
      const folder = await chrome.bookmarks.create({ title: "__e2e_drag_dismiss__" });
      await chrome.bookmarks.create({ parentId: folder.id, url, title });
      return { folderId: folder.id };
    },
    { url: bookmarkUrl, title: bookmarkTitle },
  );

  await ntpPage.waitForSelector(`[data-testid="bookmark-item"][data-url="${bookmarkUrl}"]`);
  await ntp.bookmarkFolder(folderId).locator("summary").click();
  await ntp.readingListRead().locator("summary").click();

  ntpPage.once("dialog", (dialog) => dialog.dismiss());
  await ntp.dragTo(ntp.bookmarkItem(bookmarkUrl), ntp.readingListRead());

  const entries = await ntpPage.evaluate(async (u) => {
    const api = (globalThis as any).chrome?.readingList;
    return api ? api.query({ url: u }) : [];
  }, bookmarkUrl);
  expect(entries).toHaveLength(0);

  await expect(
    ntp.readingListRead().locator(`reading-list-link[url="${bookmarkUrl}"]`),
  ).not.toBeAttached();

  // Cleanup
  await ntpPage.evaluate(async (folderId) => {
    await chrome.bookmarks.removeTree(folderId);
  }, folderId);
});
