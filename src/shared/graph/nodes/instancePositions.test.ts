import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { INSTANCE_POSITIONS_NODE } from "./instancePositions";
import { ARRAY_NODE } from "./array";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "instpos-1" };

describe("INSTANCE_POSITIONS_NODE", () => {
  it("reads one position per Array instance", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { mode: "linear", count: 4, axis: "X", spacing: 3 }, CTX);

    const res = INSTANCE_POSITIONS_NODE.evaluate({ geometry: arrayRes.geometry }, INSTANCE_POSITIONS_NODE.defaultParams, CTX);
    const positions = res.positions as THREE.Vector3[];

    expect(res.count).toBe(4);
    expect(positions.map((p) => p.x)).toEqual([0, 3, 6, 9]);
  });

  it("shifts every position up by Height Offset, along Y", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { mode: "linear", count: 2, axis: "X", spacing: 5 }, CTX);

    const res = INSTANCE_POSITIONS_NODE.evaluate(
      { geometry: arrayRes.geometry },
      { ...INSTANCE_POSITIONS_NODE.defaultParams, heightOffset: 4 },
      CTX,
    );
    const positions = res.positions as THREE.Vector3[];
    expect(positions.every((p) => p.y === 4)).toBe(true);
  });

  it("treats a single ungrouped object as its own one-instance list", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.position.set(1, 2, 3);
    box.updateMatrixWorld(true);

    const res = INSTANCE_POSITIONS_NODE.evaluate({ geometry: box }, INSTANCE_POSITIONS_NODE.defaultParams, CTX);
    expect(res.count).toBe(1);
    const pos = (res.positions as THREE.Vector3[])[0];
    expect(pos.x).toBeCloseTo(1);
    expect(pos.y).toBeCloseTo(2);
    expect(pos.z).toBeCloseTo(3);
  });

  it("returns an empty list rather than throwing when nothing is wired", () => {
    const res = INSTANCE_POSITIONS_NODE.evaluate({}, INSTANCE_POSITIONS_NODE.defaultParams, CTX);
    expect(res.count).toBe(0);
    expect(res.positions).toEqual([]);
  });
});

describe("INSTANCE_POSITIONS_NODE -> Curve from Points integration (poles -> sagging wire)", () => {
  it("wires Array's poles straight into a drooping Curve from Points", async () => {
    const { CURVE_FROM_POINTS_NODE } = await import("./curve");

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: pole }, { mode: "linear", count: 3, axis: "X", spacing: 10 }, CTX);

    const posRes = INSTANCE_POSITIONS_NODE.evaluate(
      { geometry: arrayRes.geometry },
      { ...INSTANCE_POSITIONS_NODE.defaultParams, heightOffset: 3 }, // pole top, not its base
      CTX,
    );

    const curveRes = CURVE_FROM_POINTS_NODE.evaluate(
      { points: posRes.positions },
      { ...CURVE_FROM_POINTS_NODE.defaultParams, sag: 1.5 },
      CTX,
    );

    const curve = curveRes.curve as THREE.CurvePath<THREE.Vector3>;
    const start = curve.getPoint(0);
    const midOfFirstSpan = curve.getPoint(0.25);

    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(3); // the height offset, not the pole's base at y=0
    expect(midOfFirstSpan.y).toBeLessThan(start.y); // it actually droops
  });
});
