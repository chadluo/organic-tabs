import { StorageEntry } from "./storage";

type TabPreviews = Record<string, string>;

const previewsEntry = new StorageEntry<TabPreviews>("tabPreviews");

export async function storePreview(tabId: number, dataUrl: string): Promise<void> {
  await previewsEntry.update((current) => ({
    ...(current ?? {}),
    [String(tabId)]: dataUrl,
  }));
}

export async function retrievePreview(tabId: number): Promise<string | undefined> {
  return (await previewsEntry.get())?.[String(tabId)];
}

export async function evictPreview(tabId: number): Promise<void> {
  await previewsEntry.update((current) => {
    const next = { ...(current ?? {}) };
    delete next[String(tabId)];
    return next;
  });
}
