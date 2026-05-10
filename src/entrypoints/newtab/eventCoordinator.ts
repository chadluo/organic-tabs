import { getReadingListApi } from "./drag";

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

/**
 * Registers all browser event listeners that drive NTP section reloads.
 * Each callback is debounced so rapid successive events (e.g., a page load
 * firing onUpdated multiple times) collapse into a single reload.
 */
export function initEventCoordinator(
  onTabsChanged: () => void,
  onBookmarksChanged: () => void,
  onReadingListChanged: () => void,
  debounceMs = 100,
): void {
  const reloadTabs = debounce(onTabsChanged, debounceMs);
  const reloadBookmarks = debounce(onBookmarksChanged, debounceMs);
  const reloadReadingList = debounce(onReadingListChanged, debounceMs);

  browser.tabs.onCreated.addListener(reloadTabs);
  browser.tabs.onRemoved.addListener(reloadTabs);
  browser.tabs.onUpdated.addListener(reloadTabs);
  browser.tabs.onMoved.addListener(reloadTabs);
  browser.tabs.onActivated.addListener(reloadTabs);
  browser.tabGroups.onCreated.addListener(reloadTabs);
  browser.tabGroups.onUpdated.addListener(reloadTabs);
  browser.tabGroups.onRemoved.addListener(reloadTabs);

  browser.bookmarks.onCreated.addListener(reloadBookmarks);
  browser.bookmarks.onRemoved.addListener(reloadBookmarks);
  browser.bookmarks.onChanged.addListener(reloadBookmarks);
  browser.bookmarks.onMoved.addListener(reloadBookmarks);

  const readingListApi = getReadingListApi();
  if (readingListApi) {
    readingListApi.onEntryAdded.addListener(reloadReadingList);
    readingListApi.onEntryRemoved.addListener(reloadReadingList);
    readingListApi.onEntryUpdated.addListener(reloadReadingList);
  }
}
