export type SortMode = "title" | "website" | "lastAccessed";

export interface SortableTab {
  id?: number;
  title?: string;
  url?: string;
  pinned?: boolean;
  groupId?: number;
  lastAccessed?: number;
  index?: number;
  splitViewId?: number;
}

/**
 * Three-pass move plan produced by `computeSortMoves` and consumed by `sortTabs`.
 * Passes are applied in order (pinned → groups → ungrouped) to avoid index
 * conflicts as tabs shift positions.
 */
export interface SortPlan {
  pinnedMoves: { tabId: number; index: number }[];
  groupMoves: { groupId: number; index: number }[];
  ungroupedMoves: { tabId: number; index: number }[];
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

/**
 * Produces a path-like sort key that groups tabs by domain. Handles
 * country-code second-level domains (e.g. co.uk, com.au) as a single unit
 * so "bbc.co.uk" sorts alongside other BBC pages rather than generic ".uk" sites.
 */
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

/**
 * Computes target indices for all tabs without moving anything.
 * Groups are sorted as units (by their first tab's sort key); pinned tabs
 * and split-view clusters preserve internal order and are not broken apart.
 */
export function computeSortMoves(
  tabs: SortableTab[],
  compareFn: (a: SortableTab, b: SortableTab) => number,
): SortPlan {
  const TAB_GROUP_NONE = browser.tabGroups.TAB_GROUP_ID_NONE;
  const SPLIT_NONE = browser.tabs.SPLIT_VIEW_ID_NONE;

  const pinnedTabs = tabs.filter((tab) => tab.pinned);
  const groupedTabs = tabs.filter(
    (tab) => !tab.pinned && tab.groupId !== TAB_GROUP_NONE,
  );
  const ungroupedTabs = tabs.filter(
    (tab) => !tab.pinned && tab.groupId === TAB_GROUP_NONE,
  );

  const groupIds = [...new Set(groupedTabs.map((tab) => tab.groupId as number))];
  const groupSizes = new Map<number, number>();
  for (const tab of groupedTabs) {
    const groupId = tab.groupId ?? TAB_GROUP_NONE;
    groupSizes.set(groupId, (groupSizes.get(groupId) ?? 0) + 1);
  }

  const splitClusters = new Map<number, SortableTab[]>();
  const sortUnits: { key: SortableTab; members: SortableTab[] }[] = [];

  for (const tab of ungroupedTabs) {
    const splitId = tab.splitViewId ?? SPLIT_NONE;
    if (splitId !== SPLIT_NONE) {
      if (!splitClusters.has(splitId)) {
        splitClusters.set(splitId, []);
      }
      splitClusters.get(splitId)!.push(tab);
    } else {
      sortUnits.push({ key: tab, members: [tab] });
    }
  }

  for (const cluster of splitClusters.values()) {
    cluster.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    sortUnits.push({ key: cluster[0], members: cluster });
  }

  pinnedTabs.sort(compareFn);
  sortUnits.sort((a, b) => compareFn(a.key, b.key));

  const pinnedMoves: { tabId: number; index: number }[] = [];
  for (let i = 0; i < pinnedTabs.length; i += 1) {
    const tabId = pinnedTabs[i].id;
    if (tabId !== undefined) {
      pinnedMoves.push({ tabId, index: i });
    }
  }

  const groupMoves: { groupId: number; index: number }[] = [];
  let groupTargetIndex = pinnedTabs.length;
  for (const groupId of groupIds) {
    if (groupId !== TAB_GROUP_NONE) {
      groupMoves.push({ groupId, index: groupTargetIndex });
      groupTargetIndex += groupSizes.get(groupId) ?? 0;
    }
  }

  const ungroupedMoves: { tabId: number; index: number }[] = [];
  let targetIndex = groupTargetIndex;
  for (const unit of sortUnits) {
    for (const tab of unit.members) {
      const tabId = tab.id;
      if (tabId !== undefined) {
        ungroupedMoves.push({ tabId, index: targetIndex });
        targetIndex += 1;
      }
    }
  }

  return { pinnedMoves, groupMoves, ungroupedMoves };
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
  const plan = computeSortMoves(tabs, compareFn);

  for (const { tabId, index } of plan.pinnedMoves) {
    await browser.tabs.move(tabId, { index });
  }
  for (const { groupId, index } of plan.groupMoves) {
    await browser.tabGroups.move(groupId, { index });
  }
  for (const { tabId, index } of plan.ungroupedMoves) {
    await browser.tabs.move(tabId, { index });
  }
}
