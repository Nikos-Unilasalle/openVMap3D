import * as THREE from "three";
import { NodeDefinition } from "../types";
import { ColorRamp, DEFAULT_COLOR_RAMP, sampleColorRamp } from "../colorRamp";

/** Get List Item node — retrieves an element from a list at the specified index, with dynamic typing supporting any element type (Geometry, Vector, Matrix, Color, Value, Text). */
export const GET_LIST_ITEM_NODE: NodeDefinition = {
  type: "list/get-item",
  label: "Get List Item",
  category: "list",
  inputs: [
    { id: "list", label: "List", type: "list" },
    { id: "index", label: "Index", type: "value" },
  ],
  outputs: [
    { id: "item", label: "Item", type: "any" },
    { id: "val", label: "Value", type: "value" },
  ],
  dynamicOutputs: (_connections, connectionTypes) => {
    const listConn = connectionTypes?.find((c) => c.connection.toSocket === "list");
    const sourceType = listConn?.sourceSocketType;
    return [
      { id: "item", label: "Item", type: sourceType && sourceType !== "list" ? sourceType : "any" },
      { id: "val", label: "Value", type: "value" },
    ];
  },
  defaultParams: { index: 0 },
  paramFields: [{ id: "index", label: "Index", kind: "number", step: 1 }],
  evaluate: (inputs, params) => {
    const list = Array.isArray(inputs.list) ? inputs.list : [];
    const index = Math.floor(inputs.index !== undefined ? Number(inputs.index) || 0 : Number(params.index) || 0);

    if (list.length === 0) return { item: 0, val: 0 };

    // Wrap around index defensively using modulo
    const safeIndex = ((index % list.length) + list.length) % list.length;
    const raw = list[safeIndex];
    const val = typeof raw === "number" ? raw : Number(raw) || 0;

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
    { id: "count", label: "Count", kind: "number", step: 1 },
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
  "clamp",
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
      case "clamp": {
        const lower = Math.min(offset, factor);
        const upper = Math.max(offset, factor);
        return { list: numbers.map((n) => Math.min(upper, Math.max(lower, n))) };
      }
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
  inputs: [{ id: "count", label: "Count", type: "value" }],
  outputs: [{ id: "list", label: "Colors", type: "list" }],

  defaultParams: {
    count: 10,
    ramp: DEFAULT_COLOR_RAMP,
  },
  paramFields: [
    { id: "count", label: "Count", kind: "number", step: 1 },
    { id: "ramp", label: "Ramp", kind: "color_ramp" },
  ],
  evaluate: (inputs, params) => {
    const count = Math.max(1, Math.min(500, Math.floor(inputs.count !== undefined ? Number(inputs.count) || 0 : Number(params.count) || 10)));
    const ramp = params.ramp && typeof params.ramp === "object" ? (params.ramp as ColorRamp) : DEFAULT_COLOR_RAMP;

    const list: THREE.Color[] = [];
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0;
      list.push(sampleColorRamp(ramp, t));
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
    { id: "start", label: "Start Index", kind: "number", step: 1 },
    { id: "count", label: "Count", kind: "number", step: 1 },
  ],
  evaluate: (inputs, params) => {
    const rawList = Array.isArray(inputs.list) ? inputs.list : [];
    const start = Math.max(0, Math.floor(inputs.start !== undefined ? Number(inputs.start) || 0 : Number(params.start) || 0));
    const count = Math.max(0, Math.floor(inputs.count !== undefined ? Number(inputs.count) || 0 : Number(params.count) || 10));

    const sliced = rawList.slice(start, start + count);
    return { list: sliced };
  },
};

/** Combine Vector Lists node — composes 3 scalar lists (X, Y, Z) into a list of THREE.Vector3 objects. */
export const COMBINE_VECTOR_LISTS_NODE: NodeDefinition = {
  type: "list/combine-vectors",
  label: "Combine Vectors",
  category: "list",
  inputs: [
    { id: "xList", label: "X List", type: "list" },
    { id: "yList", label: "Y List", type: "list" },
    { id: "zList", label: "Z List", type: "list" },
  ],
  outputs: [{ id: "vectorList", label: "Vector List", type: "list" }],
  defaultParams: { xDefault: 0, yDefault: 0, zDefault: 0 },
  paramFields: [
    { id: "xDefault", label: "X Default", kind: "number", step: 0.1 },
    { id: "yDefault", label: "Y Default", kind: "number", step: 0.1 },
    { id: "zDefault", label: "Z Default", kind: "number", step: 0.1 },
  ],
  evaluate: (inputs, params) => {
    const xList = Array.isArray(inputs.xList) ? inputs.xList : [];
    const yList = Array.isArray(inputs.yList) ? inputs.yList : [];
    const zList = Array.isArray(inputs.zList) ? inputs.zList : [];

    const xDefault = Number(params.xDefault) || 0;
    const yDefault = Number(params.yDefault) || 0;
    const zDefault = Number(params.zDefault) || 0;

    const count = Math.max(xList.length, yList.length, zList.length, 1);
    const vectorList: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      const x = i < xList.length ? Number(xList[i]) : xDefault;
      const y = i < yList.length ? Number(yList[i]) : yDefault;
      const z = i < zList.length ? Number(zList[i]) : zDefault;
      vectorList.push(
        new THREE.Vector3(
          Number.isFinite(x) ? x : xDefault,
          Number.isFinite(y) ? y : yDefault,
          Number.isFinite(z) ? z : zDefault,
        ),
      );
    }

    return { vectorList };
  },
};

/** Split Vector List node — decomposes a list of THREE.Vector3 objects into 3 scalar number lists (X, Y, Z). */
export const SPLIT_VECTOR_LIST_NODE: NodeDefinition = {
  type: "list/split-vectors",
  label: "Split Vector List",
  category: "list",
  inputs: [{ id: "vectorList", label: "Vector List", type: "list" }],
  outputs: [
    { id: "xList", label: "X List", type: "list" },
    { id: "yList", label: "Y List", type: "list" },
    { id: "zList", label: "Z List", type: "list" },
  ],
  defaultParams: {},
  evaluate: (inputs) => {
    const rawList = Array.isArray(inputs.vectorList) ? inputs.vectorList : [];
    const xList: number[] = [];
    const yList: number[] = [];
    const zList: number[] = [];

    rawList.forEach((item) => {
      if (item instanceof THREE.Vector3) {
        xList.push(item.x);
        yList.push(item.y);
        zList.push(item.z);
      } else if (typeof item === "number") {
        xList.push(item);
        yList.push(item);
        zList.push(item);
      } else if (typeof item === "object" && item !== null && "x" in item && "y" in item) {
        const obj = item as { x: number; y: number; z?: number };
        xList.push(Number(obj.x) || 0);
        yList.push(Number(obj.y) || 0);
        zList.push(Number(obj.z) || 0);
      } else {
        xList.push(0);
        yList.push(0);
        zList.push(0);
      }
    });

    return { xList, yList, zList };
  },
};

