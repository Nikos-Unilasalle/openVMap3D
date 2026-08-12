import { TRANSFORM_NODE } from "./nodes/transform";
import { Graph } from "./types";

/** Node types whose mesh tags itself with a nodeId (see object.ts) and so can be click-selected and gizmo-edited in the viewport. */
export const GIZMO_SELECTABLE_TYPES = ["object/box", "object/plane", "object/sphere"];

/**
 * Traces an object node's `matrix` input back one hop to find the plain
 * `transform` node driving it, if any — what the viewport's gizmo needs to
 * know what to write a drag back into (see Viewport.tsx).
 *
 * Deliberately one hop, not a chain walk: a matrix reaching an object
 * through `transform/matrix-transform`, `transform/parent`, or any other
 * matrix-producing node has no single location/rotation/scale to drag —
 * those cases return null (no gizmo) rather than guessing. Wiring a plain
 * Transform node directly into the object is the common, gizmo-editable
 * case; anything more exotic is edited through its own param fields
 * instead, same as it is today.
 */
export function findUpstreamTransformNode(graph: Graph, objectNodeId: string): string | null {
  const connection = graph.connections.find((c) => c.toNode === objectNodeId && c.toSocket === "matrix");
  if (!connection) return null;

  const source = graph.nodes.find((n) => n.id === connection.fromNode);
  if (!source || source.type !== TRANSFORM_NODE.type) return null;

  return source.id;
}
