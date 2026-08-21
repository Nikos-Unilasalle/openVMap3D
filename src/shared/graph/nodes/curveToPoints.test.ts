import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CURVE_TO_POINTS_NODE } from "./curveToPoints";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "c2p-test" };

describe("CURVE_TO_POINTS_NODE", () => {
  it("returns empty output when nothing is wired, rather than throwing", () => {
    const res = CURVE_TO_POINTS_NODE.evaluate({}, CURVE_TO_POINTS_NODE.defaultParams, CTX);
    expect(res.points).toEqual([]);
    expect(res.count).toBe(0);
  });

  it("samples exactly Max Points, first and last landing on the curve's own ends", () => {
    const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0));
    const res = CURVE_TO_POINTS_NODE.evaluate({ curve }, { ...CURVE_TO_POINTS_NODE.defaultParams, maxPoints: 5 }, CTX);
    const points = res.points as THREE.Vector3[];

    expect(points.length).toBe(5);
    expect(res.count).toBe(5);
    expect(points[0].x).toBeCloseTo(0);
    expect(points[4].x).toBeCloseTo(10);
    expect(points[2].x).toBeCloseTo(5); // evenly spaced midpoint
  });

  it("mirrors the points list into flat xValues/yValues/zValues", () => {
    const curve = new THREE.LineCurve3(new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 5, 6));
    const res = CURVE_TO_POINTS_NODE.evaluate({ curve }, { ...CURVE_TO_POINTS_NODE.defaultParams, maxPoints: 3 }, CTX);
    const points = res.points as THREE.Vector3[];
    const xValues = res.xValues as number[];
    const yValues = res.yValues as number[];
    const zValues = res.zValues as number[];

    expect(xValues).toEqual(points.map((p) => p.x));
    expect(yValues).toEqual(points.map((p) => p.y));
    expect(zValues).toEqual(points.map((p) => p.z));
  });

  it("clamps Max Points to at least 2", () => {
    const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
    const res = CURVE_TO_POINTS_NODE.evaluate({ curve }, { ...CURVE_TO_POINTS_NODE.defaultParams, maxPoints: 0 }, CTX);
    expect((res.points as THREE.Vector3[]).length).toBe(2);
  });

  it("samples evenly by arc length, not by the curve's own parameterization — a two-segment CurvePath with very unequal segment lengths still gets roughly proportional coverage", () => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    path.add(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0))); // short
    path.add(new THREE.LineCurve3(new THREE.Vector3(1, 0, 0), new THREE.Vector3(11, 0, 0))); // long (10x)
    const res = CURVE_TO_POINTS_NODE.evaluate({ curve: path }, { ...CURVE_TO_POINTS_NODE.defaultParams, maxPoints: 12 }, CTX);
    const xs = (res.points as THREE.Vector3[]).map((p) => p.x);

    // Roughly 1/11 of the samples should fall in the short [0,1] segment —
    // with 12 points over length 11, that's ~1 point, not ~6 (which a
    // parameter-uniform getPoints(11) would give, since it treats each
    // segment as an equal 50% of the total parameter range).
    const inShortSegment = xs.filter((x) => x <= 1).length;
    expect(inShortSegment).toBeLessThanOrEqual(3);
  });
});
