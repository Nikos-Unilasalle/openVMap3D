import { NodeDefinition, EasingType } from "../types";
import { computeSegmentEasing } from "../evaluate";
import { numberInput } from "./object";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Stagger Node — the cascade entrance of motion design. Given a count and the
 * current time, it computes each item's local animation progress so a whole
 * pack (array, spawner, instance list) enters one after another.
 *
 * `progress[i]` is 0→1 over each item's own `duration`; `active[i]` is 1 while
 * item i is animating; `delays[i]` is when item i starts. Feed `progress`
 * through List Math into Set Instance Transform (scale, posY, rotation…) to
 * build the cascade.
 */
export const STAGGER_NODE: NodeDefinition = {
  type: "list/stagger",
  label: "Stagger",
  category: "list",
  inputs: [
    { id: "time", label: "Time", type: "value" },
    { id: "count", label: "Count", type: "value" },
    { id: "duration", label: "Duration (s)", type: "value" },
    { id: "offset", label: "Stagger (s)", type: "value" },
    { id: "startAt", label: "First Start (s)", type: "value" },
  ],
  outputs: [
    { id: "progress", label: "Progress (0–1)", type: "list" },
    { id: "active", label: "Active (0/1)", type: "list" },
    { id: "delays", label: "Start Times", type: "list" },
  ],
  defaultParams: {
    count: 10,
    duration: 1,
    offset: 0.1,
    startAt: 0,
  },
  dynamicParamFields: () => [
    { id: "count", label: "Count", kind: "number", step: 1 },
    { id: "duration", label: "Duration (s)", kind: "number", step: 0.05 },
    { id: "offset", label: "Stagger (s)", kind: "number", step: 0.05 },
    { id: "startAt", label: "First Start (s)", kind: "number", step: 0.05 },
  ],
  evaluate: (inputs, params) => {
    const time = numberInput(inputs.time, params.time, 0);
    const count = Math.max(1, Math.min(10000, Math.round(numberInput(inputs.count, params.count, 10))));
    const duration = Math.max(0.0001, numberInput(inputs.duration, params.duration, 1));
    const offset = Math.max(0, numberInput(inputs.offset, params.offset, 0.1));
    const startAt = numberInput(inputs.startAt, params.startAt, 0);

    const progress: number[] = [];
    const active: number[] = [];
    const delays: number[] = [];
    for (let i = 0; i < count; i++) {
      const start = startAt + i * offset;
      delays.push(start);
      progress.push(clamp01((time - start) / duration));
      active.push(time >= start && time < start + duration ? 1 : 0);
    }
    return { progress, active, delays };
  },
};

/**
 * Time Remap Node — maps an input time range onto an output range through an
 * easing curve. The classic tool for slow-motion, speed ramps, holds and
 * reversal: feed `time` from the clock and drive a node's local time.
 */
export const TIME_REMAP_NODE: NodeDefinition = {
  type: "time/remap",
  label: "Time Remap",
  category: "time",
  inputs: [
    { id: "time", label: "Time", type: "value" },
    { id: "inStart", label: "Input Start", type: "value" },
    { id: "inEnd", label: "Input End", type: "value" },
    { id: "outStart", label: "Output Start", type: "value" },
    { id: "outEnd", label: "Output End", type: "value" },
    { id: "loop", label: "Loop", type: "value" },
  ],
  outputs: [{ id: "time", label: "Remapped Time", type: "value" }],
  defaultParams: {
    inStart: 0,
    inEnd: 1,
    outStart: 0,
    outEnd: 1,
    ease: "smooth" as EasingType,
    loop: 0,
  },
  dynamicParamFields: () => [
    { id: "inStart", label: "Input Start", kind: "number", step: 0.05 },
    { id: "inEnd", label: "Input End", kind: "number", step: 0.05 },
    { id: "outStart", label: "Output Start", kind: "number", step: 0.05 },
    { id: "outEnd", label: "Output End", kind: "number", step: 0.05 },
    { id: "ease", label: "Easing", kind: "select", options: ["smooth", "linear", "hold", "expo", "back", "bounce", "elastic"] },
    { id: "loop", label: "Loop", kind: "boolean" },
  ],
  evaluate: (inputs, params) => {
    const time = numberInput(inputs.time, params.time, 0);
    const inStart = numberInput(inputs.inStart, params.inStart, 0);
    const inEnd = numberInput(inputs.inEnd, params.inEnd, 1);
    const outStart = numberInput(inputs.outStart, params.outStart, 0);
    const outEnd = numberInput(inputs.outEnd, params.outEnd, 1);
    const ease = (String(params.ease || "smooth") as EasingType);
    const loop = inputs.loop !== undefined ? Number(inputs.loop) > 0 : Boolean(params.loop);

    const span = inEnd - inStart;
    if (span === 0) return { time: outStart };

    let t = (time - inStart) / span;
    if (loop) {
      t = t - Math.floor(t);
    } else {
      t = Math.max(0, Math.min(1, t));
    }
    const eased = computeSegmentEasing(t, ease);
    return { time: outStart + (outEnd - outStart) * eased };
  },
};

