const SETTINGS_KEY = "userSettings";
const STORAGE_KEY = "detailsState";
const TAB_PREVIEWS_KEY = "tabPreviews";
const TAB_GROUP_ID_NONE = -1;

type Theme = "system" | "light" | "dark";

type DetailsState = Record<string, boolean>;

interface UserSettings {
  theme: Theme;
  bookmarkColumns: number;
  tabColumns: number;
}

interface BookmarkNode {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkNode[];
}

interface BrowserTab {
  id?: number;
  windowId?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  active?: boolean;
  groupId?: number;
  lastAccessed?: number;
}

const defaultSettings: UserSettings = {
  theme: "system",
  bookmarkColumns: 1,
  tabColumns: 1,
};

let detailsState: DetailsState = {};
let currentSettings: UserSettings = defaultSettings;
let mediaQuery: MediaQueryList | null = null;

function loadSettings(): Promise<UserSettings> {
  return browser.storage.local.get(SETTINGS_KEY).then((result) => ({
    ...defaultSettings,
    ...(result[SETTINGS_KEY] as Partial<UserSettings> | undefined),
  }));
}

function saveSettings(settings: UserSettings) {
  return browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

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
  const tabsSection = document.getElementById("tabs-section") as HTMLElement;

  bookmarksSection.style.flex = String(settings.bookmarkColumns);
  tabsSection.style.flex = String(settings.tabColumns);
  bookmarksSection.style.columns = String(settings.bookmarkColumns);
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

    const result = await browser.storage.local.get(TAB_PREVIEWS_KEY);
    const previews =
      (result[TAB_PREVIEWS_KEY] as Record<string, string> | undefined) ?? {};
    const dataUrl = previews[String(tabId)];
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

if (!customElements.get("bookmark-link")) {
  customElements.define("bookmark-link", BookmarkLink);
}

if (!customElements.get("tab-link")) {
  customElements.define("tab-link", TabLink);
}

function renderBookmarkNode(node: BookmarkNode): HTMLElement | null {
  if (node.url) {
    const li = document.createElement("li");
    const link = document.createElement("bookmark-link");
    link.setAttribute("url", node.url);
    link.setAttribute("title", node.title || node.url);
    li.appendChild(link);
    return li;
  }

  if (node.children && node.children.length > 0) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = node.title || "Bookmarks";
    details.appendChild(summary);
    trackDetails(details, `bookmark:${node.id}`, false);

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
  const tree = await browser.bookmarks.getTree();
  const section = document.getElementById("bookmarks-section") as HTMLElement;
  const heading = section.querySelector("h2") as HTMLHeadingElement;
  section.replaceChildren(heading);

  const topFolders: BookmarkNode[] = [];
  for (const root of tree) {
    if (!root.children) {
      continue;
    }

    for (const child of root.children) {
      topFolders.push(child);
    }
  }

  for (const folder of topFolders) {
    const rendered = renderBookmarkNode(folder);
    if (rendered) {
      section.appendChild(rendered);
    }
  }
}

function createTabLi(tab: BrowserTab): HTMLLIElement {
  const li = document.createElement("li");
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
  const windows = await browser.windows.getAll({ populate: true });
  const currentWindow = await browser.windows.getCurrent();
  const groups = await browser.tabGroups.query({});
  const groupMap = new Map(groups.map((group) => [group.id, group]));

  const section = document.getElementById("tabs-section") as HTMLElement;
  const heading = section.querySelector("h2") as HTMLHeadingElement;
  section.replaceChildren(heading);

  windows.sort((a, b) => {
    const lastA = Math.max(
      ...(a.tabs ?? []).map((tab) => tab.lastAccessed ?? 0),
    );
    const lastB = Math.max(
      ...(b.tabs ?? []).map((tab) => tab.lastAccessed ?? 0),
    );
    return lastB - lastA;
  });

  for (const windowRef of windows) {
    const tabs = windowRef.tabs;
    if (!tabs || !windowRef.id) {
      continue;
    }

    const details = document.createElement("details");
    trackDetails(details, `window:${windowRef.id}`, true);

    const activeTab = tabs.find((tab) => tab.active);
    const windowLabel = activeTab
      ? `${activeTab.title} (${tabs.length} tabs)`
      : `Window (${tabs.length} tabs)`;

    const summary = document.createElement("summary");
    summary.textContent = windowLabel;
    if (windowRef.id === currentWindow.id) {
      summary.classList.add("current-window");
    }
    details.appendChild(summary);

    const ul = document.createElement("ul");

    let currentGroupId = TAB_GROUP_ID_NONE;
    let groupUl: HTMLUListElement | null = null;

    for (const tab of tabs) {
      if (tab.groupId !== TAB_GROUP_ID_NONE && tab.groupId !== currentGroupId) {
        const group = groupMap.get(tab.groupId);
        const groupDetails = document.createElement("details");
        const collapsed = group?.collapsed ?? false;
        trackDetails(groupDetails, `tabgroup:${tab.groupId}`, !collapsed);

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

      if (tab.groupId !== TAB_GROUP_ID_NONE) {
        currentGroupId = tab.groupId;
        groupUl?.appendChild(createTabLi(tab));
      } else {
        currentGroupId = TAB_GROUP_ID_NONE;
        groupUl = null;
        ul.appendChild(createTabLi(tab));
      }
    }

    details.appendChild(ul);
    section.appendChild(details);
  }
}

function initSettings(settings: UserSettings) {
  applyTheme(settings.theme);

  const bar = document.getElementById("settings-bar") as HTMLElement;
  const radios = bar.querySelectorAll<HTMLInputElement>('input[name="theme"]');
  radios.forEach((radio) => {
    radio.checked = radio.value === settings.theme;
  });

  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      const theme = radio.value as Theme;
      applyTheme(theme);
      settings.theme = theme;
      void saveSettings(settings);
    });
  });

  const bookmarkSlider = bar.querySelector<HTMLInputElement>(
    'input[name="bookmarkColumns"]',
  );
  const tabSlider = bar.querySelector<HTMLInputElement>(
    'input[name="tabColumns"]',
  );
  const bookmarkValue = document.getElementById("bookmarkColumns-value");
  const tabValue = document.getElementById("tabColumns-value");

  if (!bookmarkSlider || !tabSlider || !bookmarkValue || !tabValue) {
    return;
  }

  bookmarkSlider.value = String(settings.bookmarkColumns);
  tabSlider.value = String(settings.tabColumns);
  bookmarkValue.textContent = String(settings.bookmarkColumns);
  tabValue.textContent = String(settings.tabColumns);

  bookmarkSlider.addEventListener("input", () => {
    const value = Number(bookmarkSlider.value);
    settings.bookmarkColumns = value;
    currentSettings = settings;
    bookmarkValue.textContent = String(value);
    applyLayout(settings);
    void saveSettings(settings);
  });

  tabSlider.addEventListener("input", () => {
    const value = Number(tabSlider.value);
    settings.tabColumns = value;
    currentSettings = settings;
    tabValue.textContent = String(value);
    applyLayout(settings);
    void saveSettings(settings);
  });

  document
    .getElementById("collapse-bookmarks")
    ?.addEventListener("click", () => {
      document
        .querySelectorAll<HTMLDetailsElement>("#bookmarks-section details")
        .forEach((details) => {
          details.open = false;
        });

      for (const key in detailsState) {
        if (key.startsWith("bookmark:")) {
          detailsState[key] = false;
        }
      }

      void saveState(detailsState);
    });

  document.getElementById("collapse-tabs")?.addEventListener("click", () => {
    document
      .querySelectorAll<HTMLDetailsElement>("#tabs-section details")
      .forEach((details) => {
        details.open = false;
      });

    for (const key in detailsState) {
      if (key.startsWith("window:") || key.startsWith("tabgroup:")) {
        detailsState[key] = false;
      }
    }

    void saveState(detailsState);
  });
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

async function init() {
  const settings = await loadSettings();
  currentSettings = settings;
  initSettings(settings);
  applyLayout(settings);

  detailsState = await loadState();
  await loadBookmarks();
  await loadTabs();
}

void init();
