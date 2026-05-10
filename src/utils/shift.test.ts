import { describe, expect, it } from "vitest";
import { findGeometricTarget, type ShiftWindow } from "./shift";

function w(id: number, left: number, width: number, top = 0, height = 200): ShiftWindow {
  return { id, left, top, width, height };
}

describe("findGeometricTarget — tiling (non-overlapping)", () => {
  // [0,300]  [400,700]  [800,1100]
  const w1 = w(1, 0, 300);
  const w2 = w(2, 400, 300);
  const w3 = w(3, 800, 300);
  const all = [w1, w2, w3];

  it("steps right in order", () => {
    expect(findGeometricTarget(all, w1, "right")).toBe(w2);
    expect(findGeometricTarget(all, w2, "right")).toBe(w3);
  });

  it("steps left in order", () => {
    expect(findGeometricTarget(all, w3, "left")).toBe(w2);
    expect(findGeometricTarget(all, w2, "left")).toBe(w1);
  });

  it("returns null at the boundary", () => {
    expect(findGeometricTarget(all, w1, "left")).toBeNull();
    expect(findGeometricTarget(all, w3, "right")).toBeNull();
  });

  it("no vertical movement — all windows same top/height", () => {
    expect(findGeometricTarget(all, w1, "up")).toBeNull();
    expect(findGeometricTarget(all, w1, "down")).toBeNull();
    expect(findGeometricTarget(all, w2, "up")).toBeNull();
    expect(findGeometricTarget(all, w2, "down")).toBeNull();
  });
});

describe("findGeometricTarget — one-side stacking", () => {
  // w1:[0,800]  w2:[500,1200]  — w2 starts inside w1 and extends right
  const w1 = w(1, 0, 800);
  const w2 = w(2, 500, 700);
  const all = [w1, w2];

  it("right from w1 → w2 (w2.right 1200 > w1.right 800)", () => {
    expect(findGeometricTarget(all, w1, "right")).toBe(w2);
  });

  it("left from w2 → w1 (w1.left 0 < w2.left 500)", () => {
    expect(findGeometricTarget(all, w2, "left")).toBe(w1);
  });

  it("right from w2 → null (nothing extends past 1200)", () => {
    expect(findGeometricTarget(all, w2, "right")).toBeNull();
  });

  it("left from w1 → null (nothing has left edge before 0)", () => {
    expect(findGeometricTarget(all, w1, "left")).toBeNull();
  });

  it("no vertical movement — all windows same top/height", () => {
    expect(findGeometricTarget(all, w1, "up")).toBeNull();
    expect(findGeometricTarget(all, w1, "down")).toBeNull();
    expect(findGeometricTarget(all, w2, "up")).toBeNull();
    expect(findGeometricTarget(all, w2, "down")).toBeNull();
  });
});

describe("findGeometricTarget — both-sides stacking", () => {
  // w1:[200,600]  w2:[0,400] (overlaps w1 left)  w3:[400,800] (overlaps w1 right)
  // right-edge order:  w2=400, w1=600, w3=800
  // left-edge order:   w2=0,   w1=200, w3=400
  const w1 = w(1, 200, 400);
  const w2 = w(2, 0, 400);
  const w3 = w(3, 400, 400);
  const all = [w1, w2, w3];

  it("right from w1 → w3 (nearest right edge past 600)", () => {
    expect(findGeometricTarget(all, w1, "right")).toBe(w3);
  });

  it("left from w1 → w2 (nearest left edge before 200)", () => {
    expect(findGeometricTarget(all, w1, "left")).toBe(w2);
  });

  it("iterates right in order: w2 → w1 → w3", () => {
    expect(findGeometricTarget(all, w2, "right")).toBe(w1);
    expect(findGeometricTarget(all, w1, "right")).toBe(w3);
    expect(findGeometricTarget(all, w3, "right")).toBeNull();
  });

  it("iterates left in order: w3 → w1 → w2", () => {
    expect(findGeometricTarget(all, w3, "left")).toBe(w1);
    expect(findGeometricTarget(all, w1, "left")).toBe(w2);
    expect(findGeometricTarget(all, w2, "left")).toBeNull();
  });
});

describe("findGeometricTarget — vertical stacking (up/down)", () => {
  // w1:[top=0,bottom=500]  w2:[top=300,bottom=800]
  const w1 = w(1, 0, 200, 0, 500);
  const w2 = w(2, 0, 200, 300, 500);
  const all = [w1, w2];

  it("down from w1 → w2 (w2.bottom 800 > w1.bottom 500)", () => {
    expect(findGeometricTarget(all, w1, "down")).toBe(w2);
  });

  it("up from w2 → w1 (w1.top 0 < w2.top 300)", () => {
    expect(findGeometricTarget(all, w2, "up")).toBe(w1);
  });

  it("down from w2 → null", () => {
    expect(findGeometricTarget(all, w2, "down")).toBeNull();
  });

  it("up from w1 → null", () => {
    expect(findGeometricTarget(all, w1, "up")).toBeNull();
  });

  it("no horizontal movement — all windows same left/width", () => {
    expect(findGeometricTarget(all, w1, "left")).toBeNull();
    expect(findGeometricTarget(all, w1, "right")).toBeNull();
    expect(findGeometricTarget(all, w2, "left")).toBeNull();
    expect(findGeometricTarget(all, w2, "right")).toBeNull();
  });
});
