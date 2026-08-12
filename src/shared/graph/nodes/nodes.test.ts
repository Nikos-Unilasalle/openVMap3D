import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { EvalContext } from "../types";
import { MAP_RANGE_NODE, VALUE_MATH_NODE } from "./valueMath";
import { TRANSFORM_NODE, DECOMPOSE_MATRIX_NODE, PARENT_NODE, LOOK_AT_NODE } from "./transform";
import { VECTOR_MATH_NODE } from "./vector";
import { COMPARE_NODE, BOOLEAN_LOGIC_NODE, TRIGGER_NODE, TOGGLE_NODE, GATE_NODE } from "./logic";
import { OSCILLATOR_NODE, ENVELOPE_NODE } from "./oscillator";
import { COLOR_COMPOSE_NODE, COLOR_DECOMPOSE_NODE, COLOR_MATH_NODE } from "./color";
import { OBJECT_PLANE_NODE, OBJECT_SPHERE_NODE } from "./object";
import { COLOR_TO_VECTOR_NODE, VALUE_TO_COLOR_NODE, VALUE_TO_VECTOR_NODE, VECTOR_TO_COLOR_NODE } from "./converter";

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

describe("VECTOR_MATH_NODE", () => {
  test("vector addition", () => {
    const a = new THREE.Vector3(1, 2, 3);
    const b = new THREE.Vector3(4, 5, 6);
    const res = VECTOR_MATH_NODE.evaluate({ a, b }, { op: "add" }, CTX).out as THREE.Vector3;
    expect(res.x).toBe(5);
    expect(res.y).toBe(7);
    expect(res.z).toBe(9);
  });

  test("dot product", () => {
    const a = new THREE.Vector3(1, 0, 0);
    const b = new THREE.Vector3(0, 1, 0);
    const val = VECTOR_MATH_NODE.evaluate({ a, b }, { op: "dot" }, CTX).val as number;
    expect(val).toBe(0);
  });

  test("safe division by zero", () => {
    const a = new THREE.Vector3(10, 10, 10);
    const b = new THREE.Vector3(0, 2, 0);
    const res = VECTOR_MATH_NODE.evaluate({ a, b }, { op: "divide" }, CTX).out as THREE.Vector3;
    expect(res.x).toBe(0);
    expect(res.y).toBe(5);
    expect(res.z).toBe(0);
  });
});

describe("PARENT_NODE & LOOK_AT_NODE", () => {
  test("parent matrix multiplication", () => {
    const parentMat = new THREE.Matrix4().makeTranslation(10, 0, 0);
    const childMat = new THREE.Matrix4().makeTranslation(0, 5, 0);
    const res = PARENT_NODE.evaluate({ parent: parentMat, child: childMat }, {}, CTX).matrix as THREE.Matrix4;

    const pos = new THREE.Vector3();
    pos.setFromMatrixPosition(res);
    expect(pos.x).toBe(10);
    expect(pos.y).toBe(5);
  });

  test("look at matrix generation", () => {
    const eye = new THREE.Vector3(0, 0, 10);
    const target = new THREE.Vector3(0, 0, 0);
    const up = new THREE.Vector3(0, 1, 0);
    const res = LOOK_AT_NODE.evaluate({ eye, target, up }, {}, CTX).matrix as THREE.Matrix4;
    expect(res).toBeInstanceOf(THREE.Matrix4);
  });
});

describe("LOGIC NODES", () => {
  test("compare node", () => {
    expect(COMPARE_NODE.evaluate({ a: 5, b: 3 }, { op: "greater" }, CTX).out).toBe(1);
    expect(COMPARE_NODE.evaluate({ a: 2, b: 3 }, { op: "greater" }, CTX).out).toBe(0);
  });

  test("boolean logic node", () => {
    expect(BOOLEAN_LOGIC_NODE.evaluate({ a: 1, b: 1 }, { op: "and" }, CTX).out).toBe(1);
    expect(BOOLEAN_LOGIC_NODE.evaluate({ a: 1, b: 0 }, { op: "and" }, CTX).out).toBe(0);
    expect(BOOLEAN_LOGIC_NODE.evaluate({ a: 0 }, { op: "not" }, CTX).out).toBe(1);
  });

  test("trigger node rising edge detection", () => {
    const ctxTrigger: EvalContext = { time: 0, step: 0, nodeId: "trig-1" };
    expect(TRIGGER_NODE.evaluate({ in: 0 }, {}, ctxTrigger).trigger).toBe(0);
    expect(TRIGGER_NODE.evaluate({ in: 1 }, {}, ctxTrigger).trigger).toBe(1);
    expect(TRIGGER_NODE.evaluate({ in: 1 }, {}, ctxTrigger).trigger).toBe(0);
  });

  test("toggle flip flop", () => {
    const ctxTog: EvalContext = { time: 0, step: 0, nodeId: "tog-1" };
    expect(TOGGLE_NODE.evaluate({ trigger: 0 }, { initial: 0 }, ctxTog).out).toBe(0);
    expect(TOGGLE_NODE.evaluate({ trigger: 1 }, { initial: 0 }, ctxTog).out).toBe(1);
    expect(TOGGLE_NODE.evaluate({ trigger: 1 }, { initial: 0 }, ctxTog).out).toBe(1);
    expect(TOGGLE_NODE.evaluate({ trigger: 0 }, { initial: 0 }, ctxTog).out).toBe(1);
    expect(TOGGLE_NODE.evaluate({ trigger: 1 }, { initial: 0 }, ctxTog).out).toBe(0);
  });

  test("gate node", () => {
    expect(GATE_NODE.evaluate({ value: 42, enable: 1 }, {}, CTX).out).toBe(42);
    expect(GATE_NODE.evaluate({ value: 42, enable: 0 }, { offValue: 0 }, CTX).out).toBe(0);
  });
});

