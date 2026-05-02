export {};

type SortMode = "title" | "website" | "lastAccessed";
type Theme = "system" | "light" | "dark";
type Direction = "up" | "down" | "left" | "right";

const SETTINGS_KEY = "userSettings";

interface UserSettings {
  theme: Theme;
  bookmarkColumns: number;
  tabColumns: number;
  defaultSortMode: SortMode;
  newTabEnabled: boolean;
  tabSortEnabled: boolean;
  tabShiftEnabled: boolean;
}

const defaultSettings: UserSettings = {
  theme: "system",
  bookmarkColumns: 1,
  tabColumns: 1,
  defaultSortMode: "website",
  newTabEnabled: true,
  tabSortEnabled: true,
  tabShiftEnabled: true,
};

let settings = { ...defaultSettings };

async function loadSettings(): Promise<UserSettings> {
  const data = await browser.storage.local.get(SETTINGS_KEY);
  return {
    ...defaultSettings,
    ...(data[SETTINGS_KEY] as Partial<UserSettings> | undefined),
  };
}

async function updateSettings(patch: Partial<UserSettings>) {
  settings = { ...settings, ...patch };
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

async function sendBackgroundAction(message: Record<string, unknown>) {
  const response = await browser.runtime.sendMessage(message);
  if (!response?.success) {
    throw new Error(response?.error ?? "Background action failed.");
  }
}

function actionToMessage(mode: SortMode): string {
  if (mode === "title") return "sortByTitle";
  if (mode === "lastAccessed") return "sortByLastAccessed";
  return "sortByWebsite";
}

function setStatus(el: HTMLElement, text: string) {
  el.textContent = text;
  el.className =
    "status " + (text.startsWith("Error") ? "status-error" : "status-info");
  el.hidden = !text;
}

function applySettings(s: UserSettings) {
  const newtabEnabled = document.getElementById(
    "newtab-enabled"
  ) as HTMLInputElement;
  newtabEnabled.checked = s.newTabEnabled;
  document.getElementById("newtab-sub")!.hidden = !s.newTabEnabled;

  document
    .querySelectorAll<HTMLInputElement>('input[name="theme"]')
    .forEach((r) => (r.checked = r.value === s.theme));

  const bookmarkCols = document.getElementById(
    "bookmark-columns"
  ) as HTMLInputElement;
  bookmarkCols.value = String(s.bookmarkColumns);
  document.getElementById("bookmark-columns-value")!.textContent = String(
    s.bookmarkColumns
  );

  const tabCols = document.getElementById("tab-columns") as HTMLInputElement;
  tabCols.value = String(s.tabColumns);
  document.getElementById("tab-columns-value")!.textContent = String(
    s.tabColumns
  );

  const sortEnabled = document.getElementById(
    "sort-enabled"
  ) as HTMLInputElement;
  sortEnabled.checked = s.tabSortEnabled;
  document.getElementById("sort-sub")!.hidden = !s.tabSortEnabled;

  document
    .querySelectorAll<HTMLInputElement>('input[name="default-sort"]')
    .forEach((r) => (r.checked = r.value === s.defaultSortMode));

  const shiftEnabled = document.getElementById(
    "shift-enabled"
  ) as HTMLInputElement;
  shiftEnabled.checked = s.tabShiftEnabled;
  document.getElementById("shift-sub")!.hidden = !s.tabShiftEnabled;
}

async function init() {
  settings = await loadSettings();
  applySettings(settings);

  const commands = await browser.commands.getAll();
  const sortCmd = commands.find((c) => c.name === "sort-tabs");
  if (sortCmd?.shortcut) {
    document.getElementById(
      "sort-shortcut"
    )!.textContent = `${sortCmd.shortcut}: Sort using default order`;
  }

  document
    .getElementById("newtab-enabled")!
    .addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      document.getElementById("newtab-sub")!.hidden = !checked;
      void updateSettings({ newTabEnabled: checked });
    });

  document
    .querySelectorAll<HTMLInputElement>('input[name="theme"]')
    .forEach((radio) => {
      radio.addEventListener("change", () =>
        void updateSettings({ theme: radio.value as Theme })
      );
    });

  const bookmarkCols = document.getElementById(
    "bookmark-columns"
  ) as HTMLInputElement;
  bookmarkCols.addEventListener("input", () => {
    document.getElementById("bookmark-columns-value")!.textContent =
      bookmarkCols.value;
    void updateSettings({ bookmarkColumns: Number(bookmarkCols.value) });
  });

  const tabCols = document.getElementById("tab-columns") as HTMLInputElement;
  tabCols.addEventListener("input", () => {
    document.getElementById("tab-columns-value")!.textContent = tabCols.value;
    void updateSettings({ tabColumns: Number(tabCols.value) });
  });

  document.getElementById("sort-enabled")!.addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    document.getElementById("sort-sub")!.hidden = !checked;
    void updateSettings({ tabSortEnabled: checked });
  });

  document
    .querySelectorAll<HTMLInputElement>('input[name="default-sort"]')
    .forEach((radio) => {
      radio.addEventListener("change", () =>
        void updateSettings({ defaultSortMode: radio.value as SortMode })
      );
    });

  const sortStatus = document.getElementById("sort-status") as HTMLElement;

  async function runSort(mode: SortMode) {
    const label = mode === "lastAccessed" ? "last accessed" : mode;
    setStatus(sortStatus, `Sorting by ${label}…`);
    try {
      await sendBackgroundAction({ action: actionToMessage(mode) });
      setStatus(sortStatus, `Sorted by ${label}.`);
    } catch {
      setStatus(sortStatus, "Error: failed to sort tabs.");
    }
  }

  document
    .getElementById("sort-title")!
    .addEventListener("click", () => void runSort("title"));
  document
    .getElementById("sort-website")!
    .addEventListener("click", () => void runSort("website"));
  document
    .getElementById("sort-last-accessed")!
    .addEventListener("click", () => void runSort("lastAccessed"));

  document.getElementById("shift-enabled")!.addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    document.getElementById("shift-sub")!.hidden = !checked;
    void updateSettings({ tabShiftEnabled: checked });
  });

  const shiftStatus = document.getElementById("shift-status") as HTMLElement;

  async function moveTab(direction: Direction) {
    setStatus(shiftStatus, `Moving tab ${direction}…`);
    try {
      await sendBackgroundAction({ action: "moveTabDirection", direction });
      setStatus(shiftStatus, `Moved tab ${direction}.`);
    } catch {
      setStatus(shiftStatus, "Error: failed to move tab.");
    }
  }

  document
    .getElementById("shift-up")!
    .addEventListener("click", () => void moveTab("up"));
  document
    .getElementById("shift-down")!
    .addEventListener("click", () => void moveTab("down"));
  document
    .getElementById("shift-left")!
    .addEventListener("click", () => void moveTab("left"));
  document
    .getElementById("shift-right")!
    .addEventListener("click", () => void moveTab("right"));
}

void init();
