import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DISTANCE_NODE } from "./distance";

const dummyCtx = { time: 0, step: 0, nodeId: "test" };

describe("DISTANCE_NODE", () => {
  it("calculates 3D distance between origin (0,0,0) and (3,4,0)", () => {
    const res = DISTANCE_NODE.evaluate(
      { a: new THREE.Vector3(0, 0, 0), b: new THREE.Vector3(3, 4, 0) },
      { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 },
      dummyCtx,
    );
    expect(res.distance).toBeCloseTo(5);
    expect(res.distanceSq).toBeCloseTo(25);
  });

  it("uses fallback parameter values when inputs are unconnected", () => {
    const res = DISTANCE_NODE.evaluate(
      {},
      { ax: 1, ay: 2, az: 2, bx: 1, by: 5, bz: 6 },
      dummyCtx,
    );
    // (1,2,2) to (1,5,6) -> diff (0, 3, 4) -> dist = 5
    expect(res.distance).toBeCloseTo(5);
    expect(res.distanceSq).toBeCloseTo(25);
  });

  it("extracts position from Object3D instances", () => {
    const objA = new THREE.Mesh();
    objA.position.set(10, 0, 0);

    const objB = new THREE.Mesh();
    objB.position.set(10, 10, 0);

    const res = DISTANCE_NODE.evaluate({ a: objA, b: objB }, {}, dummyCtx);
    expect(res.distance).toBeCloseTo(10);
  });

  it("supports array/list inputs", () => {
    const listA = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)];
    const listB = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 2, 0)];

    const res = DISTANCE_NODE.evaluate({ a: listA, b: listB }, {}, dummyCtx);
    expect(res.list).toEqual([1, 2]);
  });
});
