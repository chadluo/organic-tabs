import type { SortMode } from "./settings";

export interface SortableTab {
  id?: number;
  title?: string;
  url?: string;
  pinned?: boolean;
  groupId?: number;
  lastAccessed?: number;
}


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

export function naturalCompare(a: string, b: string): number {
  const re = /^(.*?)(\d+)$/;
  const matchA = a.match(re);
  const matchB = b.match(re);

  if (matchA && matchB && matchA[1] === matchB[1]) {
    return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
  }

  return a.localeCompare(b);
}

export function getUrlSortKey(url: string): string {
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

export async function sortTabsByMode(mode: SortMode, windowId?: number) {
  if (mode === "title") {
    await sortByTitle(windowId);
    return;
  }

  if (mode === "lastAccessed") {
    await sortByLastAccessed(windowId);
    return;
  }

  await sortByWebsite(windowId);
}

export async function sortByTitle(windowId?: number) {
  await sortTabs((a, b) => naturalCompare(a.title ?? "", b.title ?? ""), windowId);
}

export async function sortByLastAccessed(windowId?: number) {
  await sortTabs((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0), windowId);
}

export async function sortByWebsite(windowId?: number) {
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
  }, windowId);
}

export async function sortTabs(
  compareFn: (a: SortableTab, b: SortableTab) => number,
  windowId?: number,
) {
  const queryOptions =
    windowId !== undefined ? { windowId } : { currentWindow: true as const };
  const tabs = await browser.tabs.query(queryOptions);
  const pinnedTabs = tabs.filter((tab) => tab.pinned);
  const groupedTabs = tabs.filter(
    (tab) => !tab.pinned && tab.groupId !== browser.tabGroups.TAB_GROUP_ID_NONE,
  );
  const ungroupedTabs = tabs.filter(
    (tab) => !tab.pinned && tab.groupId === browser.tabGroups.TAB_GROUP_ID_NONE,
  );

  const groupIds = [...new Set(groupedTabs.map((tab) => tab.groupId))];
  const groupSizes = new Map<number, number>();
  for (const tab of groupedTabs) {
    const groupId = tab.groupId ?? browser.tabGroups.TAB_GROUP_ID_NONE;
    groupSizes.set(groupId, (groupSizes.get(groupId) ?? 0) + 1);
  }

  // Build sort units: plain tabs as single-tab units, split clusters as
  // multi-tab units keyed by the lowest-index tab in the split.
  type Tab = (typeof tabs)[0];
  const splitClusters = new Map<number, Tab[]>();
  const sortUnits: { key: Tab; members: Tab[] }[] = [];

  for (const tab of ungroupedTabs) {
    const splitId = tab.splitViewId ?? browser.tabs.SPLIT_VIEW_ID_NONE;
    if (splitId !== browser.tabs.SPLIT_VIEW_ID_NONE) {
      if (!splitClusters.has(splitId)) {
        splitClusters.set(splitId, []);
      }
      splitClusters.get(splitId)!.push(tab);
    } else {
      sortUnits.push({ key: tab, members: [tab] });
    }
  }

  for (const cluster of splitClusters.values()) {
    cluster.sort((a, b) => a.index - b.index);
    sortUnits.push({ key: cluster[0], members: cluster });
  }

  pinnedTabs.sort(compareFn);
  sortUnits.sort((a, b) => compareFn(a.key, b.key));

  for (let i = 0; i < pinnedTabs.length; i += 1) {
    const tabId = pinnedTabs[i].id;
    if (tabId !== undefined) {
      await browser.tabs.move(tabId, { index: i });
    }
  }

  let groupTargetIndex = pinnedTabs.length;
  for (const groupId of groupIds) {
    if (groupId !== browser.tabGroups.TAB_GROUP_ID_NONE) {
      await browser.tabGroups.move(groupId, { index: groupTargetIndex });
      groupTargetIndex += groupSizes.get(groupId) ?? 0;
    }
  }

  let targetIndex = groupTargetIndex;
  for (const unit of sortUnits) {
    for (const tab of unit.members) {
      const tabId = tab.id;
      if (tabId !== undefined) {
        await browser.tabs.move(tabId, { index: targetIndex });
        targetIndex += 1;
      }
    }
  }
}
