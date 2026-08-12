import { NodeDefinition } from "../types";

const OPS: Record<string, (a: number, b: number) => number> = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => (b === 0 ? 0 : a / b),
  min: Math.min,
  max: Math.max,
  mod: (a, b) => (b === 0 ? 0 : ((a % b) + b) % b),
  power: Math.pow,
};

/** One node, an `op` param picks the operation — matches Blender's Math node rather than a node per operator. */
export const VALUE_MATH_NODE: NodeDefinition = {
  type: "value/math",
  label: "Value Math",
  category: "math",
  inputs: [
    { id: "a", label: "A", type: "value" },
    { id: "b", label: "B", type: "value" },
  ],
  outputs: [{ id: "out", label: "Out", type: "value" }],
  defaultParams: { op: "add", a: 0, b: 0 },
  paramFields: [
    { id: "op", label: "Operation", kind: "select", options: Object.keys(OPS) },
    { id: "a", label: "A (fallback)", kind: "number" },
    { id: "b", label: "B (fallback)", kind: "number" },
  ],
  evaluate: (inputs, params) => {
    const op = OPS[String(params.op)] ?? OPS.add;
    return { out: op(Number(inputs.a) || 0, Number(inputs.b) || 0) };
  },
};

/** A bare constant — the simplest possible source for a Value socket. */
export const VALUE_CONSTANT_NODE: NodeDefinition = {
  type: "value/constant",
  label: "Value",
  category: "math",
  inputs: [],
  outputs: [{ id: "out", label: "Out", type: "value" }],
  defaultParams: { value: 0 },
  paramFields: [{ id: "value", label: "Value", kind: "number" }],
  evaluate: (_inputs, params) => ({ out: Number(params.value) || 0 }),
};

/**
 * Expected to be the single most-used node in the catalogue — the universal
 * "rescale a value from one range to another," which is what every sensor- or
 * audio-to-parameter mapping reduces to. Clamps to the output range by
 * default (unclamped extrapolation is rarely what a VJ wants from a live
 * signal that briefly spikes past its expected range).
 */
export const MAP_RANGE_NODE: NodeDefinition = {
  type: "value/map-range",
  label: "Map Range",
  category: "math",
  inputs: [{ id: "value", label: "Value", type: "value" }],
  outputs: [{ id: "out", label: "Out", type: "value" }],
  defaultParams: { inMin: 0, inMax: 1, outMin: 0, outMax: 1, clamp: 1 },
  paramFields: [
    { id: "inMin", label: "In Min", kind: "number" },
    { id: "inMax", label: "In Max", kind: "number" },
    { id: "outMin", label: "Out Min", kind: "number" },
    { id: "outMax", label: "Out Max", kind: "number" },
    { id: "clamp", label: "Clamp", kind: "boolean" },
  ],
  evaluate: (inputs, params) => {
    const inMin = Number(params.inMin) || 0;
    const inMax = Number(params.inMax) || 0;
    const outMin = Number(params.outMin) || 0;
    const outMax = Number(params.outMax) || 0;
    const value = Number(inputs.value) || 0;

    const span = inMax - inMin;
    let t = span === 0 ? 0 : (value - inMin) / span;
    if (params.clamp) t = Math.min(1, Math.max(0, t));

    return { out: outMin + t * (outMax - outMin) };
  },
};
