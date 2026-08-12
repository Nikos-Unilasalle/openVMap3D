import * as THREE from "three";
import { NodeDefinition } from "../types";

/** Get List Item node — retrieves an element from a list at the specified index. */
export const GET_LIST_ITEM_NODE: NodeDefinition = {
  type: "list/get-item",
  label: "Get List Item",
  category: "list",
  inputs: [
    { id: "list", label: "List", type: "list" },
    { id: "index", label: "Index", type: "value" },
  ],
  outputs: [
    { id: "item", label: "Item", type: "value" },
    { id: "val", label: "Value", type: "value" },
  ],
  defaultParams: { index: 0 },
  paramFields: [{ id: "index", label: "Index", kind: "number" }],
  evaluate: (inputs, params) => {
    const list = Array.isArray(inputs.list) ? inputs.list : [];
    const index = Math.floor(inputs.index !== undefined ? Number(inputs.index) || 0 : Number(params.index) || 0);

    if (list.length === 0) return { item: 0, val: 0 };

    // Wrap around index defensively using modulo
    const safeIndex = ((index % list.length) + list.length) % list.length;
    const raw = list[safeIndex];
    const val = Number(raw) || 0;

    return { item: raw, val };
  },
};

/** List Length node — outputs the total number of items in a list. */
export const LIST_LENGTH_NODE: NodeDefinition = {
  type: "list/length",
  label: "List Length",
  category: "list",
  inputs: [{ id: "list", label: "List", type: "list" }],
  outputs: [{ id: "length", label: "Length", type: "value" }],
  defaultParams: {},
  evaluate: (inputs) => {
    const list = Array.isArray(inputs.list) ? inputs.list : [];
    return { length: list.length };
  },
};

/** Generate List node — generates an arithmetic sequence of numbers [start, start + step, ...]. */
export const GENERATE_LIST_NODE: NodeDefinition = {
  type: "list/generate",
  label: "Generate List",
  category: "list",
  inputs: [
    { id: "count", label: "Count", type: "value" },
    { id: "start", label: "Start", type: "value" },
    { id: "step", label: "Step", type: "value" },
  ],
  outputs: [{ id: "list", label: "List", type: "list" }],
  defaultParams: { count: 10, start: 0, step: 1 },
  paramFields: [
    { id: "count", label: "Count", kind: "number" },
    { id: "start", label: "Start Value", kind: "number" },
    { id: "step", label: "Step Size", kind: "number", step: 0.1 },
  ],
  evaluate: (inputs, params) => {
    const count = Math.max(0, Math.min(1000, Math.floor(inputs.count !== undefined ? Number(inputs.count) || 0 : Number(params.count) || 10)));
    const start = inputs.start !== undefined ? Number(inputs.start) || 0 : Number(params.start) || 0;
    const step = inputs.step !== undefined ? Number(inputs.step) || 0 : Number(params.step) || 1;

    const list: number[] = [];
    for (let i = 0; i < count; i++) {
      list.push(start + i * step);
    }

    return { list };
  },
};

const LIST_OPS = [
  "multiply",
  "add",
  "subtract",
  "divide",
  "power",
  "abs",
  "remap_01",
  "reverse",
  "sort_asc",
  "sort_desc",
];

/** List Math node — performs element-wise scalar operations or transformations on a list of numerical values. */
export const LIST_MATH_NODE: NodeDefinition = {
  type: "list/math",
  label: "List Math",
  category: "list",
  inputs: [
    { id: "list", label: "List", type: "list" },
    { id: "factor", label: "Factor", type: "value" },
    { id: "offset", label: "Offset", type: "value" },
  ],
  outputs: [{ id: "list", label: "List", type: "list" }],
  defaultParams: { op: "multiply", factor: 1, offset: 0 },
  paramFields: [
    { id: "op", label: "Operation", kind: "select", options: LIST_OPS },
    { id: "factor", label: "Factor", kind: "number", step: 0.1 },
    { id: "offset", label: "Offset", kind: "number", step: 0.1 },
  ],
  evaluate: (inputs, params) => {
    const rawList = Array.isArray(inputs.list) ? inputs.list : [];
    const factor = inputs.factor !== undefined ? Number(inputs.factor) || 0 : Number(params.factor) || 1;
    const offset = inputs.offset !== undefined ? Number(inputs.offset) || 0 : Number(params.offset) || 0;
    const op = String(params.op || "multiply");

    const numbers = rawList.map((x) => Number(x) || 0);

    if (numbers.length === 0) return { list: [] };

    switch (op) {
      case "remap_01": {
        let min = Infinity;
        let max = -Infinity;
        for (const n of numbers) {
          if (n < min) min = n;
          if (n > max) max = n;
        }
        const span = max - min;
        return { list: numbers.map((n) => (span === 0 ? 0 : (n - min) / span)) };
      }
      case "reverse":
        return { list: [...numbers].reverse() };
      case "sort_asc":
        return { list: [...numbers].sort((a, b) => a - b) };
      case "sort_desc":
        return { list: [...numbers].sort((a, b) => b - a) };
      case "add":
        return { list: numbers.map((n) => n + offset) };
      case "subtract":
        return { list: numbers.map((n) => n - offset) };
      case "divide":
        return { list: numbers.map((n) => (factor === 0 ? 0 : n / factor)) };
      case "power":
        return { list: numbers.map((n) => Math.pow(n, factor)) };
      case "abs":
        return { list: numbers.map((n) => Math.abs(n)) };
      case "multiply":
      default:
        return { list: numbers.map((n) => n * factor + offset) };
    }
  },
};

