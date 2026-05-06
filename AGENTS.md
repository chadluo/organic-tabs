<!-- markdownlint-disable no-inline-html -->

# Organic Tabs

Browser extension built with the [WXT framework](https://wxt.dev/) and vanilla TypeScript (no UI framework).

## Project map

- `src/entrypoints/newtab/` - New tab page: bookmarks, reading list, open tabs; `drag.ts` handles cross-section
  drag-and-drop
- `src/entrypoints/popup/` - Extension popup UI
- `src/entrypoints/background.ts` - Background service worker
- `src/utils/` - Shared utilities: catalog (tab data types + fetching), preview (screenshot cache), messaging, settings,
  tab sort, tab shift
- `public/` - Static assets bundled into the extension
- `.wxt/` - WXT-generated types and config (do not edit)
- `.output/` - Build output (do not edit)

<important if="you are adding or updating complicated logic">
- also add or update jsDoc on critical data structure and function declarations, keep them up-to-date
</important>

<important if="you need to run commands to build, develop, or package the extension">

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start Chrome dev server with HMR |
| `pnpm dev:firefox` | Start Firefox dev server |
| `pnpm build` | Build for Chrome |
| `pnpm build:firefox` | Build for Firefox |
| `pnpm zip` | Package Chrome extension as zip |
| `pnpm zip:firefox` | Package Firefox extension as zip |
| `pnpm compile` | TypeScript type-check only (no emit) |

If shell reports command not found, try running with mise, for example `mise exec -- pnpm build`.
</important>

<important if="you are adding messaging between entrypoints or background">
- Message types are defined in `src/utils/messages.ts` — add new message types there
- Use the typed protocol from that file; do not use untyped `chrome.runtime.sendMessage` calls
</important>

<important if="you are working on tab sorting logic">
- Sort logic lives in `src/utils/sort.ts`
- Supported sort keys: title, URL, last access time
</important>

<important if="you are working on tab shifting between windows">
- Shift logic lives in `src/utils/shift.ts`
- Tabs move between windows based on desktop window arrangement
</important>

<important if="you are reading or writing extension settings">
- Settings helpers are in `src/utils/settings.ts`
</important>

<important if="you are adding a new entrypoint (page, popup, content script, or background)">
- Follow WXT entrypoint conventions: add under `src/entrypoints/` with the appropriate structure
- See [WXT entrypoints docs](https://wxt.dev/guide/essentials/entrypoints.html) for naming and export requirements
</important>

<important if="you are working on drag-and-drop between sections (bookmarks, reading list, open tabs)">
- Drag logic lives in `src/entrypoints/newtab/drag.ts`
- This file also contains the Reading List API wrapper (`getReadingListApi`)
</important>

<important if="you are working on tab data types, bookmarks, tab groups, or reading list data in the new tab page">
- Data types and fetching logic live in `src/utils/catalog.ts`
- Tab screenshot storage is in `src/utils/preview.ts`
</important>
