export function faviconUrl(pageUrl: string): string {
  if (!pageUrl) {
    return "";
  }
  const encoded = encodeURIComponent(pageUrl);
  return `chrome-extension://${browser.runtime.id}/_favicon/?pageUrl=${encoded}&size=16`;
}

export function hostname(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return "";
  }
}

export function setSoftWrappingTitle(el: HTMLElement, title: string): void {
  const parts = title.split("/");
  el.appendChild(document.createTextNode(parts[0] ?? ""));
  for (let i = 1; i < parts.length; i += 1) {
    el.appendChild(document.createElement("wbr"));
    el.appendChild(document.createTextNode(`/${parts[i]}`));
  }
}

export function populateLink(
  content: DocumentFragment,
  url: string,
  faviconOverride = "",
): void {
  const img = content.querySelector(".favicon") as HTMLImageElement;
  const host = content.querySelector(".hostname") as HTMLSpanElement;
  const anchor = content.querySelector(".link") as HTMLAnchorElement;

  img.src = faviconOverride || faviconUrl(url);
  host.textContent = hostname(url);
  if (!anchor.textContent) {
    setSoftWrappingTitle(anchor, url);
  }
}

/** A muted one-line note shown in place of an empty list. */
export function emptyState(text: string): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = text;
  return p;
}
