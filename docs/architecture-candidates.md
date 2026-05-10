# Architecture Deepening Candidates

Surfaced via `/improve-codebase-architecture`. See [LANGUAGE.md](../LANGUAGE.md) for vocabulary.

## 1 — Section renderer extraction from `newtab.ts` ✅ done (commit: refactor(newtab))

`newtab.ts` was a 611-line monolith. `loadTabs()`, `loadBookmarks()`, and `loadReadingList()` each
fused: fetch catalog → build DOM → attach drop targets → wire buttons → track collapse state.

**Resolution:** Extracted `renderTabs.ts`, `renderBookmarks.ts`, `renderReadingList.ts`,
`linkUtils.ts`, `titleEditor.ts`. Each renderer takes a data snapshot + detailsState and returns a
`DocumentFragment`. `newtab.ts` reduced to 195 lines of orchestration.

---

## 2 — Drop policy extraction from `drag.ts`

**File:** `src/entrypoints/newtab/drag.ts`

`setupDropTarget()` (118 lines) fuses three concerns: DOM event wiring (dragenter/dragover/dragleave/
drop + `drag-over` CSS class), drop policy (~12 paths: 3 drag types × 4 destination configs,
including `window.confirm` and browser API calls), and execution of those API calls. The policy
cannot be unit-tested because it is entangled with DOM events.

**Candidate solution:** Extract a pure `DropPolicy` function — given `{ sourceType, destination }`
→ action descriptor — separating what should happen from the event machinery that triggers it.

---

## 3 — Browser event coordinator in `newtab.ts`

**File:** `src/entrypoints/newtab/newtab.ts` (bottom of file)

11 browser event listeners registered individually, each triggering a full Section re-render with no
debouncing. A single tab title update re-renders the entire Windows Section. Each listener is
literally `() => loadSection()` — shallow with no leverage.

**Candidate solution:** An `EventCoordinator` module that owns the subscription map and applies
debouncing. One fix, all 11 listeners benefit.

---

## 4 — Unified storage adapter for settings and preview ✅ done (commit: refactor(storage))

**Files:** `src/utils/settings.ts`, `src/utils/preview.ts`

Both modules independently implement the same read→merge→write pattern against
`browser.storage.local`. Neither is testable without browser mocking. `preview.ts` has a latent race
condition (read→modify→write without a lock) invisible at the interface.

**Candidate solution:** A `StorageAdapter<T>` module with a `get`/`set`/`update` interface. Both
modules become thin callers. The seam supports an in-memory adapter for tests; the race condition is
fixed once.
