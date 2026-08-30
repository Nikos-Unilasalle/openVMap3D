import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LOOK_AT_NODE, PIVOT_TRANSFORM_NODE, composeNativeMatrix, composeNativeMatrixWithPivot, composeTransform } from "./transform";
import { markUnusedAxes } from "./vector";
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

  it("marks unused axes and resolves them as no transformation (0 for location/rotation, 1 for scale)", () => {
    const loc = new THREE.Vector3(-1, 5, -1);
    markUnusedAxes(loc, ["x", "z"]);
    const rot = new THREE.Vector3(1.2, -1, -1);
    markUnusedAxes(rot, ["y", "z"]);
    const scl = new THREE.Vector3(2, -1, -1);
    markUnusedAxes(scl, ["y", "z"]);

    const m = composeTransform(loc, rot, scl);
    const { position, scale } = decompose(m);

    expect(position.x).toBeCloseTo(0);
    expect(position.y).toBeCloseTo(5);
    expect(position.z).toBeCloseTo(0);

    expect(scale.x).toBeCloseTo(2);
    expect(scale.y).toBeCloseTo(1);
    expect(scale.z).toBeCloseTo(1);
  });

  it("preserves a real -1 on a used axis instead of treating it as an unused marker", () => {
    // location.x = -1 is a legitimate coordinate; scale.y = -1 is a flip. With
    // no unused-axes mark, both must survive in the composed matrix — and a
    // negative scale is a reflection, which Matrix4.compose records directly
    // in the matrix (determinant < 0) even though decompose() folds the sign
    // into a 180° rotation.
    const loc = new THREE.Vector3(-1, 0, 0);
    const rot = new THREE.Vector3(0, 0, 0);
    const scl = new THREE.Vector3(1, -1, 1);

    const m = composeTransform(loc, rot, scl);

    // Translation: -1 on x must be kept.
    expect(m.elements[12]).toBeCloseTo(-1);
    // Reflection on y: the y-column's yy entry is -1, determinant is negative.
    expect(m.elements[5]).toBeCloseTo(-1);
    expect(m.determinant()).toBeLessThan(0);
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

  it("the wired matrix acts as a parent: its translation stays on world axes even when the object has a rotation of its own", () => {
    // The object is turned -90° about Y — its own local X axis now points
    // along world +Z. A parent that moves +1 on X must still move it +1 on
    // world X: a parent is not re-expressed in its child's frame. Composing
    // the other way round (local × parent) sends it to world -Z instead,
    // which is the "my text's Z motion became Y motion" bug.
    const result = composeNativeMatrix(
      new THREE.Matrix4().makeTranslation(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -Math.PI / 2, 0),
      new THREE.Vector3(1, 1, 1),
    );

    const { position, quaternion } = decompose(result);
    expect(position.x).toBeCloseTo(1, 5);
    expect(position.y).toBeCloseTo(0, 5);
    expect(position.z).toBeCloseTo(0, 5);

    // …and the object keeps the orientation it had before it was parented.
    const ownRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
    expect(quaternion.angleTo(ownRotation)).toBeCloseTo(0, 5);
  });

  it("parent × local round-trips: recovering the local pose by inverting a known parent out of the composed result", () => {
    const location = new THREE.Vector3(1, 2, 3);
    const rotation = new THREE.Vector3(0.1, 0.2, 0.3);
    const scale = new THREE.Vector3(1, 1, 1);
    const parent = new THREE.Matrix4().makeTranslation(4, 5, 6);

    const final = composeNativeMatrix(parent, location, rotation, scale);
    const recoveredLocal = parent.clone().invert().multiply(final);

    const expectedLocal = composeTransform(location, rotation, scale);
    for (let i = 0; i < 16; i++) {
      expect(recoveredLocal.elements[i]).toBeCloseTo(expectedLocal.elements[i], 5);
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

describe("composeNativeMatrixWithPivot", () => {
  it("rotates around the given pivot instead of the local origin", () => {
    const pivot = new THREE.Vector3(0, 2, 0);
    const rotation = new THREE.Vector3(0, 0, Math.PI / 2); // 90° on Z

    const m = composeNativeMatrixWithPivot(undefined, new THREE.Vector3(0, 0, 0), rotation, new THREE.Vector3(1, 1, 1), pivot);

    // A vertex at (3, 2, 0) — offset (3, 0, 0) from pivot (0, 2, 0) — rotates
    // to offset (0, 3, 0) from the pivot, landing at (0, 5, 0).
    const testVec = new THREE.Vector3(3, 2, 0).applyMatrix4(m);
    expect(testVec.x).toBeCloseTo(0, 5);
    expect(testVec.y).toBeCloseTo(5, 5);
    expect(testVec.z).toBeCloseTo(0, 5);
  });

  it("with no pivot (zero), matches plain composeNativeMatrix", () => {
    const location = new THREE.Vector3(1, 2, 3);
    const rotation = new THREE.Vector3(0, Math.PI / 4, 0);
    const scale = new THREE.Vector3(2, 1, 2);

    const plain = composeNativeMatrix(undefined, location, rotation, scale);
    const withZeroPivot = composeNativeMatrixWithPivot(undefined, location, rotation, scale, new THREE.Vector3(0, 0, 0));

    expect(withZeroPivot.toArray().map((n) => Math.round(n * 1e6) / 1e6)).toEqual(
      plain.toArray().map((n) => Math.round(n * 1e6) / 1e6),
    );
  });

  it("location moves the pivoted object without re-introducing origin-pivoted rotation", () => {
    const pivot = new THREE.Vector3(1, 0, 0);
    const location = new THREE.Vector3(5, 0, 0);
    const m = composeNativeMatrixWithPivot(undefined, location, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1), pivot);
    // No rotation/scale: pivot should have zero net effect, this is a pure translation.
    const testVec = new THREE.Vector3(0, 0, 0).applyMatrix4(m);
    expect(testVec.x).toBeCloseTo(5, 5);
    expect(testVec.y).toBeCloseTo(0, 5);
    expect(testVec.z).toBeCloseTo(0, 5);
  });

  it("handles empty inputs safely without throwing or returning NaN", () => {
    const m = composeNativeMatrixWithPivot(undefined, undefined, undefined, undefined, undefined);
    expect(m).toBeInstanceOf(THREE.Matrix4);
    for (const el of m.elements) expect(Number.isFinite(el)).toBe(true);
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
