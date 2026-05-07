import {
  SETTINGS_KEY,
  defaultSettings,
  loadSettings,
  type Theme,
  type UserSettings,
} from "../../utils/settings";
import { sortTabsByMode } from "../../utils/sort";
import { retrievePreview } from "../../utils/preview";
import {
  loadTabCatalog,
  loadBookmarkCatalog,
  type CatalogTab,
  type BookmarkNode,
} from "../../utils/catalog";
import {
  initDrag,
  setupDropTarget,
  makeTabDraggable,
  makeReadingListDraggable,
  makeBookmarkDraggable,
  getReadingListApi,
  type ReadingListEntry,
  type TabDragData,
} from "./drag";

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
  const bookmarksSection = document.getElementById(
    "bookmarks-section",
  ) as HTMLElement;
  const readingListSection = document.getElementById(
    "reading-list-section",
  ) as HTMLElement;
  const tabsSection = document.getElementById("tabs-section") as HTMLElement;

  bookmarksSection.style.flex = String(settings.bookmarkColumns);
  bookmarksSection.style.columns = String(settings.bookmarkColumns);
  readingListSection.style.flex = String(settings.readingListColumns);
  readingListSection.style.columns = String(settings.readingListColumns);
  tabsSection.style.flex = String(settings.tabColumns);
  tabsSection.style.columns = String(settings.tabColumns);
}

function trackDetails(
  details: HTMLDetailsElement,
  key: string,
  fallback: boolean,
) {
  details.open = detailsState[key] ?? fallback;
  details.addEventListener("toggle", () => {
    detailsState[key] = details.open;
    void saveState(detailsState);
  });
}


function faviconUrl(pageUrl: string): string {
  if (!pageUrl) {
    return "";
  }

  const encoded = encodeURIComponent(pageUrl);
  return `chrome-extension://${browser.runtime.id}/_favicon/?pageUrl=${encoded}&size=16`;
}

function hostname(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return "";
  }
}

function setSoftWrappingTitle(el: HTMLElement, title: string) {
  const parts = title.split("/");
  el.appendChild(document.createTextNode(parts[0] ?? ""));

  for (let i = 1; i < parts.length; i += 1) {
    el.appendChild(document.createElement("wbr"));
    el.appendChild(document.createTextNode(`/${parts[i]}`));
  }
}

function populateLink(
  content: DocumentFragment,
  url: string,
  faviconOverride = "",
) {
  const img = content.querySelector(".favicon") as HTMLImageElement;
  const host = content.querySelector(".hostname") as HTMLSpanElement;
  const anchor = content.querySelector(".link") as HTMLAnchorElement;

  img.src = faviconOverride || faviconUrl(url);
  host.textContent = hostname(url);
  if (!anchor.textContent) {
    setSoftWrappingTitle(anchor, url);
  }
}

class BookmarkLink extends HTMLElement {
  connectedCallback() {
    const template = document.getElementById(
      "bookmark-link-template",
    ) as HTMLTemplateElement;
    const content = template.content.cloneNode(true) as DocumentFragment;
    const url = this.getAttribute("url") ?? "";
    const title = this.getAttribute("title") || url;
    const anchor = content.querySelector(".link") as HTMLAnchorElement;

    anchor.href = url;
    setSoftWrappingTitle(anchor, title);

    if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
      anchor.addEventListener("click", (event) => {
        event.preventDefault();
        void browser.tabs.update({ url });
      });
    }

    populateLink(content, url);
    this.appendChild(content);
  }
}

