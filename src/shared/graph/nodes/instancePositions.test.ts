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

  it("anchor 'top' reads the actual scaled bounding-box top, not a fixed offset", () => {
    // Two poles of the same base geometry, one scaled 2x taller than the
    // other — a constant Height Offset can only be correct for one of them.
    const shortPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2));
    shortPole.geometry.translate(0, 1, 0); // base at y=0, top at y=2
    const tallPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2));
    tallPole.geometry.translate(0, 1, 0);
    tallPole.scale.set(1, 2.5, 1); // base still at y=0, top now at y=5

    const group = new THREE.Group();
    group.add(shortPole, tallPole);

    const res = INSTANCE_POSITIONS_NODE.evaluate(
      { geometry: group },
      { ...INSTANCE_POSITIONS_NODE.defaultParams, anchor: "top" },
      CTX,
    );
    const positions = res.positions as THREE.Vector3[];
    expect(positions[0].y).toBeCloseTo(2);
    expect(positions[1].y).toBeCloseTo(5);
  });

  it("anchor 'bottom' reads the base of the bounding box", () => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2));
    pole.geometry.translate(0, 1, 0);
    pole.position.set(0, 3, 0); // planted with its base 3 units up

    const res = INSTANCE_POSITIONS_NODE.evaluate(
      { geometry: pole },
      { ...INSTANCE_POSITIONS_NODE.defaultParams, anchor: "bottom" },
      CTX,
    );
    expect((res.positions as THREE.Vector3[])[0].y).toBeCloseTo(3);
  });

  it("anchor 'top' still respects Height Offset on top of the measured bound", () => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2));
    pole.geometry.translate(0, 1, 0);

    const res = INSTANCE_POSITIONS_NODE.evaluate(
      { geometry: pole },
      { ...INSTANCE_POSITIONS_NODE.defaultParams, anchor: "top", heightOffset: 0.5 },
      CTX,
    );
    expect((res.positions as THREE.Vector3[])[0].y).toBeCloseTo(2.5);
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
