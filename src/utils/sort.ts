import { loadSortRules } from "./settings";

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
 * conflicts as tabs shift positions. Pinned and ungrouped tabs each move in one
 * batched `tabs.move` call, as a contiguous run in array order: pinned from
 * index 0, ungrouped from `ungroupedIndex`. All arrays are empty when the
 * window is already in sorted order.
 */
export interface SortPlan {
  pinnedTabIds: number[];
  groupMoves: { groupId: number; index: number }[];
  ungroupedTabIds: number[];
  ungroupedIndex: number;
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
 * Sort key for a URL as levels: `[[protocol], [domain], subdomains, pathSegments]`.
 * Subdomains run from the domain outward (`a.b.example.com` → `["b", "a"]`).
 * Levels stay separate so a subdomain never compares against a path segment.
 * Unparsable URLs fall back to `[[url]]`.
 * `rules` (keyed by exact hostname) reorders the path level, see `applyRules`.
 */
export type UrlSortKey = string[][];

/**
 * User-defined path order per exact hostname. Each list holds normalized path
 * rules (`"docs"`, `"docs/api"`, or `"/"` for the root page) in sort order,
 * plus one `OTHERS` marker where all unmatched paths go.
 */
export type HostRules = Record<string, string[]>;

/** Marker inside a rule list for "every path no rule matches". Never a valid rule. */
export const OTHERS = "";

/**
 * Turns user input (path, or pasted URL) into a stored rule: whole path
 * segments joined by `/`, no query or hash, `"/"` for the root page, `""` when blank.
 * Goes through `URL` so encoding matches `pathname` of real tabs.
 */
export function normalizeRule(input: string): string {
  const text = input.trim();
  if (!text) return OTHERS;
  try {
    const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
      ? new URL(text)
      : new URL(text.replace(/^\/*/, "/"), "http://h");
    return url.pathname.split("/").filter(Boolean).join("/") || "/";
  } catch {
    return OTHERS;
  }
}

/**
 * Prepends the rule rank to the path segments so rules override alphabetical
 * order. The longest rule whose whole segments lead the path wins and its
 * segments are consumed; `"/"` matches only an empty path. No match → `OTHERS` rank.
 * Rank is zero-padded so `naturalCompare` orders it numerically.
 */
function applyRules(segments: string[], rules: string[]): string[] {
  let best = -1;
  let bestLength = -1;
  rules.forEach((rule, i) => {
    if (rule === OTHERS) return;
    const ruleSegments = rule === "/" ? [] : rule.split("/");
    const matches =
      rule === "/"
        ? segments.length === 0
        : ruleSegments.every((segment, j) => segments[j] === segment);
    if (matches && ruleSegments.length > bestLength) {
      best = i;
      bestLength = ruleSegments.length;
    }
  });
  const rank = best >= 0 ? best : rules.indexOf(OTHERS);
  const rest = best >= 0 ? segments.slice(bestLength) : segments;
  return [String(rank < 0 ? rules.length : rank).padStart(4, "0"), ...rest];
}

/**
 * Builds a `UrlSortKey` that groups tabs by registrable domain. Handles
 * country-code second-level domains (e.g. co.uk, com.au) as a single unit
 * so "bbc.co.uk" sorts alongside other BBC pages rather than generic ".uk" sites.
 */
export function getUrlSortKey(url: string, rules: HostRules = {}): UrlSortKey {
  try {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol.replace(":", "");
    const parts = urlObj.hostname.split(".").reverse();

    const isCountryTld =
      parts.length >= 3 && parts[0].length === 2 && GENERIC_SLDS.has(parts[1]);
    const domainPartCount = isCountryTld ? 3 : Math.min(2, parts.length);

    const domain = parts.slice(0, domainPartCount).reverse().join(".");
    const subdomains = parts.slice(domainPartCount);
    let pathSegments = urlObj.pathname.split("/").filter(Boolean);
    const hostRules = Object.hasOwn(rules, urlObj.hostname) ? rules[urlObj.hostname] : undefined;
    if (hostRules) pathSegments = applyRules(pathSegments, hostRules);

    return [[protocol], [domain], subdomains, pathSegments];
  } catch {
    return [[url]];
  }
}

/** Element-wise compare; the first difference decides, and a prefix sorts first. */
function compareLists<T>(a: T[], b: T[], compare: (x: T, y: T) => number): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const result = compare(a[i]!, b[i]!);
    if (result !== 0) {
      return result;
    }
  }
  return a.length - b.length;
}

/**
 * Orders `UrlSortKey`s level by level with `naturalCompare` per segment, so
 * `example.com` (no subdomains) sorts before every `*.example.com`.
 */
export function compareUrlSortKeys(a: UrlSortKey, b: UrlSortKey): number {
  return compareLists(a, b, (x, y) => compareLists(x, y, naturalCompare));
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

  const groupMoves: { groupId: number; index: number }[] = [];
  let groupTargetIndex = pinnedTabs.length;
  for (const groupId of groupIds) {
    if (groupId !== TAB_GROUP_NONE) {
      groupMoves.push({ groupId, index: groupTargetIndex });
      groupTargetIndex += groupSizes.get(groupId) ?? 0;
    }
  }

  const ids = (list: SortableTab[]) =>
    list.flatMap((tab) => (tab.id === undefined ? [] : [tab.id]));
  const pinnedTabIds = ids(pinnedTabs);
  const ungroupedTabIds = ids(sortUnits.flatMap((unit) => unit.members));

  // Skip every move when the final order already matches the current order.
  const currentIds = ids([...tabs].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)));
  const finalIds = [
    ...pinnedTabIds,
    ...groupIds.flatMap((groupId) => ids(groupedTabs.filter((tab) => tab.groupId === groupId))),
    ...ungroupedTabIds,
  ];
  if (finalIds.every((id, i) => id === currentIds[i])) {
    return { pinnedTabIds: [], groupMoves: [], ungroupedTabIds: [], ungroupedIndex: groupTargetIndex };
  }

  return { pinnedTabIds, groupMoves, ungroupedTabIds, ungroupedIndex: groupTargetIndex };
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
  const rules = await loadSortRules();
  const sortKeyCache = new Map<string, UrlSortKey>();

  const getCachedSortKey = (url: string | undefined) => {
    const key = url ?? "";
    let sortKey = sortKeyCache.get(key);
    if (!sortKey) {
      sortKey = getUrlSortKey(key, rules);
      sortKeyCache.set(key, sortKey);
    }
    return sortKey;
  };

  await sortTabs(
    (a, b) => compareUrlSortKeys(getCachedSortKey(a.url), getCachedSortKey(b.url)),
    windowId,
  );
}

export async function sortTabs(
  compareFn: (a: SortableTab, b: SortableTab) => number,
  windowId?: number,
) {
  const queryOptions =
    windowId !== undefined ? { windowId } : { currentWindow: true as const };
  const tabs = await browser.tabs.query(queryOptions);
  const plan = computeSortMoves(tabs, compareFn);

  if (plan.pinnedTabIds.length > 0) {
    await browser.tabs.move(plan.pinnedTabIds, { index: 0 });
  }
  for (const { groupId, index } of plan.groupMoves) {
    await browser.tabGroups.move(groupId, { index });
  }
  if (plan.ungroupedTabIds.length > 0) {
    await browser.tabs.move(plan.ungroupedTabIds, { index: plan.ungroupedIndex });
  }
}
