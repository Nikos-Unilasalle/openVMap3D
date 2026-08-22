import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { fbm1D, fbm3D, simplexNoise1D } from "../../math/noise";
import { WIGGLE_NODE, WIGGLE_NUMBER_NODE, WIGGLE_VECTOR_NODE } from "./wiggle";
import { EvalContext } from "../types";

const mockCtx: EvalContext = {
  time: 1.5,
  step: 90,
  nodeId: "wiggle1",
};

describe("Procedural Noise & fBm", () => {
  test("simplexNoise1D outputs smooth values in bounded range", () => {
    const val1 = simplexNoise1D(0.0, 42);
    const val2 = simplexNoise1D(0.0, 42);
    expect(val1).toBe(val2); // Deterministic

    const valDiff = simplexNoise1D(0.0, 99);
    expect(val1).not.toBe(valDiff); // Seed variation

    for (let t = 0; t < 10; t += 0.25) {
      const v = simplexNoise1D(t, 12);
      expect(v).toBeGreaterThanOrEqual(-2.0);
      expect(v).toBeLessThanOrEqual(2.0);
    }
  });

  test("fbm1D computes multi-octave normalized noise", () => {
    const v1 = fbm1D(1.0, 0, 4, 0.5, 2.0);
    expect(v1).toBeGreaterThanOrEqual(-1.5);
    expect(v1).toBeLessThanOrEqual(1.5);
  });

  test("fbm3D generates decorrelated 3D coordinates", () => {
    const vec = fbm3D(2.5, 7, 3, 0.5, 2.0);
    expect(vec.x).not.toBe(vec.y);
    expect(vec.y).not.toBe(vec.z);
    expect(vec.x).toBeGreaterThanOrEqual(-1.5);
    expect(vec.x).toBeLessThanOrEqual(1.5);
  });
});

describe("WIGGLE NODE (Animation Nodes)", () => {
  test("evaluates scalar, vector, rotation, scale, and matrix outputs", () => {
    const res = WIGGLE_NODE.evaluate(
      {},
      WIGGLE_NODE.defaultParams,
      mockCtx
    );

    expect(typeof res.value).toBe("number");
    expect(res.vector).toBeInstanceOf(THREE.Vector3);
    expect(res.rotation).toBeInstanceOf(THREE.Vector3);
    expect(res.scale).toBeInstanceOf(THREE.Vector3);
    expect(res.matrix).toBeInstanceOf(THREE.Matrix4);
  });

  test("respects evolution, speed, and amplitude modulation", () => {
    const resBase = WIGGLE_NODE.evaluate(
      { speed: 1.0, amplitude: 1.0 },
      WIGGLE_NODE.defaultParams,
      mockCtx
    );

    const resAmp = WIGGLE_NODE.evaluate(
      { speed: 1.0, amplitude: 5.0 },
      WIGGLE_NODE.defaultParams,
      mockCtx
    );

    // Scaling amplitude multiplies displacement
    expect(Math.abs(Number(resAmp.value))).toBeCloseTo(Math.abs(Number(resBase.value)) * 5, 4);
  });

  test("applies baseVector and offset", () => {
    const res = WIGGLE_NODE.evaluate(
      {
        offset: 10,
        baseVector: new THREE.Vector3(100, 200, 300),
      },
      WIGGLE_NODE.defaultParams,
      mockCtx
    );

    expect(Number(res.value)).toBeGreaterThan(8);
    expect(Number(res.value)).toBeLessThan(12);

    const vec = res.vector as THREE.Vector3;
    expect(vec.x).toBeGreaterThan(98);
    expect(vec.y).toBeGreaterThan(198);
    expect(vec.z).toBeGreaterThan(298);
  });

  test("composes cleanly with upstream matrix", () => {
    const parentMat = new THREE.Matrix4().makeTranslation(50, 0, 0);
    const res = WIGGLE_NODE.evaluate(
      { matrix: parentMat },
      WIGGLE_NODE.defaultParams,
      mockCtx
    );

    const mat = res.matrix as THREE.Matrix4;
    const pos = new THREE.Vector3();
    pos.setFromMatrixPosition(mat);
    expect(pos.x).toBeGreaterThan(45);
    expect(pos.x).toBeLessThan(55);
  });
});

describe("Specialized Wiggle Nodes", () => {
  test("Wiggle Number evaluates float output", () => {
    const res = WIGGLE_NUMBER_NODE.evaluate(
      { evolution: 0.5, amplitude: 2.5, offset: 1.0 },
      WIGGLE_NUMBER_NODE.defaultParams,
      mockCtx
    );
    expect(typeof res.value).toBe("number");
  });

  test("Wiggle Vector evaluates 3D vector output", () => {
    const res = WIGGLE_VECTOR_NODE.evaluate(
      { evolution: 0.5, amplitude: new THREE.Vector3(2, 4, 6) },
      WIGGLE_VECTOR_NODE.defaultParams,
      mockCtx
    );
    expect(res.vector).toBeInstanceOf(THREE.Vector3);
    const v = res.vector as THREE.Vector3;
    expect(Number.isFinite(v.x)).toBe(true);
    expect(Number.isFinite(v.y)).toBe(true);
    expect(Number.isFinite(v.z)).toBe(true);
  });
});

describe("WIGGLE_VECTOR_NODE — Individual Points mode", () => {
  test("wiring Points wiggles each point independently around its own position", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0), new THREE.Vector3(-10, 0, 0)];
    const res = WIGGLE_VECTOR_NODE.evaluate(
      { evolution: 1.3, amplitude: new THREE.Vector3(1, 1, 1), points },
      WIGGLE_VECTOR_NODE.defaultParams,
      mockCtx,
    );
    const out = res.points as THREE.Vector3[];
    expect(out).toHaveLength(3);
    // Each stays near its OWN base point, not collapsed to a shared origin.
    expect(out[1].x).toBeGreaterThan(5);
    expect(out[2].x).toBeLessThan(-5);
    // Different points, same evolution -> different noise samples (not all
    // three wiggling in lockstep).
    const offset0 = out[0].clone().sub(points[0]);
    const offset1 = out[1].clone().sub(points[1]);
    expect(offset0.distanceTo(offset1)).toBeGreaterThan(1e-6);
  });

  test("a masked-out point (mask 0) is held exactly at its base position — no wiggle at all", () => {
    const points = [new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 5, 6)];
    const res = WIGGLE_VECTOR_NODE.evaluate(
      { evolution: 2.7, amplitude: new THREE.Vector3(5, 5, 5), points, mask: [1, 0] },
      WIGGLE_VECTOR_NODE.defaultParams,
      mockCtx,
    );
    const out = res.points as THREE.Vector3[];
    expect(out[1].x).toBe(4);
    expect(out[1].y).toBe(5);
    expect(out[1].z).toBe(6);
  });

  test("rest of the object stays rigid across time while a masked-in point keeps moving", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(9, 9, 9)];
    const positionsOfHeld: THREE.Vector3[] = [];
    let sawMovement = false;
    for (let t = 0; t < 5; t++) {
      const res = WIGGLE_VECTOR_NODE.evaluate(
        { evolution: t * 0.7, amplitude: new THREE.Vector3(3, 3, 3), points, mask: [1, 0] },
        WIGGLE_VECTOR_NODE.defaultParams,
        mockCtx,
      );
      const out = res.points as THREE.Vector3[];
      positionsOfHeld.push(out[1].clone());
      if (!out[0].equals(points[0])) sawMovement = true;
    }
    expect(sawMovement).toBe(true);
    for (const p of positionsOfHeld) expect(p.equals(points[1])).toBe(true);
  });
});
