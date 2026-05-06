# Cross-section drag uses copy semantics; intra-section bookmark drag uses move semantics

Dragging between Sections (Bookmarks → Reading List, Open Tabs → Bookmarks, etc.) is a **copy** — the item is not
removed from its origin. Dragging within the Bookmarks section (link from one folder to another) is a **move** via
`chrome.bookmarks.move()`. This distinction is surfaced to the user via `cursor: copy` vs `cursor: move` on valid drop
targets.

Copy was chosen for cross-section drag because each section represents a fundamentally different store (Chrome bookmarks
API, reading list API, open tab state). Removing from the origin would require a delete call on a separate API — a
higher-stakes action the user did not explicitly request. Copy matches the mental model: "I'm adding this link to
another place", not "I'm transferring it."

## Considered Options

- **Move for all drags** — rejected because cross-section removes would silently delete data (bookmarks, tabs) from a
  different store than where the user was focused.
- **Always copy, even within bookmarks** — rejected because bookmark-within-bookmark is explicitly a reorganisation
  task, where duplicating a link defeats the purpose.
