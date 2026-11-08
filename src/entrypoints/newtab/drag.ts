export interface ReadingListEntry {
  url: string;
  title: string;
  hasBeenRead: boolean;
  creationTime: number;
}

/**
 * `chrome.readingList` is absent from WXT/browser-types, so we access it
 * via a manual cast and return null when the API is unavailable.
 */
interface ReadingListApi {
  query(filter: object): Promise<ReadingListEntry[]>;
  addEntry(details: { url: string; title: string; hasBeenRead: boolean }): Promise<void>;
  updateEntry(details: { url: string; hasBeenRead: boolean }): Promise<void>;
  onEntryAdded: { addListener(cb: () => void): void };
  onEntryRemoved: { addListener(cb: () => void): void };
  onEntryUpdated: { addListener(cb: () => void): void };
}

export function getReadingListApi(): ReadingListApi | null {
  const g = globalThis as unknown as { chrome?: { readingList?: ReadingListApi } };
  return g.chrome?.readingList ?? null;
}

export interface TabDragData {
  tabId: number;
  sourceWindowId: number;
  sourceGroupId: number;
  url: string;
  title: string;
}

export interface ReadingListDragData {
  url: string;
  title: string;
  hasBeenRead: boolean;
}

export interface BookmarkDragData {
  id: string;
  url: string;
  title: string;
}

const TAB_MIME = "application/x-tab";
const RL_MIME = "application/x-reading-list";
const BM_MIME = "application/x-bookmark";

/**
 * Discriminated union that drives both the copy/move drop effect and the
 * Chrome API calls executed on drop inside `setupDropTarget`.
 */
export type DropTargetConfig =
  | { type: "tab-window"; windowId: number }
  | { type: "tab-group"; windowId: number; groupId: number }
  | { type: "reading-list-group"; hasBeenRead: boolean }
  | { type: "bookmark-folder"; folderId: string };

type DragType = "tab" | "reading-list" | "bookmark";

let activeDragTarget: HTMLDetailsElement | null = null;
let activeDragType: DragType | null = null;
let _reloadTabs: (() => void) | null = null;

/** Must be called once at page load; provides the reload callback invoked after a tab move or group change. */
export function initDrag(reloadTabs: () => void): void {
  _reloadTabs = reloadTabs;
}

function clearDragState(): void {
  activeDragTarget?.classList.remove("drag-over");
  activeDragTarget = null;
  activeDragType = null;
}

function getDragType(types: readonly string[]): DragType | null {
  if (types.includes(TAB_MIME)) return "tab";
  if (types.includes(RL_MIME)) return "reading-list";
  if (types.includes(BM_MIME)) return "bookmark";
  return null;
}

/**
 * Same-section drops (bookmark→folder, reading-list→reading-list group) use move
 * semantics; all cross-section drops copy (open new tab, create bookmark, etc.).
 */
function isMoveSemantics(config: DropTargetConfig, dragType: DragType): boolean {
  if (config.type === "bookmark-folder" && dragType === "bookmark") return true;
  if (config.type === "reading-list-group" && dragType === "reading-list") return true;
  return false;
}

async function applyTabDrop(
  data: TabDragData,
  windowId: number,
  groupId?: number,
): Promise<void> {
  const crossWindow = data.sourceWindowId !== windowId;
  const targetGroup = groupId ?? browser.tabGroups.TAB_GROUP_ID_NONE;
  if (!crossWindow && data.sourceGroupId === targetGroup) return;

  if (crossWindow) {
    await browser.tabs.move(data.tabId, { windowId, index: -1 });
  }

  if (targetGroup !== browser.tabGroups.TAB_GROUP_ID_NONE) {
    await browser.tabs.group({ tabIds: [data.tabId], groupId: targetGroup });
  } else if (
    !crossWindow &&
    data.sourceGroupId !== browser.tabGroups.TAB_GROUP_ID_NONE
  ) {
    await browser.tabs.ungroup([data.tabId]);
  }
  _reloadTabs?.();
}

async function openNewTab(
  url: string,
  windowId: number,
  groupId?: number,
): Promise<void> {
  const tab = await browser.tabs.create({ url, windowId, active: false });
  if (groupId !== undefined && tab.id !== undefined) {
    await browser.tabs.group({ tabIds: [tab.id], groupId });
  }
}

/**
 * Shows the shared modal `<dialog>` and resolves `true` only when the user picks OK.
 * Esc closes it with `returnValue` "" (cancel). Without Cancel it acts as an alert.
 */
function showDialog(message: string, withCancel: boolean): Promise<boolean> {
  const dialog = document.getElementById("confirm-dialog") as HTMLDialogElement;
  const cancel = document.getElementById("confirm-dialog-cancel") as HTMLButtonElement;
  const ok = document.getElementById("confirm-dialog-ok") as HTMLButtonElement;
  (document.getElementById("confirm-dialog-message") as HTMLElement).textContent = message;
  cancel.hidden = !withCancel;
  ok.autofocus = !withCancel;
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        resolve(dialog.returnValue === "ok");
        dialog.returnValue = "";
      },
      { once: true },
    );
    dialog.showModal();
  });
}

function confirmAddAsRead(title: string): Promise<boolean> {
  return showDialog(`Are you sure you want to add "${title}" to the Reading List as Read?`, true);
}

