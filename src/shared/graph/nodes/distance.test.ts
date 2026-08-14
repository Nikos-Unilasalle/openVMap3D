import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DISTANCE_NODE, PROXIMITY_OBJECT_NODE } from "./distance";

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

describe("PROXIMITY_OBJECT_NODE", () => {
  it("finds the nearest object in a list of candidate objects", () => {
    const target = new THREE.Mesh();
    target.position.set(0, 0, 0);

    const cand1 = new THREE.Mesh();
    cand1.position.set(10, 0, 0);

    const cand2 = new THREE.Mesh();
    cand2.position.set(2, 0, 0);

    const cand3 = new THREE.Mesh();
    cand3.position.set(5, 0, 0);

    const res = PROXIMITY_OBJECT_NODE.evaluate(
      { target, candidates: [cand1, cand2, cand3] },
      PROXIMITY_OBJECT_NODE.defaultParams,
      dummyCtx,
    );

    expect(res.object).toBe(cand2);
    expect(res.distance).toBeCloseTo(2);
    expect(res.index).toBe(1);
    expect((res.vector as THREE.Vector3).x).toBeCloseTo(2);
  });

  it("ignores target object if it appears in candidates list when ignoreSelf is true", () => {
    const target = new THREE.Mesh();
    target.position.set(0, 0, 0);

    const candOther = new THREE.Mesh();
    candOther.position.set(3, 4, 0);

    const res = PROXIMITY_OBJECT_NODE.evaluate(
      { target, candidates: [target, candOther] },
      { ignoreSelf: true },
      dummyCtx,
    );

    expect(res.object).toBe(candOther);
    expect(res.distance).toBeCloseTo(5);
    expect(res.index).toBe(1);
  });

  it("automatically unrolls child instances inside a Group (e.g. Array node)", () => {
    const target = new THREE.Mesh();
    target.position.set(0, 0, 0);

    const group = new THREE.Group();

    const instance1 = new THREE.Mesh();
    instance1.position.set(20, 0, 0);

    const instance2 = new THREE.Mesh();
    instance2.position.set(1, 0, 0);

    group.add(instance1);
    group.add(instance2);

    const res = PROXIMITY_OBJECT_NODE.evaluate(
      { target, candidates: group },
      PROXIMITY_OBJECT_NODE.defaultParams,
      dummyCtx,
    );

    expect(res.object).toBe(instance2);
    expect(res.distance).toBeCloseTo(1);
    expect(res.index).toBe(1);
  });
});

