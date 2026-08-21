import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CURVE_SUBDIVIDE_NODE } from "./curveSubdivide";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "subdiv-test" };

describe("CURVE_SUBDIVIDE_NODE", () => {
  it("returns the points unchanged when subdivisions is 0", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)];
    const res = CURVE_SUBDIVIDE_NODE.evaluate({ points }, { ...CURVE_SUBDIVIDE_NODE.defaultParams, subdivisions: 0 }, CTX);
    expect(res.points).toEqual(points);
  });

  it("linear: inserts N evenly-spaced points per segment, keeping every original point exactly", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0), new THREE.Vector3(10, 10, 0)];
    const res = CURVE_SUBDIVIDE_NODE.evaluate(
      { points },
      { ...CURVE_SUBDIVIDE_NODE.defaultParams, type: "linear", subdivisions: 1 },
      CTX,
    ) as { points: THREE.Vector3[] };

    // 3 points, 2 segments, 1 subdivision each -> 3 + 2 = 5 points.
    expect(res.points.length).toBe(5);
    expect(res.points[0]).toEqual(points[0]);
    expect(res.points[2]).toEqual(points[1]);
    expect(res.points[4]).toEqual(points[2]);
    // Midpoint of segment 1.
    expect(res.points[1].x).toBeCloseTo(5);
    expect(res.points[1].y).toBeCloseTo(0);
    // Midpoint of segment 2.
    expect(res.points[3].x).toBeCloseTo(10);
    expect(res.points[3].y).toBeCloseTo(5);
  });

  it("linear: 2 subdivisions inserts points at 1/3 and 2/3 of each segment", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(9, 0, 0)];
    const res = CURVE_SUBDIVIDE_NODE.evaluate(
      { points },
      { ...CURVE_SUBDIVIDE_NODE.defaultParams, type: "linear", subdivisions: 2 },
      CTX,
    ) as { points: THREE.Vector3[] };

    expect(res.points.length).toBe(4);
    expect(res.points[1].x).toBeCloseTo(3);
    expect(res.points[2].x).toBeCloseTo(6);
  });

  it("catmull: keeps every original point exactly, new points land on the curve (not the straight chord)", () => {
    // A sharp bend: a straight-chord lerp would land the midpoint at (5, 0),
    // but a curve through these three points bulges toward the bend.
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 5, 0), new THREE.Vector3(10, 0, 0)];
    const res = CURVE_SUBDIVIDE_NODE.evaluate(
      { points },
      { ...CURVE_SUBDIVIDE_NODE.defaultParams, type: "catmull", subdivisions: 1 },
      CTX,
    ) as { points: THREE.Vector3[] };

    expect(res.points.length).toBe(5);
    expect(res.points[0].x).toBeCloseTo(0);
    expect(res.points[2]).toEqual(points[1]);
    expect(res.points[4].x).toBeCloseTo(10);
    // The inserted point between (0,0,0) and (5,5,0) should be pulled up by
    // the curve's tangent toward the peak, not sitting on the flat chord.
    expect(res.points[1].y).toBeGreaterThan(0.5);
  });

  it("closed: also subdivides the last -> first gap, and doesn't duplicate the seam", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0), new THREE.Vector3(10, 10, 0), new THREE.Vector3(0, 10, 0)];
    const res = CURVE_SUBDIVIDE_NODE.evaluate(
      { points },
      { ...CURVE_SUBDIVIDE_NODE.defaultParams, type: "linear", subdivisions: 1, closed: true },
      CTX,
    ) as { points: THREE.Vector3[] };

    // 4 points, 4 segments (closed), 1 subdivision each -> 8 points, no
    // duplicate of point[0] at the end.
    expect(res.points.length).toBe(8);
    expect(res.points[0]).toEqual(points[0]);
    expect(res.points[res.points.length - 1].x).toBeCloseTo(0);
    expect(res.points[res.points.length - 1].y).toBeCloseTo(5); // midpoint of the closing gap
  });

  it("passes through fewer than 2 points untouched", () => {
    const points = [new THREE.Vector3(1, 2, 3)];
    const res = CURVE_SUBDIVIDE_NODE.evaluate({ points }, CURVE_SUBDIVIDE_NODE.defaultParams, CTX);
    expect(res.points).toEqual(points);
  });
});
