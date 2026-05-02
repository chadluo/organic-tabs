import { loadSettings, type Direction } from "../utils/settings";
import {
  sortTabsByMode,
  sortByTitle,
  sortByWebsite,
  sortByLastAccessed,
} from "../utils/sort";

type TabPreviews = Record<string, string>;

interface Point {
  x: number;
  y: number;
}

interface EdgeMidpoints {
  current: Point;
  candidate: Point;
}

interface BrowserWindow {
  id?: number;
  state?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

const PREVIEWS_KEY = "tabPreviews";

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

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      const settings = await loadSettings();

      if (message?.action === "sortByTitle") {
        if (settings.tabSortEnabled !== false) await sortByTitle();
        sendResponse({ success: true });
        return;
      }

      if (message?.action === "sortByWebsite") {
        if (settings.tabSortEnabled !== false) await sortByWebsite();
        sendResponse({ success: true });
        return;
      }

      if (message?.action === "sortByLastAccessed") {
        if (settings.tabSortEnabled !== false) await sortByLastAccessed();
        sendResponse({ success: true });
        return;
      }

      if (
        message?.action === "moveTabDirection" &&
        isDirection(message?.direction)
      ) {
        if (settings.tabShiftEnabled !== false)
          await moveActiveTabToDirection(message.direction);
        sendResponse({ success: true });
        return;
      }

      sendResponse({ success: false, error: "Unknown action." });
    })().catch((error: unknown) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown background action error";
      sendResponse({ success: false, error: errorMessage });
    });

    return true;
  });

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
      const result = await browser.storage.local.get(PREVIEWS_KEY);
      const previews = (result[PREVIEWS_KEY] as TabPreviews | undefined) ?? {};
      delete previews[String(tabId)];
      await browser.storage.local.set({ [PREVIEWS_KEY]: previews });
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

    const result = await browser.storage.local.get(PREVIEWS_KEY);
    const previews = (result[PREVIEWS_KEY] as TabPreviews | undefined) ?? {};
    previews[String(tabId)] = dataUrl;
    await browser.storage.local.set({ [PREVIEWS_KEY]: previews });
  } catch {
    // Tab can close or become non-capturable before the delayed capture runs.
  }
}

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

function findCyclicTarget(
  windows: BrowserWindow[],
  currentId: number,
  direction: Direction,
): BrowserWindow | null {
  const sorted = [...windows].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const idx = sorted.findIndex((windowRef) => windowRef.id === currentId);
  if (idx < 0) {
    return null;
  }

  const isPrev = direction === "up" || direction === "left";
  const nextIdx = isPrev
    ? (idx - 1 + sorted.length) % sorted.length
    : (idx + 1) % sorted.length;

  return sorted[nextIdx] ?? null;
}

function getEdgeMidpoints(
  windowRef: BrowserWindow,
  direction: Direction,
): EdgeMidpoints {
  const left = windowRef.left ?? 0;
  const top = windowRef.top ?? 0;
  const width = windowRef.width ?? 0;
  const height = windowRef.height ?? 0;

  switch (direction) {
    case "right":
      return {
        current: { x: left + width, y: top + height / 2 },
        candidate: { x: left, y: top + height / 2 },
      };
    case "left":
      return {
        current: { x: left, y: top + height / 2 },
        candidate: { x: left + width, y: top + height / 2 },
      };
    case "down":
      return {
        current: { x: left + width / 2, y: top + height },
        candidate: { x: left + width / 2, y: top },
      };
    case "up":
      return {
        current: { x: left + width / 2, y: top },
        candidate: { x: left + width / 2, y: top + height },
      };
  }
}

function findGeometricTarget(
  windows: BrowserWindow[],
  currentWindow: BrowserWindow,
  direction: Direction,
): BrowserWindow | null {
  const { current: refPoint } = getEdgeMidpoints(currentWindow, direction);

  const inRange = windows.filter(
    (windowRef) => windowRef.id !== currentWindow.id,
  );
  if (inRange.length === 0) {
    return null;
  }

  const isHorizontal = direction === "left" || direction === "right";

  inRange.sort((a, b) => {
    const { candidate: candidateA } = getEdgeMidpoints(a, direction);
    const { candidate: candidateB } = getEdgeMidpoints(b, direction);
    const distanceA = isHorizontal
      ? Math.abs(candidateA.x - refPoint.x)
      : Math.abs(candidateA.y - refPoint.y);
    const distanceB = isHorizontal
      ? Math.abs(candidateB.x - refPoint.x)
      : Math.abs(candidateB.y - refPoint.y);
    return distanceA - distanceB;
  });

  return inRange[0] ?? null;
}
