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

## Flagged ambiguities

- "section" was used loosely to mean both top-level columns and sub-groups (e.g. Unread/Read). Resolved: **Section** =
  top-level only; sub-groups within a section are called **Reading List Groups**, **Windows**, or **Tab Groups** as
  appropriate.
