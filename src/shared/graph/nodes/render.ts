import { Graph, NodeDefinition } from "../types";
import { numberInput } from "./object";

/**
 * Terminal node. Today: a single Geometry input, passed straight through as
 * its own output — the viewport reads whichever node in the graph is a
 * `render` type and adds that output to its THREE.Scene. Simplified from
 * BIBLE.md's `Sequence (N ports) -> Render` on purpose, to prove the
 * evaluate-to-viewport pipe first: a `list` input fed by however Sequence
 * ends up fanning multiple objects in is a follow-up, not a redesign — the
 * socket type is already `list`-shaped for exactly that.
 */
export const RENDER_NODE: NodeDefinition = {
  type: "render",
  label: "Render",
  category: "structure",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "environment", label: "Environment", type: "any" },
    { id: "postprocess", label: "Post-Process", type: "postprocess" },
    { id: "motionBlur", label: "Motion Blur", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "environment", label: "Environment", type: "any" },
    { id: "postprocess", label: "Post-Process", type: "postprocess" },
  ],
  defaultParams: { motionBlur: 0 },
  paramFields: [{ id: "motionBlur", label: "Motion Blur", kind: "number", step: 0.05 }],
  // `motionBlur` is returned but deliberately has no output socket: it's a
  // setting for whoever draws this Render node (see Viewport.tsx), not a
  // value another node would wire onward. The Viewport reads the whole
  // outputs record, so returning it is enough.
  evaluate: (inputs, params) => ({
    geometry: inputs.geometry,
    environment: inputs.environment,
    postprocess: inputs.postprocess,
    motionBlur: Math.max(0, Math.min(1, numberInput(inputs.motionBlur, params.motionBlur, 0))),
  }),
};

/** First `render`-type node in the graph — what a Viewport draws when it isn't told a specific node id to use. Multiple Render nodes: first one wins, arbitrary order, not an error. */
export function findRenderNodeId(graph: Graph): string | undefined {
  return graph.nodes.find((n) => n.type === RENDER_NODE.type)?.id;
}
