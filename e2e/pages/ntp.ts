import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Page Object for the New Tab Page. Provides typed locators for sections,
 * drop targets, draggable items, and the two drag test helpers.
 */
export class NtpPage {
  constructor(private readonly page: Page) {}

  // ── Sections ──────────────────────────────────────────────────────────────

  bookmarksSection(): Locator {
    return this.page.locator("#bookmarks-section");
  }

  readingListSection(): Locator {
    return this.page.locator("#reading-list-section");
  }

  tabsSection(): Locator {
    return this.page.locator("#tabs-section");
  }

  // ── Drop targets ──────────────────────────────────────────────────────────

  bookmarkFolder(folderId: string): Locator {
    return this.page.locator(
      `[data-testid="bookmark-folder"][data-folder-id="${folderId}"]`,
    );
  }

  readingListUnread(): Locator {
    return this.page.locator('[data-testid="reading-list-unread"]');
  }

  readingListRead(): Locator {
    return this.page.locator('[data-testid="reading-list-read"]');
  }

  tabWindow(windowId?: number): Locator {
    if (windowId !== undefined) {
      return this.page.locator(
        `[data-testid="tab-window"][data-window-id="${windowId}"]`,
      );
    }
    return this.page.locator('[data-testid="tab-window"]').first();
  }

  // ── Draggable items ───────────────────────────────────────────────────────

  bookmarkItem(url: string): Locator {
    return this.page.locator(`[data-testid="bookmark-item"][data-url="${url}"]`);
  }

  tabItem(url: string): Locator {
    return this.page.locator(`[data-testid="tab-item"][data-url="${url}"]`);
  }

  readingListItem(url: string): Locator {
    return this.page.locator(
      `[data-testid="reading-list-item"][data-url="${url}"]`,
    );
  }

  // ── Link content assertions ───────────────────────────────────────────────

  bookmarkLink(url: string): Locator {
    return this.page.locator(`bookmark-link[url="${url}"]`);
  }

  readingListLink(url: string): Locator {
    return this.page.locator(`reading-list-link[url="${url}"]`);
  }

  tabLink(url: string): Locator {
    return this.page.locator(`tab-link[url="${url}"]`);
  }

  // ── Drag helpers ──────────────────────────────────────────────────────────

  /**
   * Dispatches a synthetic dragenter carrying the given MIME type to the
   * target element and asserts the drag-over highlight class is applied.
   * Cleans up with dragleave afterwards.
   */
  async assertDropTargetHighlights(
    target: Locator,
    mime: string = "application/x-tab",
  ): Promise<void> {
    await target.evaluate((el, mimeType) => {
      const dt = new DataTransfer();
      dt.items.add("test", mimeType);
      el.dispatchEvent(
        new DragEvent("dragenter", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
    }, mime);
    await expect(target).toHaveClass(/drag-over/);
    await target.evaluate((el) => {
      el.dispatchEvent(new DragEvent("dragleave", { bubbles: true }));
    });
  }

  /**
   * Drags source to target using Playwright's dragAndDrop.
   * If the implementation's HTML5 drag handlers don't fire reliably,
   * upgrade to manual DataTransfer event dispatch here.
   */
  async dragTo(source: Locator, target: Locator): Promise<void> {
    await source.dragTo(target);
  }
}