class TabLink extends HTMLElement {
  connectedCallback() {
    const tabId = Number(this.getAttribute("tab-id"));
    const windowId = Number(this.getAttribute("window-id"));
    const url = this.getAttribute("url") ?? "";

    const template = document.getElementById(
      "tab-link-template",
    ) as HTMLTemplateElement;
    const content = template.content.cloneNode(true) as DocumentFragment;
    const anchor = content.querySelector(".link") as HTMLAnchorElement;

    setSoftWrappingTitle(anchor, this.getAttribute("title") || "Untitled");
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      void browser.tabs.update(tabId, { active: true });
      void browser.windows.update(windowId, { focused: true });
    });

    const faviconOverride = this.getAttribute("favicon") ?? "";
    populateLink(content, url, faviconOverride);
    this.appendChild(content);

    this.addEventListener("mouseenter", (event: MouseEvent) => {
      void this.showPreview(url, tabId, event);
    });

    this.addEventListener("mouseleave", () => {
      document
        .querySelectorAll(".duplicate-highlight")
        .forEach((el) => el.classList.remove("duplicate-highlight"));
      document.querySelectorAll(".tab-preview").forEach((el) => el.remove());
    });
  }

  private async showPreview(url: string, tabId: number, event: MouseEvent) {
    document
      .querySelectorAll(`tab-link[url="${CSS.escape(url)}"]`)
      .forEach((el) => {
        if (el !== this) {
          el.classList.add("duplicate-highlight");
        }
      });

    const dataUrl = await retrievePreview(tabId);
    if (!dataUrl) {
      return;
    }

    const preview = document.createElement("div");
    preview.className = "tab-preview";
    const image = document.createElement("img");
    image.src = dataUrl;
    preview.appendChild(image);
    document.body.appendChild(preview);

    const previewWidth = 320;
    const left =
      event.clientX + previewWidth + 16 > window.innerWidth
        ? event.clientX - previewWidth - 8
        : event.clientX + 12;
    preview.style.left = `${left}px`;
    preview.style.top = `${Math.max(8, event.clientY + 12)}px`;
  }
}

class ReadingListLink extends HTMLElement {
  connectedCallback() {
    const template = document.getElementById(
      "reading-list-link-template",
    ) as HTMLTemplateElement;
    const content = template.content.cloneNode(true) as DocumentFragment;
    const url = this.getAttribute("url") ?? "";
    const title = this.getAttribute("title") || url;
    const anchor = content.querySelector(".link") as HTMLAnchorElement;

    anchor.href = url;
    setSoftWrappingTitle(anchor, title);
    populateLink(content, url);
    this.appendChild(content);
  }
}

if (!customElements.get("bookmark-link")) {
  customElements.define("bookmark-link", BookmarkLink);
}

if (!customElements.get("tab-link")) {
  customElements.define("tab-link", TabLink);
}

if (!customElements.get("reading-list-link")) {
  customElements.define("reading-list-link", ReadingListLink);
}

function renderBookmarkNode(node: BookmarkNode): HTMLElement | null {
  if (node.url) {
    const li = document.createElement("li");
    li.setAttribute("data-testid", "bookmark-item");
    li.setAttribute("data-url", node.url);
    const link = document.createElement("bookmark-link");
    link.setAttribute("url", node.url);
    link.setAttribute("title", node.title || node.url);
    li.appendChild(link);
    makeBookmarkDraggable(li, { id: node.id, url: node.url, title: node.title || node.url });
    return li;
  }

  if (node.children && node.children.length > 0) {
    const details = document.createElement("details");
    details.setAttribute("data-testid", "bookmark-folder");
    details.setAttribute("data-folder-id", node.id);
    const summary = document.createElement("summary");
    summary.textContent = node.title || "Bookmarks";
    details.appendChild(summary);
    trackDetails(details, `bookmark:${node.id}`, false);
    setupDropTarget(details, { type: "bookmark-folder", folderId: node.id });

    const ul = document.createElement("ul");
    for (const child of node.children) {
      const rendered = renderBookmarkNode(child);
      if (rendered) {
        ul.appendChild(rendered);
      }
    }

    details.appendChild(ul);
    return details;
  }

  return null;
}

async function loadBookmarks() {
  const topFolders = await loadBookmarkCatalog();
  const section = document.getElementById("bookmarks-section") as HTMLElement;
  const heading = section.querySelector("h2") as HTMLHeadingElement;
  section.replaceChildren(heading);

  for (const folder of topFolders) {
    const rendered = renderBookmarkNode(folder);
    if (rendered) {
      section.appendChild(rendered);
    }
  }
}

