# Privacy Policy — Organic Tabs

**Effective date:** 2026-09-30

## Summary

Organic Tabs does not collect, transmit, or share any personal data. All information the extension reads or writes stays on your device.

---

## What the extension accesses

To display your bookmarks, reading list, and open tabs in a unified new-tab view, the extension reads the following browser data:

| Data | Why |
| --- | --- |
| Bookmarks (titles, URLs, folder structure) | Render the Bookmarks section; support drag-to-reorganize |
| Reading list entries (titles, URLs, read status) | Render the Reading List section; support drag-to-add |
| Tabs (titles, URLs, last-access time, active state) | Render the Open Tabs section |
| Tab groups (name, colour) | Render groups nested inside windows |
| Browser windows | Render one collapsible panel per window |
| Favicons | Display site icons next to links |

---

## Settings and UI state

Your preferences (theme, column layout, sort mode, and the on/off switches for the new tab page, tab sorting, and tab shifting) and section collapse/expand state are stored in `chrome.storage.local`. This data never leaves your device and is not synced to your browser account.

Custom new-tab titles that you set for a window are stored in `chrome.storage.session`. The browser deletes this data when it restarts.

---

## Keyboard shortcuts

The extension registers shortcuts to sort tabs and to move the current tab to a neighbouring window. The browser handles the key presses. The extension does not record keystrokes. The popup reads the shortcut list from the browser to display it.

---

## What the extension does not do

- Does not send any data to external servers
- Does not use analytics or tracking
- Does not store data in `chrome.storage.sync` or any cloud service
- Does not inject scripts into web pages
- Does not read page content

---

## Permissions explained

| Permission | Purpose |
| --- | --- |
| `bookmarks` | Read and write bookmarks for the Bookmarks section and drag operations |
| `readingList` | Read and write reading list entries |
| `tabs` | Read open tabs; open or activate tabs |
| `tabGroups` | Read and reorganise tab groups |
| `windows` | Read browser windows; focus or move windows |
| `storage` | Persist settings and UI state locally |
| `favicon` | Retrieve site favicons via the browser's built-in favicon service |
