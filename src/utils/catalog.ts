export interface BookmarkNode {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkNode[];
}

export interface CatalogGroup {
  id: number;
  title: string;
  color?: string;
  collapsed: boolean;
}

export interface CatalogTab {
  id?: number;
  windowId?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  active?: boolean;
  groupId?: number;
  lastAccessed?: number;
  index?: number;
  splitViewId?: number;
}

export interface CatalogWindow {
  id: number;
  isCurrent: boolean;
  tabs: CatalogTab[];
  lastAccessed: number;
}

/**
 * Flat snapshot of all open windows and their tab groups.
 * Windows are pre-sorted by lastAccessed descending (most recent first).
 */
export interface TabCatalog {
  windows: CatalogWindow[];
  groups: Map<number, CatalogGroup>;
}

/** Fetches all windows, the active window, and tab groups in parallel. */
export async function loadTabCatalog(): Promise<TabCatalog> {
  const [allWindows, currentWindow, groups] = await Promise.all([
    browser.windows.getAll({ populate: true }),
    browser.windows.getCurrent(),
    browser.tabGroups.query({}),
  ]);

  const groupMap = new Map<number, CatalogGroup>(
    groups.map((g) => [
      g.id,
      { id: g.id, title: g.title ?? "", color: g.color, collapsed: g.collapsed ?? false },
    ]),
  );

  const windows: CatalogWindow[] = allWindows
    .filter((w) => w.id !== undefined)
    .map((w) => ({
      id: w.id!,
      isCurrent: w.id === currentWindow.id,
      tabs: (w.tabs ?? []) as CatalogTab[],
      lastAccessed: Math.max(...(w.tabs ?? []).map((t) => t.lastAccessed ?? 0)),
    }))
    .sort((a, b) => b.lastAccessed - a.lastAccessed);

  return { windows, groups: groupMap };
}

/**
 * Returns the browser's top-level bookmark folders (Bookmarks Bar, Other Bookmarks, etc.)
 * by stripping one level of synthetic roots from `bookmarks.getTree`.
 */
export async function loadBookmarkCatalog(): Promise<BookmarkNode[]> {
  const tree = await browser.bookmarks.getTree();
  const topFolders: BookmarkNode[] = [];
  for (const root of tree) {
    for (const child of root.children ?? []) {
      topFolders.push(child as BookmarkNode);
    }
  }
  return topFolders;
}
