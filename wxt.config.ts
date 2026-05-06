import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  manifest: {
    name: "Organic Tabs",
    description: "Unified new tab page, tab sorter, and tab shifter extension.",
    version: "1.0.0",
    permissions: [
      "bookmarks",
      "favicon",
      "readingList",
      "storage",
      "tabGroups",
      "tabs",
      "windows",
    ],
    host_permissions: ["<all_urls>"],
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
