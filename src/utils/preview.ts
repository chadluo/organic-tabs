type TabPreviews = Record<string, string>;

const PREVIEWS_KEY = "tabPreviews";

export async function storePreview(tabId: number, dataUrl: string): Promise<void> {
  const result = await browser.storage.local.get(PREVIEWS_KEY);
  const previews = (result[PREVIEWS_KEY] as TabPreviews | undefined) ?? {};
  previews[String(tabId)] = dataUrl;
  await browser.storage.local.set({ [PREVIEWS_KEY]: previews });
}

export async function retrievePreview(tabId: number): Promise<string | undefined> {
  const result = await browser.storage.local.get(PREVIEWS_KEY);
  const previews = (result[PREVIEWS_KEY] as TabPreviews | undefined) ?? {};
  return previews[String(tabId)];
}

export async function evictPreview(tabId: number): Promise<void> {
  const result = await browser.storage.local.get(PREVIEWS_KEY);
  const previews = (result[PREVIEWS_KEY] as TabPreviews | undefined) ?? {};
  delete previews[String(tabId)];
  await browser.storage.local.set({ [PREVIEWS_KEY]: previews });
}