/** List Statistics node — aggregates a list into sum, average, min, max, median, and count scalar values. */
export const LIST_STATISTICS_NODE: NodeDefinition = {
  type: "list/statistics",
  label: "List Statistics",
  category: "list",
  inputs: [{ id: "list", label: "List", type: "list" }],
  outputs: [
    { id: "sum", label: "Sum", type: "value" },
    { id: "average", label: "Average", type: "value" },
    { id: "min", label: "Min", type: "value" },
    { id: "max", label: "Max", type: "value" },
    { id: "median", label: "Median", type: "value" },
    { id: "count", label: "Count", type: "value" },
  ],
  defaultParams: {},
  evaluate: (inputs) => {
    const rawList = Array.isArray(inputs.list) ? inputs.list : [];
    const numbers = rawList.map((x) => Number(x) || 0);

    if (numbers.length === 0) {
      return { sum: 0, average: 0, min: 0, max: 0, median: 0, count: 0 };
    }

    let sum = 0;
    let min = Infinity;
    let max = -Infinity;

    for (const n of numbers) {
      sum += n;
      if (n < min) min = n;
      if (n > max) max = n;
    }

    const count = numbers.length;
    const average = sum / count;

    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(count / 2);
    const median = count % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    return { sum, average, min, max, median, count };
  },
};

const COMBINE_LIST_OPS = ["add", "subtract", "multiply", "divide", "min", "max"];

/** Combine Lists Math node — performs term-by-term math operations between two lists (A and B). */
export const LIST_COMBINE_MATH_NODE: NodeDefinition = {
  type: "list/combine-math",
  label: "Combine Lists Math",
  category: "list",
  inputs: [
    { id: "a", label: "A", type: "list" },
    { id: "b", label: "B", type: "list" },
  ],
  outputs: [{ id: "list", label: "List", type: "list" }],
  defaultParams: { op: "add" },
  paramFields: [{ id: "op", label: "Operation", kind: "select", options: COMBINE_LIST_OPS }],
  evaluate: (inputs, params) => {
    const listA = Array.isArray(inputs.a) ? inputs.a.map((x) => Number(x) || 0) : [];
    const listB = Array.isArray(inputs.b) ? inputs.b.map((x) => Number(x) || 0) : [];
    const op = String(params.op || "add");

    const length = Math.max(listA.length, listB.length);
    const result: number[] = [];

    for (let i = 0; i < length; i++) {
      const valA = listA[i] ?? 0;
      const valB = listB[i] ?? 0;

      let res = 0;
      switch (op) {
        case "add":
          res = valA + valB;
          break;
        case "subtract":
          res = valA - valB;
          break;
        case "multiply":
          res = valA * valB;
          break;
        case "divide":
          res = valB === 0 ? 0 : valA / valB;
          break;
        case "min":
          res = Math.min(valA, valB);
          break;
        case "max":
          res = Math.max(valA, valB);
          break;
        default:
          res = valA + valB;
      }
      result.push(res);
    }

    return { list: result };
  },
};


/** Color Palette List node — generates a list of interpolated THREE.Colors between Start Color and End Color. */
export const COLOR_PALETTE_LIST_NODE: NodeDefinition = {
  type: "list/color-palette",
  label: "Color Palette List",
  category: "list",
  inputs: [
    { id: "count", label: "Count", type: "value" },
    { id: "startColor", label: "Start Color", type: "color" },
    { id: "endColor", label: "End Color", type: "color" },
  ],
  outputs: [{ id: "list", label: "Colors", type: "list" }],

  defaultParams: {
    count: 10,
    startColor: new THREE.Color(0x38bdf8),
    endColor: new THREE.Color(0xec4899),
  },
  paramFields: [
    { id: "count", label: "Count", kind: "number" },
    { id: "startColor", label: "Start Color", kind: "color" },
    { id: "endColor", label: "End Color", kind: "color" },
  ],
  evaluate: (inputs, params) => {
    const count = Math.max(1, Math.min(500, Math.floor(inputs.count !== undefined ? Number(inputs.count) || 0 : Number(params.count) || 10)));
    const startCol = inputs.startColor instanceof THREE.Color
      ? inputs.startColor
      : (params.startColor instanceof THREE.Color ? params.startColor : new THREE.Color(0x38bdf8));
    const endCol = inputs.endColor instanceof THREE.Color
      ? inputs.endColor
      : (params.endColor instanceof THREE.Color ? params.endColor : new THREE.Color(0xec4899));

    const list: THREE.Color[] = [];
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0;
      const c = startCol.clone().lerp(endCol, t);
      list.push(c);
    }

    return { list };
  },
};

/** Slice List node — returns a sub-slice of an input list. */
export const SLICE_LIST_NODE: NodeDefinition = {
  type: "list/slice",
  label: "Slice List",
  category: "list",
  inputs: [
    { id: "list", label: "List", type: "list" },
    { id: "start", label: "Start", type: "value" },
    { id: "count", label: "Count", type: "value" },
  ],
  outputs: [{ id: "list", label: "List", type: "list" }],
  defaultParams: { start: 0, count: 10 },
  paramFields: [
    { id: "start", label: "Start Index", kind: "number" },
    { id: "count", label: "Count", kind: "number" },
  ],
  evaluate: (inputs, params) => {
    const rawList = Array.isArray(inputs.list) ? inputs.list : [];
    const start = Math.max(0, Math.floor(inputs.start !== undefined ? Number(inputs.start) || 0 : Number(params.start) || 0));
    const count = Math.max(0, Math.floor(inputs.count !== undefined ? Number(inputs.count) || 0 : Number(params.count) || 10));

    const sliced = rawList.slice(start, start + count);
    return { list: sliced };
  },
};
