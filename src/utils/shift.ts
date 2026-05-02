import type { Direction } from "./settings";

export interface ShiftWindow {
  id?: number;
  state?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

interface Point {
  x: number;
  y: number;
}

interface EdgeMidpoints {
  current: Point;
  candidate: Point;
}

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

function getEdgeMidpoints(w: ShiftWindow, direction: Direction): EdgeMidpoints {
  const left = w.left ?? 0;
  const top = w.top ?? 0;
  const width = w.width ?? 0;
  const height = w.height ?? 0;

  switch (direction) {
    case "right":
      return {
        current: { x: left + width, y: top + height / 2 },
        candidate: { x: left, y: top + height / 2 },
      };
    case "left":
      return {
        current: { x: left, y: top + height / 2 },
        candidate: { x: left + width, y: top + height / 2 },
      };
    case "down":
      return {
        current: { x: left + width / 2, y: top + height },
        candidate: { x: left + width / 2, y: top },
      };
    case "up":
      return {
        current: { x: left + width / 2, y: top },
        candidate: { x: left + width / 2, y: top + height },
      };
  }
}

export function findGeometricTarget(
  windows: ShiftWindow[],
  currentWindow: ShiftWindow,
  direction: Direction,
): ShiftWindow | null {
  const { current: refPoint } = getEdgeMidpoints(currentWindow, direction);

  const candidates = windows.filter((w) => w.id !== currentWindow.id);
  if (candidates.length === 0) {
    return null;
  }

  const isHorizontal = direction === "left" || direction === "right";

  candidates.sort((a, b) => {
    const { candidate: ca } = getEdgeMidpoints(a, direction);
    const { candidate: cb } = getEdgeMidpoints(b, direction);
    const da = isHorizontal
      ? Math.abs(ca.x - refPoint.x)
      : Math.abs(ca.y - refPoint.y);
    const db = isHorizontal
      ? Math.abs(cb.x - refPoint.x)
      : Math.abs(cb.y - refPoint.y);
    return da - db;
  });

  return candidates[0] ?? null;
}
