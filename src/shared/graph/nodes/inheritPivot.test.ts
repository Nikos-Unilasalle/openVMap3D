import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { composeNativeMatrix, composeNativeMatrixWithPivot, composeTransform } from "./transform";

const ZERO = new THREE.Vector3(0, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);

function read(m: THREE.Matrix4) {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  // Read the angle off the quaternion, never off the matrix: Euler's
  // setFromRotationMatrix assumes an unscaled basis and reports noise for a
  // matrix that carries scale.
  const euler = new THREE.Euler().setFromQuaternion(quat);
  return { pos, scale, rotY: (euler.y * 180) / Math.PI };
}

/** A parent at the origin with a uniform scale — the reported case. */
const scalingParent = (s: number) =>
  composeTransform(ZERO, ZERO, new THREE.Vector3(s, s, s));

/** A parent at the origin turning about Y. */
const turningParent = (deg: number) =>
  composeTransform(ZERO, new THREE.Vector3(0, (deg * Math.PI) / 180, 0), ONE);

const CHILD_AT_3 = new THREE.Vector3(3, 0, 0);

describe("inherit pivot modes", () => {
  it("defaults to plain parenting, identical to composing the two matrices", () => {
    // The guarantee that every saved scene renders as it did: with no modes
    // set, this must be exactly parent × local, matrix element for element.
    const parent = composeTransform(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0.3, 0.4, 0.5), new THREE.Vector3(2, 2, 2));
    const loc = new THREE.Vector3(3, -1, 2);
    const rot = new THREE.Vector3(0.1, 0.2, 0.3);
    const scl = new THREE.Vector3(1.5, 0.5, 1);

    const expected = new THREE.Matrix4().multiplyMatrices(parent, composeTransform(loc, rot, scl));

    for (const params of [undefined, {}, { inheritRotation: "parent", inheritScale: "parent" }]) {
      const got = composeNativeMatrix(parent, loc, rot, scl, params);
      for (let i = 0; i < 16; i++) expect(got.elements[i]).toBeCloseTo(expected.elements[i], 10);
    }
  });

  it('scale "self": the child grows on the spot instead of being pushed away', () => {
    // The reported symptom: a plane at x=3 parented to one scaling 0.1 -> 1
    // was dragged toward the parent's origin as it shrank.
    for (const s of [0.1, 0.5, 1]) {
      const parentPivot = read(composeNativeMatrix(scalingParent(s), CHILD_AT_3, ZERO, ONE));
      expect(parentPivot.pos.x).toBeCloseTo(3 * s, 6);

      const selfPivot = read(
        composeNativeMatrix(scalingParent(s), CHILD_AT_3, ZERO, ONE, { inheritScale: "self" }),
      );
      expect(selfPivot.pos.x).toBeCloseTo(3, 6); // stays put
      expect(selfPivot.scale.x).toBeCloseTo(s, 6); // still follows the animation
    }
  });

  it('rotation "self": the child spins where it stands instead of orbiting', () => {
    const orbiting = read(composeNativeMatrix(turningParent(90), CHILD_AT_3, ZERO, ONE));
    expect(orbiting.pos.x).toBeCloseTo(0, 6);
    expect(orbiting.pos.z).toBeCloseTo(-3, 6); // swung a quarter turn around the parent

    const spinning = read(
      composeNativeMatrix(turningParent(90), CHILD_AT_3, ZERO, ONE, { inheritRotation: "self" }),
    );
    expect(spinning.pos.x).toBeCloseTo(3, 6);
    expect(spinning.pos.z).toBeCloseTo(0, 6);
    expect(spinning.rotY).toBeCloseTo(90, 4); // took the turn, applied in place
  });

  it('"none" drops the channel while the child still follows the parent about', () => {
    const moving = composeTransform(new THREE.Vector3(5, 0, 0), new THREE.Vector3(0, Math.PI / 2, 0), new THREE.Vector3(4, 4, 4));
    const got = read(
      composeNativeMatrix(moving, CHILD_AT_3, ZERO, ONE, { inheritRotation: "none", inheritScale: "none" }),
    );
    // Position is always inherited — that is what following a parent means.
    expect(got.pos.x).toBeCloseTo(8, 6);
    expect(got.scale.x).toBeCloseTo(1, 6);
    expect(got.rotY).toBeCloseTo(0, 4);
  });

  it("mixes the two channels independently", () => {
    // Orbit the parent, but keep your own size: the combination neither plain
    // parenting nor ignoring the parent can express.
    const parent = new THREE.Matrix4().multiplyMatrices(turningParent(90), scalingParent(2));
    const got = read(
      composeNativeMatrix(parent, CHILD_AT_3, ZERO, ONE, { inheritRotation: "parent", inheritScale: "self" }),
    );
    expect(got.pos.x).toBeCloseTo(0, 6);
    expect(got.pos.z).toBeCloseTo(-3, 6); // swung round, and NOT pushed out to 6
    expect(got.scale.x).toBeCloseTo(2, 6); // grew, in place
  });

  it("keeps the child's own rotation and scale on top of the inherited half", () => {
    const got = read(
      composeNativeMatrix(
        scalingParent(2),
        CHILD_AT_3,
        new THREE.Vector3(0, Math.PI / 4, 0),
        new THREE.Vector3(3, 3, 3),
        { inheritScale: "self" },
      ),
    );
    expect(got.pos.x).toBeCloseTo(3, 6);
    expect(got.scale.x).toBeCloseTo(6, 6); // the child's own 3, doubled by the parent
    expect(got.rotY).toBeCloseTo(45, 4); // the child's own turn, untouched
  });

  it("the pivot variant defaults to plain parenting too", () => {
    const parent = composeTransform(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(2, 2, 2));
    const args = [parent, CHILD_AT_3, new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(1.5, 1.5, 1.5), new THREE.Vector3(0.5, 0, 0)] as const;

    const withModes = composeNativeMatrixWithPivot(...args, { inheritRotation: "parent", inheritScale: "parent" });
    const without = composeNativeMatrixWithPivot(...args);
    for (let i = 0; i < 16; i++) expect(withModes.elements[i]).toBeCloseTo(without.elements[i], 10);
  });

  it("the pivot variant honours a self-pivot scale", () => {
    const got = read(
      composeNativeMatrixWithPivot(scalingParent(0.25), CHILD_AT_3, ZERO, ONE, ZERO, { inheritScale: "self" }),
    );
    expect(got.pos.x).toBeCloseTo(3, 6);
    expect(got.scale.x).toBeCloseTo(0.25, 6);
  });

  it("treats an unknown mode as plain parenting rather than throwing", () => {
    // Modes arrive from saved .tsuji files, so a stale or hand-edited value
    // must degrade to the default instead of breaking the scene.
    const got = composeNativeMatrix(scalingParent(2), CHILD_AT_3, ZERO, ONE, {
      inheritRotation: "nonsense",
      inheritScale: 42,
    });
    const expected = new THREE.Matrix4().multiplyMatrices(scalingParent(2), composeTransform(CHILD_AT_3, ZERO, ONE));
    for (let i = 0; i < 16; i++) expect(got.elements[i]).toBeCloseTo(expected.elements[i], 10);
  });
});
