import { NodeDefinition } from "../types";

/**
 * The master clock, BIBLE.md's Time node. Just reads EvalContext straight
 * through — the actual sync contract (epoch, fixed step) lives in clock.ts
 * and is driven from outside the graph, once per frame, not by this node.
 * This node exists so *other* nodes get time only by wiring it, never by
 * reaching for Date.now() themselves — keeps every node's evaluate pure.
 */
export const TIME_NODE: NodeDefinition = {
  type: "time",
  label: "Time",
  category: "time",
  inputs: [],
  outputs: [
    { id: "seconds", label: "Seconds", type: "value" },
    { id: "step", label: "Step", type: "value" },
  ],
  defaultParams: {},
  evaluate: (_inputs, _params, ctx) => ({ seconds: ctx.time, step: ctx.step }),
};

/**
 * Frame node — outputs the current frame index of the timeline / playback context.
 */
export const FRAME_NODE: NodeDefinition = {
  type: "time/frame",
  label: "Frame",
  category: "time",
  inputs: [],
  outputs: [
    { id: "frame", label: "Frame", type: "value" },
  ],
  defaultParams: {},
  evaluate: (_inputs, _params, ctx) => ({
    frame: ctx.currentFrame !== undefined ? ctx.currentFrame : ctx.step,
  }),
};
