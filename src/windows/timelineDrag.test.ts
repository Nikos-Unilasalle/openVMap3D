import { describe, expect, it } from "vitest";
import {
  applyDragTransform,
  buildDragTransform,
  formatDragTransform,
  isNoOpDrag,
} from "./timelineDrag";

/** Runs a whole selection through one drag, the way the commit does. */
function drag(
  mode: "move" | "scale",
  frames: number[],
  opts: { start: number; pointer: number; pivot: number },
) {
  const t = buildDragTransform(mode, opts.start, opts.pointer, opts.pivot);
  return frames.map((f) => applyDragTransform(f, t));
}

describe("move", () => {
  it("slides the selection, every gap between keys preserved", () => {
    expect(drag("move", [10, 20, 40], { start: 10, pointer: 25, pivot: 0 })).toEqual([25, 35, 55]);
  });

  it("is a no-op when the pointer has not left the key it grabbed", () => {
    const t = buildDragTransform("move", 10, 10, 0);
    expect(isNoOpDrag(t)).toBe(true);
  });

  it("ignores the pivot entirely", () => {
    const a = drag("move", [10, 20], { start: 10, pointer: 30, pivot: 0 });
    const b = drag("move", [10, 20], { start: 10, pointer: 30, pivot: 999 });
    expect(a).toEqual(b);
  });
});

describe("scale", () => {
  it("spreads the selection when dragged away from the playhead", () => {
    // Playhead at 0, grab the key at 10, drag it to 20: everything doubles
    // its distance from the playhead.
    expect(drag("scale", [10, 20, 30], { start: 10, pointer: 20, pivot: 0 })).toEqual([20, 40, 60]);
  });

  it("packs it in when dragged toward the playhead", () => {
    expect(drag("scale", [10, 20, 30], { start: 20, pointer: 10, pivot: 0 })).toEqual([5, 10, 15]);
  });

  it("leaves a key sitting on the playhead where it is", () => {
    // Its distance from the pivot is zero, and any multiple of zero is zero.
    expect(drag("scale", [50, 60], { start: 60, pointer: 70, pivot: 50 })).toEqual([50, 70]);
  });

  it("scales about the playhead wherever it sits, not about zero", () => {
    // Pivot 100, key at 80 (20 before it), dragged to 60 (40 before): the key
    // at 90 is 10 before, so it lands 20 before, at 80.
    expect(drag("scale", [80, 90], { start: 80, pointer: 60, pivot: 100 })).toEqual([60, 80]);
  });

  it("mirrors the selection past the playhead when dragged through it", () => {
    // Blender does this too — dragging through the pivot flips the ordering,
    // which is a real (if drastic) retime rather than something to clamp away.
    expect(drag("scale", [10, 20], { start: 10, pointer: -10, pivot: 0 })).toEqual([-10, -20]);
  });

  it("collapses the selection onto the playhead at factor zero", () => {
    expect(drag("scale", [10, 20, 30], { start: 10, pointer: 0, pivot: 0 })).toEqual([0, 0, 0]);
  });

  it("rounds to whole frames", () => {
    // ×1.5 on a key 5 before the pivot is 7.5 — keyframes live on integers.
    expect(drag("scale", [10, 15], { start: 20, pointer: 30, pivot: 0 })).toEqual([15, 23]);
  });

  it("refuses to scale when the grabbed key is on the playhead", () => {
    // No lever arm: the factor would divide by ~zero and the smallest twitch
    // would fling the selection off the timeline.
    const t = buildDragTransform("scale", 50, 80, 50);
    expect(t.factor).toBe(1);
    expect(isNoOpDrag(t)).toBe(true);
    expect(applyDragTransform(70, t)).toBe(70);
  });

  it("is a no-op while the pointer sits on the key it grabbed", () => {
    expect(isNoOpDrag(buildDragTransform("scale", 30, 30, 10))).toBe(true);
  });
});

describe("readout", () => {
  it("shows frames moved for a move and a multiplier for a scale", () => {
    expect(formatDragTransform(buildDragTransform("move", 10, 25, 0))).toBe("+15");
    expect(formatDragTransform(buildDragTransform("move", 25, 10, 0))).toBe("-15");
    expect(formatDragTransform(buildDragTransform("scale", 10, 20, 0))).toBe("×2.00");
  });
});
