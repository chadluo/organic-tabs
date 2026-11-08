import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  // Keep light-dark() native: the Lightning CSS fallback ignores inline style.colorScheme.
  vite: () => ({ build: { cssTarget: ["chrome123", "firefox120"] } }),
  manifest: {
    name: "Organic Tabs",
    description: "Unified new tab page, tab sorter, and tab shifter extension.",
    icons: {
      '48': 'icon/48.png',
      '128': 'icon/128.png'
    },
    version: "1.0.1",
    permissions: [
      "bookmarks",
      "favicon",
      "readingList",
      "storage",
      "tabGroups",
      "tabs",
      "windows",
    ],

    commands: {
      "sort-tabs": {
        description: "Sort tabs using the default sort order",
        suggested_key: {
          default: "Alt+Shift+S",
          mac: "Alt+Shift+S",
        },
      },
      "move-tab-up": {
        description: "Move current tab to the window above",
        suggested_key: {
          default: "Alt+Shift+Up",
        },
      },
      "move-tab-down": {
        description: "Move current tab to the window below",
        suggested_key: {
          default: "Alt+Shift+Down",
        },
      },
      "move-tab-left": {
        description: "Move current tab to the window on the left",
        suggested_key: {
          default: "Alt+Shift+Left",
        },
      },
      "move-tab-right": {
        description: "Move current tab to the window on the right",
      },
    },
  },
});
