import { Graph, NodeDefinition } from "../types";

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
  inputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {},
  evaluate: (inputs) => ({ geometry: inputs.geometry }),
};

/** First `render`-type node in the graph — what a Viewport draws when it isn't told a specific node id to use. Multiple Render nodes: first one wins, arbitrary order, not an error. */
export function findRenderNodeId(graph: Graph): string | undefined {
  return graph.nodes.find((n) => n.type === RENDER_NODE.type)?.id;
}
