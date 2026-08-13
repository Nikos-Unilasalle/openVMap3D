import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { composeNativeMatrix, composeTransform } from "./transform";

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
    // Base: rotated 90° around Y, so its local +X axis points along world -Z.
    const base = composeNativeMatrix(
      undefined,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, Math.PI / 2, 0),
      new THREE.Vector3(1, 1, 1),
    );
    // A delta that just translates 1 unit along local +X.
    const delta = new THREE.Matrix4().makeTranslation(1, 0, 0);

    const result = composeNativeMatrix(
      delta,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, Math.PI / 2, 0),
      new THREE.Vector3(1, 1, 1),
    );

    // The delta's translation is expressed in the base's local frame — with
    // the base rotated 90° around Y, local +X maps to world -Z, not world +X.
    const { position } = decompose(result);
    expect(position.x).toBeCloseTo(0, 5);
    expect(position.z).toBeCloseTo(-1, 5);
    void base; // establishes the rotation this expectation depends on, kept for readability
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
