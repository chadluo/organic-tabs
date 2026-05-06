export interface ReadingListEntry {
  url: string;
  title: string;
  hasBeenRead: boolean;
  creationTime: number;
}

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

export type DropTargetConfig =
  | { type: "tab-window"; windowId: number }
  | { type: "tab-group"; windowId: number; groupId: number }
  | { type: "reading-list-group"; hasBeenRead: boolean }
  | { type: "bookmark-folder"; folderId: string };

type DragType = "tab" | "reading-list" | "bookmark";

let activeDragTarget: HTMLDetailsElement | null = null;
let activeDragType: DragType | null = null;
let _reloadTabs: (() => void) | null = null;

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

async function addToReadingList(
  url: string,
  title: string,
  hasBeenRead: boolean,
): Promise<void> {
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    window.alert(`"${title || url}" cannot be added to the Reading List.`);
    return;
  }
  if (
    hasBeenRead &&
    !window.confirm(
      `Are you sure you want to add "${title || url}" to the Reading List as Read?`,
    )
  ) {
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

    const dt = e.dataTransfer;
    if (!dt) return;
    const dragType = getDragType(dt.types);
    if (!dragType) return;

    if (config.type === "tab-window" || config.type === "tab-group") {
      const { windowId } = config;
      const groupId = config.type === "tab-group" ? config.groupId : undefined;
      if (dragType === "tab") {
        void applyTabDrop(
          JSON.parse(dt.getData(TAB_MIME)) as TabDragData,
          windowId,
          groupId,
        );
      } else if (dragType === "reading-list") {
        void openNewTab(
          (JSON.parse(dt.getData(RL_MIME)) as ReadingListDragData).url,
          windowId,
          groupId,
        );
      } else if (dragType === "bookmark") {
        void openNewTab(
          (JSON.parse(dt.getData(BM_MIME)) as BookmarkDragData).url,
          windowId,
          groupId,
        );
      }
    } else if (config.type === "reading-list-group") {
      if (dragType === "reading-list") {
        const data = JSON.parse(dt.getData(RL_MIME)) as ReadingListDragData;
        if (data.hasBeenRead === config.hasBeenRead) return;
        if (
          config.hasBeenRead &&
          !window.confirm(
            `Are you sure you want to add "${data.title || data.url}" to the Reading List as Read?`,
          )
        ) {
          return;
        }
        void getReadingListApi()?.updateEntry({
          url: data.url,
          hasBeenRead: config.hasBeenRead,
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
        void browser.bookmarks.create({
          parentId: config.folderId,
          url: data.url,
          title: data.title || data.url,
        });
      } else if (dragType === "tab") {
        const data = JSON.parse(dt.getData(TAB_MIME)) as TabDragData;
        void browser.bookmarks.create({
          parentId: config.folderId,
          url: data.url,
          title: data.title || data.url,
        });
      }
    }
  });
}
