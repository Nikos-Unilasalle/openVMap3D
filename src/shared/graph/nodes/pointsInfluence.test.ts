import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { POINTS_INFLUENCE_NODE } from "./pointsInfluence";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "influence-test" };

describe("POINTS_INFLUENCE_NODE", () => {
  it("defaults every point to 0 influence when nothing has been painted", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)];
    const res = POINTS_INFLUENCE_NODE.evaluate({ points, matrix: new THREE.Matrix4() }, POINTS_INFLUENCE_NODE.defaultParams, CTX);
    expect(res.influence).toEqual([0, 0]);
    expect(res.count).toBe(0);
  });

  it("reads painted influence by index and clamps to 0-1", () => {
    const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const res = POINTS_INFLUENCE_NODE.evaluate(
      { points, matrix: new THREE.Matrix4() },
      { ...POINTS_INFLUENCE_NODE.defaultParams, influences: { 0: 0.3, 2: 5 } },
      CTX,
    );
    expect(res.influence).toEqual([0.3, 0, 1]);
    expect(res.count).toBe(2);
  });

  it("the Geometry shortcut extracts points itself, same as Points Selection", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = POINTS_INFLUENCE_NODE.evaluate({ geometry: box }, POINTS_INFLUENCE_NODE.defaultParams, CTX);
    expect(Array.isArray(res.points)).toBe(true);
    expect((res.points as unknown[]).length).toBe(box.geometry.attributes.position.count);
    expect(res.geometry).toBe(box);
  });
});
