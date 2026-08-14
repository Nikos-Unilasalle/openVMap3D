import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LOOK_AT_NODE, PIVOT_TRANSFORM_NODE, composeNativeMatrix, composeTransform } from "./transform";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "test" };

function decompose(m: THREE.Matrix4) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

describe("composeTransform", () => {
  it("matches THREE's own compose for a plain LSR triple", () => {
    const location = new THREE.Vector3(1, 2, 3);
    const rotation = new THREE.Vector3(0, Math.PI / 2, 0);
    const scale = new THREE.Vector3(2, 2, 2);

    const expected = new THREE.Matrix4().compose(
      location,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z)),
      scale,
    );

    expect(composeTransform(location, rotation, scale).toArray()).toEqual(expected.toArray());
  });

  it("an identity LSR triple produces the identity matrix", () => {
    const m = composeTransform(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
    expect(m.toArray()).toEqual(new THREE.Matrix4().toArray());
  });
});

describe("composeNativeMatrix", () => {
  it("with nothing wired in (delta = identity), the result is exactly the native base pose", () => {
    const location = new THREE.Vector3(5, 0, 0);
    const rotation = new THREE.Vector3(0, 0, 0);
    const scale = new THREE.Vector3(1, 1, 1);

    const result = composeNativeMatrix(undefined, location, rotation, scale);
    const { position } = decompose(result);

    expect(position.x).toBeCloseTo(5);
  });

  it("a wired delta modifies the base without cancelling it — a translation delta moves relative to the base's own local axes", () => {
    const base = composeNativeMatrix(
      undefined,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, Math.PI / 2, 0),
      new THREE.Vector3(1, 1, 1),
    );
    const delta = new THREE.Matrix4().makeTranslation(1, 0, 0);

    const result = composeNativeMatrix(
      delta,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, Math.PI / 2, 0),
      new THREE.Vector3(1, 1, 1),
    );

    const { position } = decompose(result);
    expect(position.x).toBeCloseTo(0, 5);
    expect(position.z).toBeCloseTo(-1, 5);
    void base;
  });

  it("base × delta round-trips: recovering the base by inverting a known delta out of the composed result", () => {
    const location = new THREE.Vector3(1, 2, 3);
    const rotation = new THREE.Vector3(0.1, 0.2, 0.3);
    const scale = new THREE.Vector3(1, 1, 1);
    const delta = new THREE.Matrix4().makeTranslation(4, 5, 6);

    const final = composeNativeMatrix(delta, location, rotation, scale);
    const recoveredBase = final.clone().multiply(delta.clone().invert());

    const expectedBase = composeTransform(location, rotation, scale);
    for (let i = 0; i < 16; i++) {
      expect(recoveredBase.elements[i]).toBeCloseTo(expectedBase.elements[i], 5);
    }
  });

  it("treats a non-Matrix4 wired value the same as nothing wired (identity delta)", () => {
    const location = new THREE.Vector3(1, 1, 1);
    const rotation = new THREE.Vector3(0, 0, 0);
    const scale = new THREE.Vector3(1, 1, 1);

    const withGarbage = composeNativeMatrix("not-a-matrix", location, rotation, scale);
    const withNothing = composeNativeMatrix(undefined, location, rotation, scale);

    expect(withGarbage.toArray()).toEqual(withNothing.toArray());
  });

  it("falls back to identity location/rotation and unit scale when params are missing", () => {
    const result = composeNativeMatrix(undefined, undefined, undefined, undefined);
    expect(result.toArray()).toEqual(new THREE.Matrix4().toArray());
  });
});

describe("PIVOT_TRANSFORM_NODE", () => {
  it("rotates around an arbitrary pivot point", () => {
    const pivot = new THREE.Vector3(0, 2, 0);
    const rotation = new THREE.Vector3(0, 0, Math.PI / 2); // 90° rotation on Z
    const result = PIVOT_TRANSFORM_NODE.evaluate(
      { pivot, rotation },
      PIVOT_TRANSFORM_NODE.defaultParams,
      CTX,
    );

    const m = result.matrix as THREE.Matrix4;

    // Transform a point originally at (3, 2, 0) — relative offset (3, 0, 0) from pivot (0, 2, 0)
    const testVec = new THREE.Vector3(3, 2, 0).applyMatrix4(m);

    // Rotating (3, 0) by +90° gives (0, 3). Adding pivot (0, 2) gives (0, 5, 0).
    expect(testVec.x).toBeCloseTo(0, 5);
    expect(testVec.y).toBeCloseTo(5, 5);
    expect(testVec.z).toBeCloseTo(0, 5);
  });

  it("handles empty inputs safely without throwing or returning NaN", () => {
    const result = PIVOT_TRANSFORM_NODE.evaluate({}, PIVOT_TRANSFORM_NODE.defaultParams, CTX);
    expect(result.matrix).toBeInstanceOf(THREE.Matrix4);
    const elements = (result.matrix as THREE.Matrix4).elements;
    for (const el of elements) {
      expect(Number.isFinite(el)).toBe(true);
    }
  });
});

describe("LOOK_AT_NODE", () => {
  it("accepts Object3D geometry as input and returns transformed geometry and orientation matrix", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.position.set(0, 0, 10);

    const targetObj = new THREE.Mesh();
    targetObj.position.set(0, 0, 0);

    const res = LOOK_AT_NODE.evaluate(
      { geometry: box, target: targetObj },
      LOOK_AT_NODE.defaultParams,
      CTX,
    );

    expect(res.geometry).toBeInstanceOf(THREE.Group);
    expect(res.matrix).toBeInstanceOf(THREE.Matrix4);
    const mat = res.matrix as THREE.Matrix4;
    const pos = new THREE.Vector3();
    mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    expect(pos.z).toBeCloseTo(10);
  });
});
