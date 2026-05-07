# Organic Tabs

A browser extension new tab page that surfaces bookmarks, reading list, and open tabs in a single view, with
drag-and-drop to organize and move items across them.

## Language

**Section**: One of the three top-level columns on the new tab page: Bookmarks, Reading List, or Open Tabs. _Avoid_:
group, panel, area (these are ambiguous — they also describe sub-groups within a section)

**Reading List Group**: One of the two sub-groups within the Reading List section: Unread or Read. _Avoid_: reading list
section (that refers to the top-level column)

**Window**: A browser window, rendered as a `<details>` element under the Open Tabs section.

**Tab Group**: A named colour-coded group of tabs nested inside a Window.

**Cross-section drag**: A drag operation where the source and destination are in different Sections. Semantics are copy
— the item is not removed from its origin. _Avoid_: move (reserved for intra-section bookmark drag)

**Intra-section drag**: A drag operation where source and destination are in the same Section. Currently only supported
within Bookmarks (reorganising links between folders), with move semantics.

## Relationships

- A **Section** contains zero or more drop targets at the `<details>` level
- The **Reading List** section contains exactly two **Reading List Groups**: Unread and Read
- The **Open Tabs** section contains one or more **Windows**, each of which may contain zero or more **Tab Groups**
- A **Cross-section drag** produces a copy; an **Intra-section drag** produces a move

## Example dialogue

> **Dev:** "When someone drags a tab to the reading list, do we remove the tab?" **Domain expert:** "No — it's a
> cross-section drag, so copy semantics. The tab stays open; a new reading list entry is created."
> **Dev:** "What if they drop it on the Read group?" **Domain expert:** "We confirm with `window.confirm` before adding
> it as already-read. Dropping on Unread is immediate."

## Testing

**Read-only test suite**: A Playwright suite where seeded Chrome data is not mutated by the test (e.g., asserting DOM
order or link URLs). Uses teardown cleanup (delete seeded bookmarks/reading list entries, close seeded tabs) after each
suite.

**Mutating test suite**: A Playwright suite where Chrome APIs are modified by the test actions (e.g., drag-and-drop that
creates bookmarks or adds reading list entries). Uses a fresh temp user-data-dir per suite to guarantee isolation.

Both suite types seed data via `page.evaluate()` in a shared Playwright fixture on the NTP page (`chrome-extension://<id>/newtab.html`), which has full access to `chrome.*` APIs.

**DOM membership assertion**: Given a link URL or title, assert it appears within the correct Section's DOM subtree,
under the correct group (`<details>` for bookmark folder / Window, or Reading List Group for Unread/Read). Exact
ordering within a group is not asserted for Bookmarks or Reading List.

**Drop outcome assertion**: After a drag, assert both (1) Chrome API state via `page.evaluate()` (e.g.
`chrome.readingList.query()` returns the new entry with expected URL/title) and (2) the NTP DOM reflects the updated
state. "API called with expected params" means querying post-drop API state — not function call spying, which is not
feasible in a real extension context. Exception: drag-to-tab (bookmark → Open Tabs) asserts via `context.pages()` that a
new tab opened, not a DOM update.

**Tab sort order assertion**: For the Open Tabs section, ordering within a Window (or Tab Group) is asserted because the
sort logic in `sort.ts` is under test. Bookmarks and Reading List do not require order assertions.

**Chrome API spy**: Injected via `page.addInitScript()` before the NTP loads, wrapping target methods (e.g.
`chrome.readingList.addEntry`) with a function that records call arguments to `window.__spyCalls` before forwarding to
the original. Used in mutating suites to assert exact params passed to Chrome APIs. State querying via `page.evaluate()`
is used for non-param assertions.

**CI**: Local-first. Tests run via `pnpm test:e2e` (with `pretest:e2e` running `pnpm build`). No GitHub Actions workflow
planned.

**Implementation order**: (1) `ntp-bookmarks.spec.ts` — proves the full pipeline (build → load extension → seed →
assert). (2) `ntp-drag.spec.ts` — highest-risk feature, added once infrastructure is validated. (3)
`ntp-reading-list.spec.ts` and `ntp-open-tabs.spec.ts` — follow the same pattern, added incrementally.

**Selectors**: `data-testid` attributes added to stable NTP anchor points — the three section roots, group `<details>`
elements, and link custom elements. Added to `index.html` templates and `newtab.ts` where elements are created
dynamically.

**Read group confirm dialog**: Dropping onto the Read Reading List Group triggers `window.confirm`. Both outcomes are
tested: accept (assert entry added with `hasBeenRead: true`) and dismiss (assert no entry added, NTP unchanged).
Playwright handles this via `page.on('dialog', d => d.accept()/d.dismiss())` set up per test before the drag.

**Drag test helpers** (two, separate concerns):

- `assertDropTargetHighlights(page, targetSelector)` — dispatches a synthetic `dragenter` via `page.evaluate()` and
  asserts the drop-target highlight CSS class is present. Read-only; no Chrome API mutation.
- `dragTo(page, sourceSelector, targetSelector)` — wraps `page.dragAndDrop()` to simulate a full drag sequence. Used for
  drop outcome assertions only. Falls back to manual event dispatch via `page.evaluate()` if `dragAndDrop()` proves
  unreliable against this implementation.

## Flagged ambiguities

- "section" was used loosely to mean both top-level columns and sub-groups (e.g. Unread/Read). Resolved: **Section** =
  top-level only; sub-groups within a section are called **Reading List Groups**, **Windows**, or **Tab Groups** as
  appropriate.
