import { loadSettings, type Direction } from "../utils/settings";
import {
  sortTabsByMode,
  sortByTitle,
  sortByWebsite,
  sortByLastAccessed,
} from "../utils/sort";
import { findCyclicTarget, findGeometricTarget } from "../utils/shift";
import type { BackgroundMessage, BackgroundResponse } from "../utils/messages";
import { storePreview, evictPreview } from "../utils/preview";

/** Per-window debounce: capture fires 3 s after the last activation to skip rapid tab switching. */
const captureTimers = new Map<number, ReturnType<typeof setTimeout>>();

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command === "sort-tabs") {
      const settings = await loadSettings();
      if (settings.tabSortEnabled === false) return;
      await sortTabsByMode(settings.defaultSortMode);
      return;
    }

    if (command.startsWith("move-tab-")) {
      const settings = await loadSettings();
      if (settings.tabShiftEnabled === false) return;
      const direction = command.replace("move-tab-", "") as Direction;
      if (isDirection(direction)) {
        await moveActiveTabToDirection(direction);
      }
    }
  });

  browser.runtime.onMessage.addListener(
    (rawMessage, _sender, sendResponse) => {
      const message = rawMessage as BackgroundMessage;

      (async (): Promise<BackgroundResponse> => {
        const settings = await loadSettings();

        if (message.action === "sortByTitle") {
          if (settings.tabSortEnabled !== false) await sortByTitle();
          return { success: true };
        }

        if (message.action === "sortByWebsite") {
          if (settings.tabSortEnabled !== false) await sortByWebsite();
          return { success: true };
        }

        if (message.action === "sortByLastAccessed") {
          if (settings.tabSortEnabled !== false) await sortByLastAccessed();
          return { success: true };
        }

        if (message.action === "moveTabDirection") {
          if (settings.tabShiftEnabled !== false)
            await moveActiveTabToDirection(message.direction);
          return { success: true };
        }

        return { success: false, error: "Unknown action." };
      })()
        .then(sendResponse)
        .catch((error: unknown) => {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Unknown background action error";
          sendResponse({ success: false, error: errorMessage });
        });

      return true;
    },
  );

  browser.tabs.onActivated.addListener((activeInfo) => {
    const existing = captureTimers.get(activeInfo.windowId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      captureTimers.delete(activeInfo.windowId);
      void captureActiveTabPreview(activeInfo.windowId, activeInfo.tabId);
    }, 3000);

    captureTimers.set(activeInfo.windowId, timer);
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    try {
      await evictPreview(tabId);
    } catch {
      // Ignore cleanup errors for removed tabs.
    }
  });
});

function isDirection(value: unknown): value is Direction {
  return (
    value === "up" || value === "down" || value === "left" || value === "right"
  );
}

function shouldSkipPreviewCapture(url: string | undefined): boolean {
  if (!url) {
    return true;
  }

  return url.startsWith("chrome://") || url.startsWith("chrome-extension://");
}

async function captureActiveTabPreview(windowId: number, tabId: number) {
  try {
    const tab = await browser.tabs.get(tabId);
    if (shouldSkipPreviewCapture(tab.url)) {
      return;
    }

    const dataUrl = await browser.tabs.captureVisibleTab(windowId, {
      format: "jpeg",
      quality: 40,
    });

    await storePreview(tabId, dataUrl);
  } catch {
    // Tab can close or become non-capturable before the delayed capture runs.
  }
}

/**
 * Uses geometric targeting (nearest window in direction) for windowed state
 * and cyclic targeting (stable ID-order cycle) for maximized/fullscreen,
 * where screen positions are unreliable.
 */
async function moveActiveTabToDirection(direction: Direction) {
  const currentWindow = await browser.windows.getCurrent({ populate: false });
  if (!currentWindow.id) {
    return;
  }

  const [activeTab] = await browser.tabs.query({
    active: true,
    windowId: currentWindow.id,
  });

  if (!activeTab?.id) {
    return;
  }

  const allWindows = await browser.windows.getAll({ windowTypes: ["normal"] });
  const candidates = allWindows.filter(
    (windowRef) => windowRef.state !== "minimized",
  );
  if (candidates.length <= 1) {
    return;
  }

  const targetWindow =
    currentWindow.state === "maximized" || currentWindow.state === "fullscreen"
      ? findCyclicTarget(candidates, currentWindow.id, direction)
      : findGeometricTarget(candidates, currentWindow, direction);

  if (!targetWindow?.id || targetWindow.id === currentWindow.id) {
    return;
  }

  await browser.tabs.move(activeTab.id, {
    windowId: targetWindow.id,
    index: -1,
  });
  await Promise.all([
    browser.tabs.update(activeTab.id, { active: true }),
    browser.windows.update(targetWindow.id, { focused: true }),
  ]);
}