function createTabLi(tab: CatalogTab): HTMLLIElement {
  const li = document.createElement("li");
  li.setAttribute("data-testid", "tab-item");
  li.setAttribute("data-url", tab.url ?? "");
  const tabData: TabDragData = {
    tabId: tab.id ?? 0,
    sourceWindowId: tab.windowId ?? 0,
    sourceGroupId: tab.groupId ?? browser.tabGroups.TAB_GROUP_ID_NONE,
    url: tab.url ?? "",
    title: tab.title ?? "",
  };
  makeTabDraggable(li, tabData);
  const link = document.createElement("tab-link");

  if (tab.id !== undefined) {
    link.setAttribute("tab-id", String(tab.id));
  }
  if (tab.windowId !== undefined) {
    link.setAttribute("window-id", String(tab.windowId));
  }
  link.setAttribute("title", tab.title || tab.url || "");
  link.setAttribute("url", tab.url || "");

  if (tab.favIconUrl) {
    link.setAttribute("favicon", tab.favIconUrl);
  }

  li.appendChild(link);
  return li;
}

async function loadTabs() {
  const { windows, groups: groupMap } = await loadTabCatalog();

  const section = document.getElementById("tabs-section") as HTMLElement;
  const heading = section.querySelector("h2") as HTMLHeadingElement;
  section.replaceChildren(heading);

  for (const windowRef of windows) {
    const details = document.createElement("details");
    details.setAttribute("data-testid", "tab-window");
    details.setAttribute("data-window-id", String(windowRef.id));
    trackDetails(details, `window:${windowRef.id}`, true);
    setupDropTarget(details, { type: "tab-window", windowId: windowRef.id });

    const activeTab = windowRef.tabs.find((tab) => tab.active);
    const windowLabel = activeTab
      ? `${activeTab.title} (${windowRef.tabs.length} tabs)`
      : `Window (${windowRef.tabs.length} tabs)`;

    const summary = document.createElement("summary");
    summary.classList.add("window-summary");
    if (windowRef.isCurrent) {
      summary.classList.add("current-window");
    }

    const labelSpan = document.createElement("span");
    labelSpan.textContent = windowLabel;
    summary.appendChild(labelSpan);

    const sortBtn = document.createElement("button");
    sortBtn.className = "sort-btn";
    sortBtn.title = `Sort tabs by ${currentSettings.defaultSortMode}`;
    sortBtn.textContent = "⇅";
    sortBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void sortTabsByMode(currentSettings.defaultSortMode, windowRef.id);
    });
    summary.appendChild(sortBtn);

    details.appendChild(summary);

    const ul = document.createElement("ul");

    let currentGroupId: number = browser.tabGroups.TAB_GROUP_ID_NONE;
    let groupUl: HTMLUListElement | null = null;

    for (const tab of windowRef.tabs) {
      const tabGroupId = tab.groupId ?? browser.tabGroups.TAB_GROUP_ID_NONE;
      if (tabGroupId !== browser.tabGroups.TAB_GROUP_ID_NONE && tabGroupId !== currentGroupId) {
        const group = groupMap.get(tabGroupId);
        const groupDetails = document.createElement("details");
        groupDetails.setAttribute("data-testid", "tab-group");
        groupDetails.setAttribute("data-group-id", String(tabGroupId));
        const collapsed = group?.collapsed ?? false;
        trackDetails(groupDetails, `tabgroup:${tabGroupId}`, !collapsed);
        setupDropTarget(groupDetails, { type: "tab-group", windowId: windowRef.id, groupId: tabGroupId });

        const groupSummary = document.createElement("summary");
        groupSummary.textContent = group?.title || "Unnamed Group";
        if (group?.color) {
          groupSummary.classList.add(`group-${group.color}`);
        }
        groupDetails.appendChild(groupSummary);

        groupUl = document.createElement("ul");
        groupDetails.appendChild(groupUl);

        const li = document.createElement("li");
        li.appendChild(groupDetails);
        ul.appendChild(li);
      }

      if (tabGroupId !== browser.tabGroups.TAB_GROUP_ID_NONE) {
        currentGroupId = tabGroupId;
        groupUl?.appendChild(createTabLi(tab));
      } else {
        currentGroupId = browser.tabGroups.TAB_GROUP_ID_NONE;
        groupUl = null;
        ul.appendChild(createTabLi(tab));
      }
    }

    details.appendChild(ul);
    section.appendChild(details);
  }
}

