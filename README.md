# Organic Tabs

[Source](https://github.com/chadluo/organic-tabs) &middot; [Chrome Web Store](https://chromewebstore.google.com/detail/organic-tabs/bmpakdlejickdodgdkjeplhobgaakogh)

Single Chrome extension that combines:

- Organic New Tab Page (bookmarks + open tabs dashboard)
- Organic Tab Sorter (sort by title, website, or last accessed)
- Organic Tab Shifter (move active tab to another window by direction)

Built with WXT + React.

## Features

- New tab override (`entrypoints/newtab`) with:
  - Bookmarks tree and open tabs grouped by window/tab group
  - Persisted collapse state
  - Theme selection (system/light/dark)
  - Adjustable bookmark/tab layout columns
  - Tab previews shown on hover (captured in background)
- Popup UI (`entrypoints/popup`) with:
  - Manual sort actions
  - Default sort preference
  - Manual directional tab shifting
- Keyboard shortcuts:
  - `Alt+Shift+S` sort tabs using default sort mode
  - `Alt+Shift+Up` move tab up
  - `Alt+Shift+Down` move tab down
  - `Alt+Shift+Left` move tab left
  - `Alt+Shift+Right` move tab right

## Development

Install dependencies and run dev mode:

```bash
pnpm install
pnpm dev
```

Build for production:

```bash
pnpm build
```

Icon: [Irasutoya](https://www.irasutoya.com/2016/11/blog-post_195.html)