/**
 * Expression Node — a small expression language driving any parameter, the
 * After Effects expression idea. The text is compiled once (cached) and
 * evaluated per frame with `time` (seconds), `frame`, `step`, `a`/`b`/`c`
 * (wired inputs) plus the usual math helpers.
 */
export const EXPRESSION_NODE: NodeDefinition = {
  type: "value/expression",
  label: "Expression",
  category: "math",
  inputs: [
    { id: "time", label: "Time", type: "value" },
    { id: "frame", label: "Frame", type: "value" },
    { id: "a", label: "A", type: "value" },
    { id: "b", label: "B", type: "value" },
    { id: "c", label: "C", type: "value" },
  ],
  outputs: [{ id: "value", label: "Value", type: "value" }],
  defaultParams: {
    expression: "sin(time * 2) * 45",
    a: 0,
    b: 0,
    c: 0,
  },
  dynamicParamFields: () => [
    { id: "expression", label: "Expression", kind: "text" },
    { id: "a", label: "A (fallback)", kind: "number", step: 0.1 },
    { id: "b", label: "B (fallback)", kind: "number", step: 0.1 },
    { id: "c", label: "C (fallback)", kind: "number", step: 0.1 },
  ],
  evaluate: (inputs, params) => {
    const expr = String(params.expression || "");
    const fn = getExpressionFn(expr);
    if (!fn) return { value: 0 };

    try {
      const value = fn(
        numberInput(inputs.time, params.time, 0),
        numberInput(inputs.frame, 0, 0),
        numberInput(inputs.a, params.a, 0),
        numberInput(inputs.b, params.b, 0),
        numberInput(inputs.c, params.c, 0),
      );
      return { value: Number.isFinite(value) ? value : 0 };
    } catch {
      return { value: 0 };
    }
  },
};

const expressionCache = new Map<string, ((time: number, frame: number, a: number, b: number, c: number) => number) | null>();

function getExpressionFn(
  expr: string,
): ((time: number, frame: number, a: number, b: number, c: number) => number) | null {
  const cached = expressionCache.get(expr);
  if (cached !== undefined) return cached;

  let fn: ((time: number, frame: number, a: number, b: number, c: number) => number) | null = null;
  try {
    // eslint-disable-next-line no-new-func
    const compiled = new Function(
      "time",
      "frame",
      "a",
      "b",
      "c",
      "sin",
      "cos",
      "tan",
      "abs",
      "floor",
      "ceil",
      "round",
      "min",
      "max",
      "clamp",
      "lerp",
      "pow",
      "sqrt",
      "PI",
      "E",
      `"use strict"; return (${expr});`,
    );
    fn = (time, frame, a, b, c) =>
      compiled(time, frame, a, b, c, Math.sin, Math.cos, Math.tan, Math.abs, Math.floor, Math.ceil, Math.round, Math.min, Math.max, (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi), (p: number, q: number, t: number) => p + (q - p) * clamp01(t), Math.pow, Math.sqrt, Math.PI, Math.E);
  } catch {
    fn = null;
  }
  expressionCache.set(expr, fn);
  return fn;
}
