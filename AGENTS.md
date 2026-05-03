<!-- markdownlint-disable no-inline-html -->

# Organic Tabs

Browser extension built with the [WXT framework](https://wxt.dev/) and vanilla TypeScript (no UI framework).

## Project map

- `src/entrypoints/newtab/` - New tab page: lists bookmarks and open tabs
- `src/entrypoints/popup/` - Extension popup UI
- `src/entrypoints/background.ts` - Background service worker
- `src/utils/` - Shared utilities: messaging, settings, tab sort, tab shift
- `public/` - Static assets bundled into the extension
- `.wxt/` - WXT-generated types and config (do not edit)
- `.output/` - Build output (do not edit)

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
