import {
  SETTINGS_KEY,
  defaultSettings,
  loadSettings,
  loadNtpTitle,
  type Theme,
  type UserSettings,
} from "../../utils/settings";
import { sortTabsByMode } from "../../utils/sort";
import { loadTabCatalog, loadBookmarkCatalog } from "../../utils/catalog";
import { initDrag, setupDropTarget, getReadingListApi } from "./drag";
import { renderBookmarks } from "./renderBookmarks";
import { renderTabs } from "./renderTabs";
import { renderReadingList } from "./renderReadingList";
import { initTitleEditor } from "./titleEditor";
import { initEventCoordinator } from "./eventCoordinator";

const STORAGE_KEY = "detailsState";

type DetailsState = Record<string, boolean>;

let detailsState: DetailsState = {};
let currentSettings: UserSettings = defaultSettings;
let mediaQuery: MediaQueryList | null = null;

function loadState(): Promise<DetailsState> {
  return browser.storage.local
    .get(STORAGE_KEY)
    .then((result) => (result[STORAGE_KEY] as DetailsState | undefined) ?? {});
}

function saveState(state: DetailsState) {
  return browser.storage.local.set({ [STORAGE_KEY]: state });
}

/** Attaches a toggle listener that persists open/close state to storage. */
function wireDetailsToggle(el: HTMLDetailsElement): void {
  const key = el.dataset.stateKey;
  if (!key) return;
  el.addEventListener("toggle", () => {
    detailsState[key] = el.open;
    void saveState(detailsState);
  });
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;

  if (mediaQuery) {
    mediaQuery.removeEventListener("change", onSystemThemeChange);
    mediaQuery = null;
  }

  root.classList.remove("dark", "light");

  if (theme === "dark") {
    root.classList.add("dark");
    return;
  }

  if (theme === "light") {
    root.classList.add("light");
    return;
  }

  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  root.classList.toggle("dark", mediaQuery.matches);
  root.classList.toggle("light", !mediaQuery.matches);
  mediaQuery.addEventListener("change", onSystemThemeChange);
}

function onSystemThemeChange(event: MediaQueryListEvent) {
  const root = document.documentElement;
  root.classList.toggle("dark", event.matches);
  root.classList.toggle("light", !event.matches);
}

function applyLayout(settings: UserSettings) {
  const layout = document.getElementById("layout") as HTMLElement;
  const bookmarksSection = document.getElementById("bookmarks-section") as HTMLElement;
  const readingListSection = document.getElementById("reading-list-section") as HTMLElement;
  const tabsSection = document.getElementById("tabs-section") as HTMLElement;

  layout.style.gridTemplateColumns = `${settings.bookmarksAndListsColumns}fr ${settings.tabColumns}fr`;
  bookmarksSection.style.columns = String(settings.bookmarksAndListsColumns);
  readingListSection.style.columns = String(settings.bookmarksAndListsColumns);
  tabsSection.style.columns = String(settings.tabColumns);
}

async function loadBookmarks() {
  const topFolders = await loadBookmarkCatalog();
  const section = document.getElementById("bookmarks-section") as HTMLElement;
  const heading = section.querySelector("h2") as HTMLHeadingElement;
  section.replaceChildren(heading);
  section.appendChild(renderBookmarks(topFolders, detailsState));
  section.querySelectorAll<HTMLDetailsElement>("[data-testid='bookmark-folder']").forEach((el) => {
    wireDetailsToggle(el);
    setupDropTarget(el, { type: "bookmark-folder", folderId: el.dataset.folderId! });
  });
}

async function loadTabs() {
  const catalog = await loadTabCatalog();
  const section = document.getElementById("tabs-section") as HTMLElement;
  const heading = section.querySelector("h2") as HTMLHeadingElement;
  section.replaceChildren(heading);
  section.appendChild(renderTabs(catalog, detailsState));
  section.querySelectorAll<HTMLDetailsElement>("[data-testid='tab-window']").forEach((el) => {
    wireDetailsToggle(el);
    setupDropTarget(el, { type: "tab-window", windowId: Number(el.dataset.windowId) });
  });
  section.querySelectorAll<HTMLDetailsElement>("[data-testid='tab-group']").forEach((el) => {
    wireDetailsToggle(el);
    setupDropTarget(el, {
      type: "tab-group",
      windowId: Number(el.dataset.windowId),
      groupId: Number(el.dataset.groupId),
    });
  });
  section.querySelectorAll<HTMLButtonElement>(".sort-btn").forEach((btn) => {
    btn.title = `Sort tabs by ${currentSettings.defaultSortMode}`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void sortTabsByMode(currentSettings.defaultSortMode, Number(btn.dataset.windowId));
    });
  });
}

async function loadReadingList() {
  const section = document.getElementById("reading-list-section") as HTMLElement;
  const api = getReadingListApi();

  if (!api) {
    section.hidden = true;
    return;
  }

  // Fetch first, then clear — moving replaceChildren after the await prevents a
  // race condition where two concurrent calls both append their elements because
  // the first call's clear happens before the yield, leaving the section open
  // for the second call to append without re-clearing.
  const entries = await api.query({});
  const heading = section.querySelector("h2") as HTMLHeadingElement;
  section.replaceChildren(heading);
  section.appendChild(renderReadingList(entries, detailsState));
  section.querySelectorAll<HTMLDetailsElement>("[data-testid='reading-list-unread'], [data-testid='reading-list-read']").forEach((el) => {
    wireDetailsToggle(el);
    setupDropTarget(el, {
      type: "reading-list-group",
      hasBeenRead: el.getAttribute("data-testid") === "reading-list-read",
    });
  });
}

function onSettingsChanged(newSettings: UserSettings) {
  applyTheme(newSettings.theme);
  applyLayout(newSettings);
  currentSettings = newSettings;
}

initEventCoordinator(
  () => void loadTabs(),
  () => void loadBookmarks(),
  () => void loadReadingList(),
);

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[SETTINGS_KEY]) {
    return;
  }
  const updated = {
    ...defaultSettings,
    ...(changes[SETTINGS_KEY].newValue as Partial<UserSettings> | undefined),
  };
  onSettingsChanged(updated);
});

async function init() {
  const settings = await loadSettings();
  currentSettings = settings;

  if (!settings.newTabEnabled) {
    void browser.tabs.update({ url: "chrome://new-tab-page" });
    return;
  }

  const ownTab = await browser.tabs.getCurrent();
  if (ownTab?.id !== undefined) {
    const ownTabId = ownTab.id;
    const initialTitle = await loadNtpTitle(ownTabId);
    document.title = initialTitle;
    initTitleEditor(ownTabId, initialTitle);
  }
  applyTheme(settings.theme);
  applyLayout(settings);

  initDrag(() => void loadTabs());
  detailsState = await loadState();
  await loadBookmarks();
  await loadReadingList();
  await loadTabs();
}

void init();
