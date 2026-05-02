import {
  SETTINGS_KEY,
  loadSettings,
  type Direction,
  type SortMode,
} from "../utils/settings";

type TabPreviews = Record<string, string>;

interface Point {
  x: number;
  y: number;
}

interface EdgeMidpoints {
  current: Point;
  candidate: Point;
}

interface BrowserTab {
  id?: number;
  title?: string;
  url?: string;
  pinned?: boolean;
  groupId?: number;
  lastAccessed?: number;
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
const TAB_GROUP_ID_NONE = -1;

const captureTimers = new Map<number, ReturnType<typeof setTimeout>>();
const GENERIC_SLDS = new Set([
  "co",
  "com",
  "net",
  "org",
  "gov",
  "edu",
  "ac",
  "mil",
]);

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

async function sortTabsByMode(mode: SortMode) {
  if (mode === "title") {
    await sortByTitle();
    return;
  }

  if (mode === "lastAccessed") {
    await sortByLastAccessed();
    return;
  }

  await sortByWebsite();
}

async function sortByTitle() {
  await sortTabs((a, b) => naturalCompare(a.title ?? "", b.title ?? ""));
}

async function sortByLastAccessed() {
  await sortTabs((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
}

async function sortByWebsite() {
  const sortKeyCache = new Map<string, string>();

  const getCachedSortKey = (url: string | undefined) => {
    const key = url ?? "";
    if (!sortKeyCache.has(key)) {
      sortKeyCache.set(key, getUrlSortKey(key));
    }
    return sortKeyCache.get(key) ?? key;
  };

  await sortTabs((a, b) => {
    const keyA = getCachedSortKey(a.url);
    const keyB = getCachedSortKey(b.url);
    return naturalCompare(keyA, keyB);
  });
}

async function sortTabs(compareFn: (a: BrowserTab, b: BrowserTab) => number) {
  const tabs = await browser.tabs.query({ currentWindow: true });
  const pinnedTabs = tabs.filter((tab) => tab.pinned);
  const groupedTabs = tabs.filter(
    (tab) => !tab.pinned && tab.groupId !== TAB_GROUP_ID_NONE,
  );
  const ungroupedTabs = tabs.filter(
    (tab) => !tab.pinned && tab.groupId === TAB_GROUP_ID_NONE,
  );

  const groupIds = [...new Set(groupedTabs.map((tab) => tab.groupId))];
  const groupSizes = new Map<number, number>();
  for (const tab of groupedTabs) {
    const groupId = tab.groupId ?? TAB_GROUP_ID_NONE;
    groupSizes.set(groupId, (groupSizes.get(groupId) ?? 0) + 1);
  }

  pinnedTabs.sort(compareFn);
  ungroupedTabs.sort(compareFn);

  for (let i = 0; i < pinnedTabs.length; i += 1) {
    const tabId = pinnedTabs[i].id;
    if (tabId !== undefined) {
      await browser.tabs.move(tabId, { index: i });
    }
  }

  let groupTargetIndex = pinnedTabs.length;
  for (const groupId of groupIds) {
    if (groupId !== TAB_GROUP_ID_NONE) {
      await browser.tabGroups.move(groupId, { index: groupTargetIndex });
      groupTargetIndex += groupSizes.get(groupId) ?? 0;
    }
  }

  for (let i = 0; i < ungroupedTabs.length; i += 1) {
    const tabId = ungroupedTabs[i].id;
    if (tabId !== undefined) {
      await browser.tabs.move(tabId, { index: groupTargetIndex + i });
    }
  }
}

function naturalCompare(a: string, b: string): number {
  const re = /^(.*?)(\d+)$/;
  const matchA = a.match(re);
  const matchB = b.match(re);

  if (matchA && matchB && matchA[1] === matchB[1]) {
    return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
  }

  return a.localeCompare(b);
}

function getUrlSortKey(url: string): string {
  try {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol.replace(":", "");
    const parts = urlObj.hostname.split(".").reverse();
    const path = urlObj.pathname;

    const isCountryTld =
      parts.length >= 3 && parts[0].length === 2 && GENERIC_SLDS.has(parts[1]);
    const domainPartCount = isCountryTld ? 3 : Math.min(2, parts.length);

    const domain = parts.slice(0, domainPartCount).reverse().join(".");
    const subdomains = parts.slice(domainPartCount).join("/");

    return `/${protocol}/${domain}${subdomains ? `/${subdomains}` : ""}${path}`;
  } catch {
    return url;
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