describe("OSCILLATOR & ENVELOPE NODES", () => {
  test("oscillator produces sine wave over time", () => {
    const res0 = OSCILLATOR_NODE.evaluate({}, { type: "sine", frequency: 1, phase: 0, amplitude: 1, offset: 0 }, { ...CTX, time: 0 }).out as number;
    const resQuarter = OSCILLATOR_NODE.evaluate({}, { type: "sine", frequency: 1, phase: 0, amplitude: 1, offset: 0 }, { ...CTX, time: 0.25 }).out as number;
    expect(res0).toBeCloseTo(0);
    expect(resQuarter).toBeCloseTo(1);
  });

  test("envelope attack phase", () => {
    const ctxEnv: EvalContext = { time: 0, step: 0, nodeId: "env-1" };
    ENVELOPE_NODE.evaluate({ trigger: 1 }, { attack: 1, release: 1 }, ctxEnv); // trigger starts at t=0
    const levelHalf = ENVELOPE_NODE.evaluate({ trigger: 1 }, { attack: 1, release: 1 }, { ...ctxEnv, time: 0.5 }).out as number;
    expect(levelHalf).toBeCloseTo(0.5);
  });
});

describe("COLOR NODES", () => {
  test("compose color", () => {
    const res = COLOR_COMPOSE_NODE.evaluate({ r: 1, g: 0.5, b: 0 }, {}, CTX).out as THREE.Color;
    expect(res.r).toBe(1);
    expect(res.g).toBe(0.5);
    expect(res.b).toBe(0);
  });

  test("decompose color", () => {
    const col = new THREE.Color(0.2, 0.4, 0.8);
    const res = COLOR_DECOMPOSE_NODE.evaluate({ color: col }, {}, CTX);
    expect(res.r).toBeCloseTo(0.2);
    expect(res.g).toBeCloseTo(0.4);
    expect(res.b).toBeCloseTo(0.8);
  });

  test("color math lerp mix", () => {
    const a = new THREE.Color(0, 0, 0);
    const b = new THREE.Color(1, 1, 1);
    const res = COLOR_MATH_NODE.evaluate({ a, b, factor: 0.5 }, { op: "mix" }, CTX).out as THREE.Color;
    expect(res.r).toBeCloseTo(0.5);
    expect(res.g).toBeCloseTo(0.5);
    expect(res.b).toBeCloseTo(0.5);
  });
});

describe("CONVERTER NODES", () => {
  test("value to vector", () => {
    const res = VALUE_TO_VECTOR_NODE.evaluate({ value: 3.5 }, {}, CTX).vector as THREE.Vector3;
    expect(res.x).toBe(3.5);
    expect(res.y).toBe(3.5);
    expect(res.z).toBe(3.5);
  });

  test("color to vector and vector to color round trip", () => {
    const color = new THREE.Color(0.2, 0.6, 0.8);
    const vec = COLOR_TO_VECTOR_NODE.evaluate({ color }, {}, CTX).vector as THREE.Vector3;
    expect(vec.x).toBeCloseTo(0.2);
    expect(vec.y).toBeCloseTo(0.6);
    expect(vec.z).toBeCloseTo(0.8);

    const backColor = VECTOR_TO_COLOR_NODE.evaluate({ vector: vec }, {}, CTX).color as THREE.Color;
    expect(backColor.r).toBeCloseTo(0.2);
    expect(backColor.g).toBeCloseTo(0.6);
    expect(backColor.b).toBeCloseTo(0.8);
  });

  test("value to color", () => {
    const res = VALUE_TO_COLOR_NODE.evaluate({ value: 0.5 }, {}, CTX).color as THREE.Color;
    expect(res.r).toBeCloseTo(0.5);
    expect(res.g).toBeCloseTo(0.5);
    expect(res.b).toBeCloseTo(0.5);
  });
});

describe("OBJECT PRIMITIVES", () => {
  test("plane object evaluation", () => {
    const res = OBJECT_PLANE_NODE.evaluate({}, OBJECT_PLANE_NODE.defaultParams, CTX).geometry as THREE.Mesh;
    expect(res).toBeInstanceOf(THREE.Mesh);
  });

  test("sphere object evaluation", () => {
    const res = OBJECT_SPHERE_NODE.evaluate({}, OBJECT_SPHERE_NODE.defaultParams, CTX).geometry as THREE.Mesh;
    expect(res).toBeInstanceOf(THREE.Mesh);
  });
});
