import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { POINTS_SELECTION_NODE } from "./pointsSelection";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "psel-1" };

describe("POINTS_SELECTION_NODE", () => {
  it("passes points through unchanged", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)];
    const res = POINTS_SELECTION_NODE.evaluate({ points }, POINTS_SELECTION_NODE.defaultParams, CTX);
    expect(res.points).toBe(points);
  });

  it("mask is all 0 with no selection", () => {
    const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const res = POINTS_SELECTION_NODE.evaluate({ points }, POINTS_SELECTION_NODE.defaultParams, CTX);
    expect(res.mask).toEqual([0, 0, 0]);
    expect(res.count).toBe(0);
  });

  it("mask reflects selectedIndices exactly, by position", () => {
    const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const res = POINTS_SELECTION_NODE.evaluate({ points }, { selectedIndices: [1, 3] }, CTX);
    expect(res.mask).toEqual([0, 1, 0, 1]);
    expect(res.count).toBe(2);
  });

  it("out-of-range selected indices don't throw and don't appear in the mask", () => {
    const points = [new THREE.Vector3(), new THREE.Vector3()];
    const res = POINTS_SELECTION_NODE.evaluate({ points }, { selectedIndices: [5, 0] }, CTX);
    expect(res.mask).toEqual([1, 0]);
  });

  it("handles no points wired without throwing", () => {
    const res = POINTS_SELECTION_NODE.evaluate({}, { selectedIndices: [0, 1] }, CTX);
    expect(res.points).toEqual([]);
    expect(res.mask).toEqual([]);
  });

  it("Geometry shortcut: extracts points itself and passes the object through, no Mesh to Points needed", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = POINTS_SELECTION_NODE.evaluate({ geometry: mesh }, { selectedIndices: [0] }, CTX);
    const points = res.points as THREE.Vector3[];
    expect(points.length).toBe(mesh.geometry.attributes.position.count);
    expect(res.mask).toEqual([1, ...new Array(points.length - 1).fill(0)]);
    expect(res.geometry).toBe(mesh);
  });

  it("Geometry mode reads pose through a posed wrapper group (the OBJ Model case)", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const wrapper = new THREE.Group();
    wrapper.matrixAutoUpdate = false;
    wrapper.matrix.setPosition(2, 4, -6);
    wrapper.add(mesh);

    const res = POINTS_SELECTION_NODE.evaluate({ geometry: wrapper }, POINTS_SELECTION_NODE.defaultParams, CTX);
    const pos = new THREE.Vector3().setFromMatrixPosition(res.matrix as THREE.Matrix4);
    expect(pos.x).toBeCloseTo(2);
    expect(pos.y).toBeCloseTo(4);
    expect(pos.z).toBeCloseTo(-6);
  });
});
