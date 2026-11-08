import { type TabCatalog, type CatalogTab } from "../../utils/catalog";
import { makeTabDraggable, type TabDragData } from "./drag";
import { setSoftWrappingTitle, populateLink } from "./linkUtils";

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
    if (url) anchor.href = url;
    anchor.addEventListener("click", (event) => {
      // Modified clicks keep the browser default (open the URL in a new tab or window).
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      void browser.tabs.update(tabId, { active: true });
      void browser.windows.update(windowId, { focused: true });
    });

    const faviconOverride = this.getAttribute("favicon") ?? "";
    populateLink(content, url, faviconOverride);
    this.appendChild(content);

    this.addEventListener("mouseenter", () => {
      document
        .querySelectorAll(`tab-link[url="${CSS.escape(url)}"]`)
        .forEach((el) => {
          if (el !== this) el.classList.add("duplicate-highlight");
        });
    });

    this.addEventListener("mouseleave", () => {
      document
        .querySelectorAll(".duplicate-highlight")
        .forEach((el) => el.classList.remove("duplicate-highlight"));
    });
  }


}

if (!customElements.get("tab-link")) {
  customElements.define("tab-link", TabLink);
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

/**
 * Renders all Windows and their Tab Groups into a DocumentFragment.
 * Sets `details.open` from detailsState and attaches `data-state-key`,
 * `data-window-id`, and `data-group-id` for post-render wiring.
 * Does not attach drop targets or sort button click handlers.
 */
export function renderTabs(
  catalog: TabCatalog,
  detailsState: Record<string, boolean>,
): DocumentFragment {
  const fragment = document.createDocumentFragment();

  for (const [index, windowRef] of catalog.windows.entries()) {
    const windowKey = `window:${windowRef.id}`;
    const details = document.createElement("details");
    details.setAttribute("data-testid", "tab-window");
    details.setAttribute("data-window-id", String(windowRef.id));
    details.setAttribute("data-state-key", windowKey);
    details.open = detailsState[windowKey] ?? true;

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
    sortBtn.type = "button";
    sortBtn.className = "sort-btn";
    sortBtn.textContent = "⇅";
    sortBtn.setAttribute("data-window-id", String(windowRef.id));
    sortBtn.setAttribute("aria-label", `Sort tabs in window ${index + 1}: ${windowLabel}`);

    details.appendChild(summary);

    const ul = document.createElement("ul");
    let currentGroupId: number = browser.tabGroups.TAB_GROUP_ID_NONE;
    let groupUl: HTMLUListElement | null = null;

    for (const tab of windowRef.tabs) {
      const tabGroupId = tab.groupId ?? browser.tabGroups.TAB_GROUP_ID_NONE;
      if (tabGroupId !== browser.tabGroups.TAB_GROUP_ID_NONE && tabGroupId !== currentGroupId) {
        const group = catalog.groups.get(tabGroupId);
        const groupKey = `tabgroup:${tabGroupId}`;
        const groupDetails = document.createElement("details");
        groupDetails.setAttribute("data-testid", "tab-group");
        groupDetails.setAttribute("data-group-id", String(tabGroupId));
        groupDetails.setAttribute("data-window-id", String(windowRef.id));
        groupDetails.setAttribute("data-state-key", groupKey);
        const collapsed = group?.collapsed ?? false;
        groupDetails.open = detailsState[groupKey] ?? !collapsed;

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
    // The sort button stays outside <details>: inside <summary> it is interactive
    // content with unreliable semantics, and after <summary> it hides when closed.
    const windowRow = document.createElement("div");
    windowRow.className = "tab-window";
    windowRow.append(details, sortBtn);
    fragment.appendChild(windowRow);
  }

  return fragment;
}
