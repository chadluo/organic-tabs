export type Direction = "up" | "down" | "left" | "right";

export interface ShiftWindow {
  id?: number;
  state?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

// #region Cyclic

/**
 * Cyclic fallback used when the current window is maximized or fullscreen,
 * where geometric screen positions are unreliable. Steps through windows sorted
 * by ID to give a stable, repeatable cycle order.
 */
export function findCyclicTarget(
  windows: ShiftWindow[],
  currentId: number,
  direction: Direction,
): ShiftWindow | null {
  const sorted = [...windows].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const idx = sorted.findIndex((w) => w.id === currentId);
  if (idx < 0) {
    return null;
  }

  const isPrev = direction === "up" || direction === "left";
  const nextIdx = isPrev
    ? (idx - 1 + sorted.length) % sorted.length
    : (idx + 1) % sorted.length;

  return sorted[nextIdx] ?? null;
}

// #endregion Cyclic

// #region Geometric

/**
 * Finds the nearest window in `direction` by sorting all candidates by their
 * same-side edge and picking the first one that extends past the current
 * window's same-side edge. Works for both tiling and stacking (overlapping)
 * windows.
 *
 * - right: sort ascending by right edge, find first where candidate.right > current.right
 * - left:  sort ascending by left edge,  findLast where candidate.left < current.left
 * - down:  sort ascending by bottom edge, find first where candidate.bottom > current.bottom
 * - up:    sort ascending by top edge,   findLast where candidate.top < current.top
 */
export function findGeometricTarget(
  windows: ShiftWindow[],
  currentWindow: ShiftWindow,
  direction: Direction,
): ShiftWindow | null {
  const candidates = windows.filter((w) => w.id !== currentWindow.id);
  if (candidates.length === 0) {
    return null;
  }

  const curLeft = currentWindow.left ?? 0;
  const curTop = currentWindow.top ?? 0;
  const curRight = curLeft + (currentWindow.width ?? 0);
  const curBottom = curTop + (currentWindow.height ?? 0);

  switch (direction) {
    case "right":
      candidates.sort((a, b) => (a.left ?? 0) + (a.width ?? 0) - ((b.left ?? 0) + (b.width ?? 0)));
      return candidates.find((c) => (c.left ?? 0) + (c.width ?? 0) > curRight) ?? null;
    case "left":
      candidates.sort((a, b) => (a.left ?? 0) - (b.left ?? 0));
      return candidates.findLast((c) => (c.left ?? 0) < curLeft) ?? null;
    case "down":
      candidates.sort((a, b) => (a.top ?? 0) + (a.height ?? 0) - ((b.top ?? 0) + (b.height ?? 0)));
      return candidates.find((c) => (c.top ?? 0) + (c.height ?? 0) > curBottom) ?? null;
    case "up":
      candidates.sort((a, b) => (a.top ?? 0) - (b.top ?? 0));
      return candidates.findLast((c) => (c.top ?? 0) < curTop) ?? null;
  }
}

// #endregion Geometric