function createReadingListLi(entry: ReadingListEntry): HTMLLIElement {
  const li = document.createElement("li");
  li.setAttribute("data-testid", "reading-list-item");
  li.setAttribute("data-url", entry.url);
  makeReadingListDraggable(li, { url: entry.url, title: entry.title, hasBeenRead: entry.hasBeenRead });

  const link = document.createElement("reading-list-link");
  link.setAttribute("url", entry.url);
  link.setAttribute("title", entry.title || entry.url);
  li.appendChild(link);
  return li;
}

async function loadReadingList() {
  const section = document.getElementById("reading-list-section") as HTMLElement;
  const api = getReadingListApi();

  if (!api) {
    section.hidden = true;
    return;
  }

  const heading = section.querySelector("h2") as HTMLHeadingElement;
  section.replaceChildren(heading);

  const entries = await api.query({});
  const unread = entries.filter((e) => !e.hasBeenRead);
  const read = entries.filter((e) => e.hasBeenRead);

  const unreadDetails = document.createElement("details");
  unreadDetails.setAttribute("data-testid", "reading-list-unread");
  trackDetails(unreadDetails, "readingList:unread", true);
  setupDropTarget(unreadDetails, { type: "reading-list-group", hasBeenRead: false });
  const unreadSummary = document.createElement("summary");
  unreadSummary.textContent = "Unread";
  unreadDetails.appendChild(unreadSummary);
  const unreadUl = document.createElement("ul");
  for (const entry of unread) unreadUl.appendChild(createReadingListLi(entry));
  unreadDetails.appendChild(unreadUl);
  section.appendChild(unreadDetails);

  const readDetails = document.createElement("details");
  readDetails.setAttribute("data-testid", "reading-list-read");
  trackDetails(readDetails, "readingList:read", false);
  setupDropTarget(readDetails, { type: "reading-list-group", hasBeenRead: true });
  const readSummary = document.createElement("summary");
  readSummary.textContent = "Read";
  readDetails.appendChild(readSummary);
  const readUl = document.createElement("ul");
  for (const entry of read) readUl.appendChild(createReadingListLi(entry));
  readDetails.appendChild(readUl);
  section.appendChild(readDetails);
}

function onSettingsChanged(newSettings: UserSettings) {
  applyTheme(newSettings.theme);
  applyLayout(newSettings);
  currentSettings = newSettings;
}

browser.tabs.onCreated.addListener(() => {
  void loadTabs();
});
browser.tabs.onRemoved.addListener(() => {
  void loadTabs();
});
browser.tabs.onUpdated.addListener(() => {
  void loadTabs();
});
browser.tabs.onMoved.addListener(() => {
  void loadTabs();
});
browser.tabs.onActivated.addListener(() => {
  void loadTabs();
});
browser.tabGroups.onCreated.addListener(() => {
  void loadTabs();
});
browser.tabGroups.onUpdated.addListener(() => {
  void loadTabs();
});
browser.tabGroups.onRemoved.addListener(() => {
  void loadTabs();
});

browser.bookmarks.onCreated.addListener(() => {
  void loadBookmarks();
});
browser.bookmarks.onRemoved.addListener(() => {
  void loadBookmarks();
});
browser.bookmarks.onChanged.addListener(() => {
  void loadBookmarks();
});
browser.bookmarks.onMoved.addListener(() => {
  void loadBookmarks();
});

const readingListApi = getReadingListApi();
if (readingListApi) {
  readingListApi.onEntryAdded.addListener(() => void loadReadingList());
  readingListApi.onEntryRemoved.addListener(() => void loadReadingList());
  readingListApi.onEntryUpdated.addListener(() => void loadReadingList());
}

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

  applyTheme(settings.theme);
  applyLayout(settings);

  initDrag(() => void loadTabs());
  detailsState = await loadState();
  await loadBookmarks();
  await loadReadingList();
  await loadTabs();
}

void init();
