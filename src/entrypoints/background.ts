import type { BackgroundMessage, BackgroundResponse } from "../utils/messages";
import { loadSettings } from "../utils/settings";
import { findCyclicTarget, findGeometricTarget, type Direction } from "../utils/shift";
import {
  sortByLastAccessed,
  sortByTitle,
  sortByWebsite,
  sortTabsByMode,
} from "../utils/sort";

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command === "sort-tabs") {
      const settings = await loadSettings();
      if (settings.tabSortEnabled === false) return;
      await sortTabsByMode(settings.defaultSortMode);
      return;
    }

    if (command.startsWith("move-tab-")) {
      const settings = await loadSettings();
      if (settings.tabShiftEnabled === false) return;
      const direction = command.replace("move-tab-", "") as Direction;
      if (isDirection(direction)) {
        await moveActiveTabToDirection(direction);
      }
    }
  });

  browser.runtime.onMessage.addListener(
    (rawMessage, _sender, sendResponse) => {
      const message = rawMessage as BackgroundMessage;

      (async (): Promise<BackgroundResponse> => {
        const settings = await loadSettings();

        if (message.action === "sortByTitle") {
          if (settings.tabSortEnabled !== false) await sortByTitle();
          return { success: true };
        }

        if (message.action === "sortByWebsite") {
          if (settings.tabSortEnabled !== false) await sortByWebsite();
          return { success: true };
        }

        if (message.action === "sortByLastAccessed") {
          if (settings.tabSortEnabled !== false) await sortByLastAccessed();
          return { success: true };
        }

        if (message.action === "moveTabDirection") {
          if (settings.tabShiftEnabled !== false)
            await moveActiveTabToDirection(message.direction);
          return { success: true };
        }

        return { success: false, error: "Unknown action." };
      })()
        .then(sendResponse)
        .catch((error: unknown) => {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Unknown background action error";
          sendResponse({ success: false, error: errorMessage });
        });

      return true;
    },
  );

});

function isDirection(value: unknown): value is Direction {
  return (
    value === "up" || value === "down" || value === "left" || value === "right"
  );
}

/**
 * Uses geometric targeting (nearest window in direction) for windowed state
 * and cyclic targeting (stable ID-order cycle) for maximized/fullscreen,
 * where screen positions are unreliable.
 */
async function moveActiveTabToDirection(direction: Direction) {
  const currentWindow = await browser.windows.getCurrent({ populate: false });
  if (!currentWindow.id) {
    return;
  }

  const [activeTab] = await browser.tabs.query({
    active: true,
    windowId: currentWindow.id,
  });

  if (!activeTab?.id) {
    return;
  }

  const allWindows = await browser.windows.getAll({ windowTypes: ["normal"] });
  const candidates = allWindows.filter(
    (windowRef) => windowRef.state !== "minimized",
  );
  if (candidates.length <= 1) {
    return;
  }

  const targetWindow =
    currentWindow.state === "maximized" || currentWindow.state === "fullscreen"
      ? findCyclicTarget(candidates, currentWindow.id, direction)
      : findGeometricTarget(candidates, currentWindow, direction);

  if (!targetWindow?.id || targetWindow.id === currentWindow.id) {
    return;
  }

  await browser.tabs.move(activeTab.id, {
    windowId: targetWindow.id,
    index: -1,
  });
  await Promise.all([
    browser.tabs.update(activeTab.id, { active: true }),
    browser.windows.update(targetWindow.id, { focused: true }),
  ]);
}
