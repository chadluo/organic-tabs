import { type ReadingListEntry, makeReadingListDraggable } from "./drag";
import { setSoftWrappingTitle, populateLink } from "./linkUtils";

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

if (!customElements.get("reading-list-link")) {
  customElements.define("reading-list-link", ReadingListLink);
}

function createEntryLi(entry: ReadingListEntry): HTMLLIElement {
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

/**
 * Renders Reading List entries into a DocumentFragment with Unread and Read
 * `<details>` groups. Sets `details.open` from detailsState and attaches
 * `data-state-key` for post-render toggle wiring. Does not attach drop targets.
 */
export function renderReadingList(
  entries: ReadingListEntry[],
  detailsState: Record<string, boolean>,
): DocumentFragment {
  const unread = entries.filter((e) => !e.hasBeenRead);
  const read = entries.filter((e) => e.hasBeenRead);

  const unreadDetails = document.createElement("details");
  unreadDetails.setAttribute("data-testid", "reading-list-unread");
  unreadDetails.setAttribute("data-state-key", "readingList:unread");
  unreadDetails.open = detailsState["readingList:unread"] ?? true;
  const unreadSummary = document.createElement("summary");
  unreadSummary.textContent = "Unread";
  unreadDetails.appendChild(unreadSummary);
  const unreadUl = document.createElement("ul");
  for (const entry of unread) unreadUl.appendChild(createEntryLi(entry));
  unreadDetails.appendChild(unreadUl);

  const readDetails = document.createElement("details");
  readDetails.setAttribute("data-testid", "reading-list-read");
  readDetails.setAttribute("data-state-key", "readingList:read");
  readDetails.open = detailsState["readingList:read"] ?? false;
  const readSummary = document.createElement("summary");
  readSummary.textContent = "Read";
  readDetails.appendChild(readSummary);
  const readUl = document.createElement("ul");
  for (const entry of read) readUl.appendChild(createEntryLi(entry));
  readDetails.appendChild(readUl);

  const fragment = document.createDocumentFragment();
  fragment.appendChild(unreadDetails);
  fragment.appendChild(readDetails);
  return fragment;
}
