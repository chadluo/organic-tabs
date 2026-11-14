import { type BookmarkNode } from "../../utils/catalog";
import { makeBookmarkDraggable } from "./drag";
import { setSoftWrappingTitle, populateLink, emptyState } from "./linkUtils";

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

if (!customElements.get("bookmark-link")) {
  customElements.define("bookmark-link", BookmarkLink);
}

/**
 * Renders a bookmark tree into a DocumentFragment.
 * Sets `details.open` from detailsState and attaches `data-state-key` for
 * post-render toggle wiring. Does not attach drop targets.
 */
export function renderBookmarks(
  nodes: BookmarkNode[],
  detailsState: Record<string, boolean>,
): DocumentFragment {
  function renderNode(node: BookmarkNode): HTMLElement | null {
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
      const key = `bookmark:${node.id}`;
      const details = document.createElement("details");
      details.setAttribute("data-testid", "bookmark-folder");
      details.setAttribute("data-folder-id", node.id);
      details.setAttribute("data-state-key", key);
      details.open = detailsState[key] ?? false;
      const summary = document.createElement("summary");
      summary.textContent = node.title || "Bookmarks";
      details.appendChild(summary);
      const ul = document.createElement("ul");
      for (const child of node.children) {
        const rendered = renderNode(child);
        if (rendered) ul.appendChild(rendered);
      }
      details.appendChild(ul);
      return details;
    }

    return null;
  }

  const fragment = document.createDocumentFragment();
  for (const folder of nodes) {
    const rendered = renderNode(folder);
    if (rendered) fragment.appendChild(rendered);
  }
  if (!fragment.hasChildNodes()) fragment.appendChild(emptyState("No bookmarks yet."));
  return fragment;
}
