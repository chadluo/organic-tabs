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
}) => {
  const bookmarkUrl = url("bm-to-rl");
  const bookmarkTitle = "E2E Drag Test Bookmark";
  const ntp = new NtpPage(ntpPage);

  // Seed a bookmark and a folder to hold it
  const { folderId, bookmarkId, parentFolderId } = await ntpPage.evaluate(
    async ({ url, title }) => {
      const folder = await chrome.bookmarks.create({ title: "__e2e_drag_folder__" });
      const bm = await chrome.bookmarks.create({ parentId: folder.id, url, title: title ?? url });
      return { folderId: folder.id, bookmarkId: bm.id, parentFolderId: folder.parentId! };
    },
    { url: bookmarkUrl, title: bookmarkTitle },
  );

  // Wait for the NTP to reactively render the bookmark (hidden inside closed folders)
  await ntpPage.waitForSelector(`[data-testid="bookmark-item"][data-url="${bookmarkUrl}"]`, {
    state: "attached",
  });
  // Open parent folder then the test folder to expose the bookmark item
  await ntp.openBookmarkFolder(parentFolderId);
  await ntp.openBookmarkFolder(folderId);

  // Unread group starts open by default (fallback=true) — no need to open it

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

  // Seed: folder A with a bookmark, folder B as the target.
  // FolderB needs at least one bookmark to appear in the NTP (empty folders
  // are skipped by renderBookmarkNode).
  const { folderAId, folderBId, bookmarkId, parentFolderId } = await ntpPage.evaluate(
    async (u) => {
      const a = await chrome.bookmarks.create({ title: "__e2e_drag_folderA__" });
      const b = await chrome.bookmarks.create({ title: "__e2e_drag_folderB__" });
      const bm = await chrome.bookmarks.create({ parentId: a.id, url: u, title: "Move Me" });
      await chrome.bookmarks.create({
        parentId: b.id,
        url: "https://example.com/e2e-placeholder",
        title: "Placeholder",
      });
      return { folderAId: a.id, folderBId: b.id, bookmarkId: bm.id, parentFolderId: a.parentId! };
    },
    bookmarkUrl,
  );

  await ntpPage.waitForSelector(`[data-testid="bookmark-item"][data-url="${bookmarkUrl}"]`, {
    state: "attached",
  });
  // Open parent folder then folder A to expose the bookmark item
  await ntp.openBookmarkFolder(parentFolderId);
  await ntp.openBookmarkFolder(folderAId);

  // Wait for both the drag source and target to be visible before dragging.
  // Multiple onCreated events can cause concurrent loadBookmarks() re-renders;
  // waiting for visibility confirms the DOM has settled.
  await expect(ntp.bookmarkItem(bookmarkUrl)).toBeVisible();
  await expect(ntp.bookmarkFolder(folderBId)).toBeVisible();

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
  await ntp.openBookmarkFolder(folderBId);
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

  const { folderId, parentFolderId } = await ntpPage.evaluate(
    async ({ url, title }) => {
      const folder = await chrome.bookmarks.create({ title: "__e2e_drag_read__" });
      await chrome.bookmarks.create({ parentId: folder.id, url, title });
      return { folderId: folder.id, parentFolderId: folder.parentId! };
    },
    { url: bookmarkUrl, title: bookmarkTitle },
  );

  await ntpPage.waitForSelector(`[data-testid="bookmark-item"][data-url="${bookmarkUrl}"]`, {
    state: "attached",
  });
  await ntp.openBookmarkFolder(parentFolderId);
  await ntp.openBookmarkFolder(folderId);
  await ntp.readingListRead().locator("summary").click();

  await ntp.dragTo(ntp.bookmarkItem(bookmarkUrl), ntp.readingListRead());
  await ntpPage.getByRole("dialog").getByRole("button", { name: "OK" }).click();
  await expect(
    ntp.readingListRead().locator(`reading-list-link[url="${bookmarkUrl}"]`),
  ).toBeVisible();

  const entries = await ntpPage.evaluate(async (u) => {
    const api = (globalThis as any).chrome?.readingList;
    return api ? api.query({ url: u }) : [];
  }, bookmarkUrl);
  expect(entries).toHaveLength(1);
  expect(entries[0].hasBeenRead).toBe(true);

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

  const { folderId, parentFolderId } = await ntpPage.evaluate(
    async ({ url, title }) => {
      const folder = await chrome.bookmarks.create({ title: "__e2e_drag_dismiss__" });
      await chrome.bookmarks.create({ parentId: folder.id, url, title });
      return { folderId: folder.id, parentFolderId: folder.parentId! };
    },
    { url: bookmarkUrl, title: bookmarkTitle },
  );

  await ntpPage.waitForSelector(`[data-testid="bookmark-item"][data-url="${bookmarkUrl}"]`, {
    state: "attached",
  });
  await ntp.openBookmarkFolder(parentFolderId);
  await ntp.openBookmarkFolder(folderId);
  await ntp.readingListRead().locator("summary").click();

  await ntp.dragTo(ntp.bookmarkItem(bookmarkUrl), ntp.readingListRead());
  const dialog = ntpPage.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

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
