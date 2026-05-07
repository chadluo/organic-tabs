export {};

import {
  defaultSettings,
  loadSettings,
  saveSettings,
  type Direction,
  type SortMode,
  type Theme,
  type UserSettings,
} from "../../utils/settings";
import { sendToBackground, sortModeToAction } from "../../utils/messages";

let settings = { ...defaultSettings };

async function updateSettings(patch: Partial<UserSettings>) {
  settings = { ...settings, ...patch };
  await saveSettings(settings);
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

  const bookmarksAndListsCols = document.getElementById(
    "bookmarks-and-lists-columns"
  ) as HTMLInputElement;
  bookmarksAndListsCols.value = String(s.bookmarksAndListsColumns);
  document.getElementById("bookmarks-and-lists-columns-value")!.textContent =
    String(s.bookmarksAndListsColumns);

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

  for (const [name, id] of [
    ["move-tab-up", "shift-up-shortcut"],
    ["move-tab-down", "shift-down-shortcut"],
    ["move-tab-left", "shift-left-shortcut"],
    ["move-tab-right", "shift-right-shortcut"],
  ] as const) {
    const cmd = commands.find((c) => c.name === name);
    if (cmd?.shortcut) {
      document.getElementById(id)!.textContent = cmd.shortcut;
    }
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

  const bookmarksAndListsCols = document.getElementById(
    "bookmarks-and-lists-columns"
  ) as HTMLInputElement;
  bookmarksAndListsCols.addEventListener("input", () => {
    document.getElementById("bookmarks-and-lists-columns-value")!.textContent =
      bookmarksAndListsCols.value;
    void updateSettings({ bookmarksAndListsColumns: Number(bookmarksAndListsCols.value) });
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
      await sendToBackground(sortModeToAction(mode));
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
      await sendToBackground({ action: "moveTabDirection", direction });
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
