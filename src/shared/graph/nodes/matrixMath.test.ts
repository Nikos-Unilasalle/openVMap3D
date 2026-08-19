import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MATRIX_MATH_NODE } from "./matrixMath";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "matrix-math-test" };

const run = (inputs: Record<string, unknown>, op: string, factor?: number) =>
  MATRIX_MATH_NODE.evaluate(
    inputs,
    { ...MATRIX_MATH_NODE.defaultParams, op, ...(factor !== undefined ? { factor } : {}) },
    CTX,
  );

const translation = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const rotationY = (deg: number) => new THREE.Matrix4().makeRotationY((deg * Math.PI) / 180);
const scaling = (s: number) => new THREE.Matrix4().makeScale(s, s, s);

/** Where a matrix sends the origin — the readable way to assert a transform. */
const originGoesTo = (m: THREE.Matrix4) => new THREE.Vector3(0, 0, 0).applyMatrix4(m);

describe("MATRIX_MATH_NODE", () => {
  describe("multiply", () => {
    it("applies B first, then A", () => {
      // Rotate 90° about Y, then translate: the translation is in world axes,
      // so the point lands at the translation itself.
      const out = run({ a: translation(10, 0, 0), b: rotationY(90) }, "multiply").out as THREE.Matrix4;
      const p = new THREE.Vector3(1, 0, 0).applyMatrix4(out);
      expect(p.x).toBeCloseTo(10);
      expect(p.z).toBeCloseTo(-1);
    });

    it("is not the same as the reverse order", () => {
      const inputs = { a: translation(10, 0, 0), b: rotationY(90) };
      const forward = originGoesTo(run(inputs, "multiply").out as THREE.Matrix4);
      const reverse = originGoesTo(run(inputs, "multiply-reverse").out as THREE.Matrix4);
      expect(forward.x).toBeCloseTo(10);
      // B × A rotates the translation, so the origin ends up on -Z instead.
      expect(reverse.x).toBeCloseTo(0, 5);
      expect(reverse.z).toBeCloseTo(-10);
    });

    it("treats an unwired socket as identity", () => {
      const out = run({ a: translation(3, 4, 5) }, "multiply").out as THREE.Matrix4;
      const p = originGoesTo(out);
      expect([p.x, p.y, p.z]).toEqual([3, 4, 5]);
    });
  });

  describe("inverse", () => {
    it("undoes a transform", () => {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(5, -2, 1),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.7, -0.2)),
        new THREE.Vector3(2, 2, 2),
      );
      const inv = run({ a: m }, "inverse").out as THREE.Matrix4;
      const roundTrip = new THREE.Vector3(1, 2, 3).applyMatrix4(m).applyMatrix4(inv);
      expect(roundTrip.x).toBeCloseTo(1);
      expect(roundTrip.y).toBeCloseTo(2);
      expect(roundTrip.z).toBeCloseTo(3);
    });

    it("returns identity — not a zero matrix — for a singular input", () => {
      // A zero scale on one axis has no inverse. three's invert() answers with
      // the zero matrix, which would collapse everything downstream onto the
      // origin and read as "my object disappeared".
      const flat = new THREE.Matrix4().makeScale(1, 0, 1);
      const out = run({ a: flat }, "inverse").out as THREE.Matrix4;
      const p = new THREE.Vector3(2, 3, 4).applyMatrix4(out);
      expect([p.x, p.y, p.z]).toEqual([2, 3, 4]);
      expect(out.determinant()).toBeCloseTo(1);
    });
  });

  describe("delta", () => {
    it("gives the transform that takes A onto B", () => {
      const a = translation(1, 2, 3);
      const b = translation(4, 6, 8);
      const delta = run({ a, b }, "delta").out as THREE.Matrix4;
      // Applying the delta after A must land exactly on B.
      const composed = new THREE.Matrix4().multiplyMatrices(a, delta);
      const p = originGoesTo(composed);
      expect(p.x).toBeCloseTo(4);
      expect(p.y).toBeCloseTo(6);
      expect(p.z).toBeCloseTo(8);
    });

    it("is identity when both sides are the same", () => {
      const m = rotationY(37);
      const delta = run({ a: m, b: m }, "delta").out as THREE.Matrix4;
      expect(delta.elements.map((e) => Math.round(e * 1e6) / 1e6)).toEqual(
        new THREE.Matrix4().elements.map((e) => Math.round(e * 1e6) / 1e6),
      );
    });
  });

  describe("transpose", () => {
    it("inverts a pure rotation", () => {
      const rot = rotationY(50);
      const out = run({ a: rot }, "transpose").out as THREE.Matrix4;
      const roundTrip = new THREE.Vector3(1, 0, 0).applyMatrix4(rot).applyMatrix4(out);
      expect(roundTrip.x).toBeCloseTo(1);
      expect(roundTrip.z).toBeCloseTo(0, 5);
    });
  });

  describe("mix", () => {
    it("lands on each end at 0 and 1", () => {
      const a = translation(0, 0, 0);
      const b = translation(10, 0, 0);
      expect(originGoesTo(run({ a, b }, "mix", 0).out as THREE.Matrix4).x).toBeCloseTo(0);
      expect(originGoesTo(run({ a, b }, "mix", 1).out as THREE.Matrix4).x).toBeCloseTo(10);
    });

    it("interpolates position halfway", () => {
      const out = run({ a: translation(0, 0, 0), b: translation(10, 20, -4) }, "mix", 0.5)
        .out as THREE.Matrix4;
      const p = originGoesTo(out);
      expect(p.x).toBeCloseTo(5);
      expect(p.y).toBeCloseTo(10);
      expect(p.z).toBeCloseTo(-2);
    });

    it("slerps the rotation instead of averaging the numbers", () => {
      // Halfway between 0° and 90° about Y must be a true 45° rotation, so the
      // vector it produces still has unit length. A naive element-wise blend
      // shrinks it to about 0.92 here.
      const out = run({ a: rotationY(0), b: rotationY(90) }, "mix", 0.5).out as THREE.Matrix4;
      const v = new THREE.Vector3(1, 0, 0).applyMatrix4(out);
      expect(v.length()).toBeCloseTo(1, 5);
      expect(v.x).toBeCloseTo(Math.cos(Math.PI / 4), 4);
      expect(v.z).toBeCloseTo(-Math.sin(Math.PI / 4), 4);
    });

    it("keeps scale uniform through the blend", () => {
      const out = run({ a: scaling(1), b: scaling(3) }, "mix", 0.5).out as THREE.Matrix4;
      const s = new THREE.Vector3();
      out.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      expect(s.x).toBeCloseTo(2);
      expect(s.y).toBeCloseTo(2);
      expect(s.z).toBeCloseTo(2);
    });

    it("clamps the factor so a blend can't turn the object inside out", () => {
      const a = scaling(1);
      const b = scaling(3);
      const past = run({ a, b, factor: 5 }, "mix").out as THREE.Matrix4;
      const before = run({ a, b, factor: -5 }, "mix").out as THREE.Matrix4;
      const s = new THREE.Vector3();
      past.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      expect(s.x).toBeCloseTo(3);
      before.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      expect(s.x).toBeCloseTo(1);
    });

    it("takes the factor from the wired socket over the param", () => {
      const a = translation(0, 0, 0);
      const b = translation(10, 0, 0);
      const out = MATRIX_MATH_NODE.evaluate(
        { a, b, factor: 0.25 },
        { ...MATRIX_MATH_NODE.defaultParams, op: "mix", factor: 0.9 },
        CTX,
      ).out as THREE.Matrix4;
      expect(originGoesTo(out).x).toBeCloseTo(2.5);
    });
  });

  it("reports the determinant of what it produced", () => {
    expect(run({ a: scaling(2) }, "multiply").determinant).toBeCloseTo(8);
    expect(run({ a: rotationY(33) }, "multiply").determinant).toBeCloseTo(1);
  });

  it("falls back to multiply for an unknown operation", () => {
    const out = MATRIX_MATH_NODE.evaluate(
      { a: translation(1, 0, 0), b: translation(2, 0, 0) },
      { ...MATRIX_MATH_NODE.defaultParams, op: "nonsense" },
      CTX,
    ).out as THREE.Matrix4;
    expect(originGoesTo(out).x).toBeCloseTo(3);
  });
});