async function addToReadingList(
  url: string,
  title: string,
  hasBeenRead: boolean,
): Promise<void> {
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    await showDialog(`"${title || url}" cannot be added to the Reading List.`, false);
    return;
  }
  if (hasBeenRead && !(await confirmAddAsRead(title || url))) {
    return;
  }
  void getReadingListApi()?.addEntry({ url, title, hasBeenRead });
}

function makeDraggable(li: HTMLLIElement, mime: string, payload: object): void {
  li.draggable = true;
  li.addEventListener("dragstart", (e) => {
    if (e.dataTransfer) {
      e.dataTransfer.setData(mime, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "all";
    }
  });
  li.addEventListener("dragend", clearDragState);
}

export function makeTabDraggable(li: HTMLLIElement, data: TabDragData): void {
  makeDraggable(li, TAB_MIME, data);
}

export function makeReadingListDraggable(
  li: HTMLLIElement,
  data: ReadingListDragData,
): void {
  makeDraggable(li, RL_MIME, data);
}

export function makeBookmarkDraggable(
  li: HTMLLIElement,
  data: BookmarkDragData,
): void {
  makeDraggable(li, BM_MIME, data);
}

/**
 * Executes the drop action for a given DataTransfer and destination config.
 * All 12 policy paths (3 drag types × 4 destination configs) live here.
 * Adding a new destination means adding one branch; event wiring is unaffected.
 */
function executeDrop(dt: DataTransfer, config: DropTargetConfig): void {
  const dragType = getDragType(dt.types);
  if (!dragType) return;

  if (config.type === "tab-window" || config.type === "tab-group") {
    const { windowId } = config;
    const groupId = config.type === "tab-group" ? config.groupId : undefined;
    if (dragType === "tab") {
      void applyTabDrop(JSON.parse(dt.getData(TAB_MIME)) as TabDragData, windowId, groupId);
    } else if (dragType === "reading-list") {
      void openNewTab((JSON.parse(dt.getData(RL_MIME)) as ReadingListDragData).url, windowId, groupId);
    } else if (dragType === "bookmark") {
      void openNewTab((JSON.parse(dt.getData(BM_MIME)) as BookmarkDragData).url, windowId, groupId);
    }
  } else if (config.type === "reading-list-group") {
    if (dragType === "reading-list") {
      const data = JSON.parse(dt.getData(RL_MIME)) as ReadingListDragData;
      if (data.hasBeenRead === config.hasBeenRead) return;
      if (!config.hasBeenRead) {
        void getReadingListApi()?.updateEntry({ url: data.url, hasBeenRead: false });
        return;
      }
      void confirmAddAsRead(data.title || data.url).then((ok) => {
        if (ok) void getReadingListApi()?.updateEntry({ url: data.url, hasBeenRead: true });
      });
    } else if (dragType === "tab") {
      const data = JSON.parse(dt.getData(TAB_MIME)) as TabDragData;
      void addToReadingList(data.url, data.title, config.hasBeenRead);
    } else if (dragType === "bookmark") {
      const data = JSON.parse(dt.getData(BM_MIME)) as BookmarkDragData;
      void addToReadingList(data.url, data.title, config.hasBeenRead);
    }
  } else if (config.type === "bookmark-folder") {
    if (dragType === "bookmark") {
      const data = JSON.parse(dt.getData(BM_MIME)) as BookmarkDragData;
      void browser.bookmarks.move(data.id, { parentId: config.folderId });
    } else if (dragType === "reading-list") {
      const data = JSON.parse(dt.getData(RL_MIME)) as ReadingListDragData;
      void browser.bookmarks.create({ parentId: config.folderId, url: data.url, title: data.title || data.url });
    } else if (dragType === "tab") {
      const data = JSON.parse(dt.getData(TAB_MIME)) as TabDragData;
      void browser.bookmarks.create({ parentId: config.folderId, url: data.url, title: data.title || data.url });
    }
  }
}

/**
 * Attaches dragenter/dragover/dragleave/drop handlers to a `<details>` element.
 * Only one target is "active" at a time via module-level state to prevent
 * spurious dragleave events from nested child elements triggering a false leave.
 * Drop execution is delegated to executeDrop().
 */
export function setupDropTarget(
  details: HTMLDetailsElement,
  config: DropTargetConfig,
): void {
  details.addEventListener("dragenter", (e) => {
    const dragType = getDragType(e.dataTransfer?.types ?? []);
    if (!dragType) return;
    e.preventDefault();
    e.stopPropagation();
    if (activeDragTarget !== details) {
      activeDragTarget?.classList.remove("drag-over");
      activeDragTarget = details;
      activeDragType = dragType;
      details.classList.add("drag-over");
    }
  });

  details.addEventListener("dragover", (e) => {
    if (activeDragTarget !== details || !activeDragType) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = isMoveSemantics(config, activeDragType) ? "move" : "copy";
    }
  });

  details.addEventListener("dragleave", (e) => {
    e.stopPropagation();
    if (!details.contains(e.relatedTarget as Node)) {
      details.classList.remove("drag-over");
      if (activeDragTarget === details) {
        activeDragTarget = null;
        activeDragType = null;
      }
    }
  });

  details.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    details.classList.remove("drag-over");
    if (activeDragTarget === details) {
      activeDragTarget = null;
      activeDragType = null;
    }
    if (e.dataTransfer) executeDrop(e.dataTransfer, config);
  });
}
