import type { SortMode } from "./sort";
import type { Direction } from "./shift";

export type BackgroundMessage =
  | { action: "sortByTitle" }
  | { action: "sortByWebsite" }
  | { action: "sortByLastAccessed" }
  | { action: "moveTabDirection"; direction: Direction };

export type BackgroundResponse =
  | { success: true }
  | { success: false; error: string };

/** Sends a typed message to the background script. Throws if the response carries an error. */
export async function sendToBackground(
  message: BackgroundMessage,
): Promise<void> {
  const response: BackgroundResponse =
    await browser.runtime.sendMessage(message);
  if (!response.success) {
    throw new Error(response.error);
  }
}

export function sortModeToAction(mode: SortMode): BackgroundMessage {
  if (mode === "title") return { action: "sortByTitle" };
  if (mode === "lastAccessed") return { action: "sortByLastAccessed" };
  return { action: "sortByWebsite" };
}
