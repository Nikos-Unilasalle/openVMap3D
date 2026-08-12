import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { EvalContext } from "../types";
import { MAP_RANGE_NODE, VALUE_MATH_NODE } from "./valueMath";
import { TRANSFORM_NODE, DECOMPOSE_MATRIX_NODE } from "./transform";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "test" };

describe("VALUE_MATH_NODE", () => {
  test("adds by default", () => {
    expect(VALUE_MATH_NODE.evaluate({ a: 2, b: 3 }, VALUE_MATH_NODE.defaultParams, CTX).out).toBe(5);
  });

  test("switches operation via the op param", () => {
    const params = { ...VALUE_MATH_NODE.defaultParams, op: "multiply" };
    expect(VALUE_MATH_NODE.evaluate({ a: 4, b: 5 }, params, CTX).out).toBe(20);
  });

  test("divide by zero is 0, not Infinity or NaN — a live signal hitting this must not poison downstream nodes", () => {
    const params = { ...VALUE_MATH_NODE.defaultParams, op: "divide" };
    const result = VALUE_MATH_NODE.evaluate({ a: 5, b: 0 }, params, CTX).out;

    expect(result).toBe(0);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe("MAP_RANGE_NODE", () => {
  test("rescales the midpoint of the input range to the midpoint of the output range", () => {
    const params = { inMin: 0, inMax: 10, outMin: 100, outMax: 200, clamp: 1 };
    expect(MAP_RANGE_NODE.evaluate({ value: 5 }, params, CTX).out).toBe(150);
  });

  test("clamps to the output range by default", () => {
    const params = { inMin: 0, inMax: 1, outMin: 0, outMax: 1, clamp: 1 };
    expect(MAP_RANGE_NODE.evaluate({ value: 5 }, params, CTX).out).toBe(1);
    expect(MAP_RANGE_NODE.evaluate({ value: -5 }, params, CTX).out).toBe(0);
  });

  test("extrapolates past the range when clamp is off", () => {
    const params = { inMin: 0, inMax: 1, outMin: 0, outMax: 10, clamp: 0 };
    expect(MAP_RANGE_NODE.evaluate({ value: 2 }, params, CTX).out).toBe(20);
  });

  test("a zero-width input range does not divide by zero", () => {
    const params = { inMin: 5, inMax: 5, outMin: 0, outMax: 1, clamp: 1 };
    const result = MAP_RANGE_NODE.evaluate({ value: 5 }, params, CTX).out as number;

    expect(Number.isFinite(result)).toBe(true);
  });
});

describe("TRANSFORM_NODE / DECOMPOSE_MATRIX_NODE round trip", () => {
  test("composing then decomposing returns the original location/rotation/scale", () => {
    const location = new THREE.Vector3(1, 2, 3);
    const rotation = new THREE.Vector3(0.1, 0.4, -0.2);
    const scale = new THREE.Vector3(2, 0.5, 1);

    const { matrix } = TRANSFORM_NODE.evaluate({ location, rotation, scale }, TRANSFORM_NODE.defaultParams, CTX);
    const decomposed = DECOMPOSE_MATRIX_NODE.evaluate({ matrix }, {}, CTX);

    expect((decomposed.location as THREE.Vector3).x).toBeCloseTo(location.x);
    expect((decomposed.location as THREE.Vector3).y).toBeCloseTo(location.y);
    expect((decomposed.scale as THREE.Vector3).x).toBeCloseTo(scale.x);
    expect((decomposed.scale as THREE.Vector3).y).toBeCloseTo(scale.y);
    expect((decomposed.rotation as THREE.Vector3).x).toBeCloseTo(rotation.x);
    expect((decomposed.rotation as THREE.Vector3).y).toBeCloseTo(rotation.y);
  });

  test("an unconnected transform defaults to identity — origin, no rotation, unit scale", () => {
    const { matrix } = TRANSFORM_NODE.evaluate({}, TRANSFORM_NODE.defaultParams, CTX);

    expect((matrix as THREE.Matrix4).equals(new THREE.Matrix4())).toBe(true);
  });
});
