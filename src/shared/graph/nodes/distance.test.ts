import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DISTANCE_NODE, DISTANCES_NODE, PROXIMITY_OBJECT_NODE } from "./distance";

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

  it("accepts matrices, as emitted by the object nodes' matrix output", () => {
    const a = new THREE.Matrix4().makeTranslation(0, 0, 0);
    const b = new THREE.Matrix4().compose(
      new THREE.Vector3(3, 4, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(2, 2, 2),
    );

    const res = DISTANCE_NODE.evaluate({ a, b }, {}, dummyCtx);

    expect(res.distance).toBeCloseTo(5);
  });

  it("supports array/list inputs", () => {
    const listA = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)];
    const listB = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 2, 0)];

    const res = DISTANCE_NODE.evaluate({ a: listA, b: listB }, {}, dummyCtx);
    expect(res.list).toEqual([1, 2]);
  });
});

describe("DISTANCES_NODE", () => {
  it("calculates list of distances from a group or list of instances to a target vector/object", () => {
    expect(DISTANCES_NODE.type).toBe("math/distances");

    const inst1 = new THREE.Mesh();
    inst1.position.set(3, 4, 0); // distance = 5

    const inst2 = new THREE.Mesh();
    inst2.position.set(0, 10, 0); // distance = 10

    const target = new THREE.Vector3(0, 0, 0);

    const res = DISTANCES_NODE.evaluate(
      { instances: [inst1, inst2], target },
      DISTANCES_NODE.defaultParams,
      dummyCtx,
    );

    // evaluate() is typed Record<string, unknown> — narrow the two list
    // outputs the assertions index into, same as the other node tests do.
    const distances = res.distances as number[];
    const distancesSq = res.distancesSq as number[];
    expect(distances).toHaveLength(2);
    expect(distances[0]).toBeCloseTo(5);
    expect(distances[1]).toBeCloseTo(10);
    expect(distancesSq[0]).toBeCloseTo(25);
    expect(distancesSq[1]).toBeCloseTo(100);
    expect(res.min).toBeCloseTo(5);
    expect(res.max).toBeCloseTo(10);
    expect(res.count).toBe(2);
  });

  it("handles Group inputs (Array / Texture Pixel Spawner)", () => {
    const group = new THREE.Group();
    const inst1 = new THREE.Mesh();
    inst1.position.set(1, 0, 0);
    const inst2 = new THREE.Mesh();
    inst2.position.set(5, 0, 0);
    group.add(inst1);
    group.add(inst2);

    const target = new THREE.Vector3(0, 0, 0);

    const res = DISTANCES_NODE.evaluate(
      { instances: group, target },
      DISTANCES_NODE.defaultParams,
      dummyCtx,
    );

    expect(res.distances).toEqual([1, 5]);
    expect(res.min).toBe(1);
    expect(res.max).toBe(5);
    expect(res.count).toBe(2);
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

  it("accepts a matrix as its target", () => {
    const target = new THREE.Matrix4().makeTranslation(10, 0, 0);

    const near = new THREE.Mesh();
    near.position.set(9, 0, 0);
    const far = new THREE.Mesh();
    far.position.set(0, 0, 0);

    const res = PROXIMITY_OBJECT_NODE.evaluate(
      { target, candidates: [far, near] },
      PROXIMITY_OBJECT_NODE.defaultParams,
      dummyCtx,
    );

    expect(res.index).toBe(1);
    expect(res.distance).toBeCloseTo(1);
  });

  /** Instancing nodes build wrappers this way: matrix written by hand, matrixAutoUpdate off. */
  function makeWrapper(x: number, child: THREE.Object3D): THREE.Group {
    const wrapper = new THREE.Group();
    wrapper.matrixAutoUpdate = false;
    wrapper.matrix.compose(new THREE.Vector3(x, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    wrapper.add(child);
    return wrapper;
  }

  it("reads instance positions from local matrices when cached matrixWorld is stale", () => {
    // Arrange — the pack a Set Instance Transform node emits: an outer wrapper
    // with no translation of its own, holding the Array node's offset wrapper.
    // Nothing ever raised matrixWorldNeedsUpdate, so every cached matrixWorld
    // is still identity.
    const target = new THREE.Mesh();
    target.position.set(9, 0, 0);

    const pack = new THREE.Group();
    const nested = [0, 5, 10].map((x) => {
      const outer = makeWrapper(0, makeWrapper(x, new THREE.Mesh()));
      pack.add(outer);
      return outer;
    });

    // Act
    const res = PROXIMITY_OBJECT_NODE.evaluate(
      { target, candidates: pack },
      PROXIMITY_OBJECT_NODE.defaultParams,
      dummyCtx,
    );

    // Assert
    expect(res.index).toBe(2);
    expect(res.object).toBe(nested[2]);
    expect(res.distance).toBeCloseTo(1);
    expect((res.vector as THREE.Vector3).x).toBeCloseTo(10);
  });

  it("indexes list candidates per instance, not per mesh inside them", () => {
    const target = new THREE.Mesh();
    target.position.set(4, 0, 0);

    // Each instance holds two meshes — a per-mesh index would run 0..3.
    const instances = [0, 5].map((x) => {
      const wrapper = makeWrapper(x, new THREE.Mesh());
      wrapper.children[0].add(new THREE.Mesh());
      return wrapper;
    });

    const res = PROXIMITY_OBJECT_NODE.evaluate(
      { target, candidates: instances },
      PROXIMITY_OBJECT_NODE.defaultParams,
      dummyCtx,
    );

    expect(res.index).toBe(1);
    expect(res.object).toBe(instances[1]);
    expect(res.distance).toBeCloseTo(1);
  });

  it("ignores a candidate that merely contains the target when ignoreSelf is true", () => {
    const target = new THREE.Mesh();
    const selfInstance = makeWrapper(0, target);

    const other = makeWrapper(3, new THREE.Mesh());

    const res = PROXIMITY_OBJECT_NODE.evaluate(
      { target, candidates: [selfInstance, other] },
      { ignoreSelf: true },
      dummyCtx,
    );

    expect(res.object).toBe(other);
    expect(res.index).toBe(1);
    expect(res.distance).toBeCloseTo(3);
  });
});
