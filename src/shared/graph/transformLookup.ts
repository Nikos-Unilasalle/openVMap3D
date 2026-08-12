import { MATRIX_TRANSFORM_NODE, TRANSFORM_NODE } from "./nodes/transform";
import { Graph } from "./types";

/** Node types whose mesh tags itself with a nodeId (see object.ts) and so can be click-selected and gizmo-edited in the viewport. */
export const GIZMO_SELECTABLE_TYPES = ["object/box", "object/plane", "object/sphere"];

/**
 * What the viewport's gizmo found one hop upstream of a selected object's
 * `matrix` input, and how a drag should be written back (see Viewport.tsx):
 *
 * - "absolute": a plain `transform` node — its location/rotation/scale
 *   directly compose the object's final matrix, so the gizmo's own dragged
 *   world position/rotation/scale can be written straight into its params.
 * - "offset": a `transform/matrix-transform` node — its location/rotation/
 *   scale are a *local delta* applied on top of whatever `baseSourceNodeId`
 *   feeds its own `matrix` input (final = base * delta). Writing the
 *   gizmo's absolute pose straight into this node's params would double
 *   count the base transform, so the caller has to solve
 *   `delta = inverse(base) * final` first — `baseSourceNodeId` is what to
 *   look the current `base` matrix up from (null if nothing is wired in,
 *   i.e. base is the identity, same fallback MATRIX_TRANSFORM_NODE's own
 *   evaluate uses).
 *
 * Deliberately still one hop, not a full chain walk: `transform/parent`,
 * `transform/look-at`, or any other matrix-producing node has no single
 * location/rotation/scale to drag — those cases return null (no gizmo)
 * rather than guessing. Chaining is edited through each node's own param
 * fields instead, same as it is today.
 */
export type GizmoTarget =
  | { kind: "absolute"; transformNodeId: string }
  | { kind: "offset"; transformNodeId: string; baseSourceNodeId: string | null };

export function resolveGizmoTarget(graph: Graph, objectNodeId: string): GizmoTarget | null {
  const connection = graph.connections.find((c) => c.toNode === objectNodeId && c.toSocket === "matrix");
  if (!connection) return null;

  const source = graph.nodes.find((n) => n.id === connection.fromNode);
  if (!source) return null;

  if (source.type === TRANSFORM_NODE.type) {
    return { kind: "absolute", transformNodeId: source.id };
  }

  if (source.type === MATRIX_TRANSFORM_NODE.type) {
    const baseConnection = graph.connections.find((c) => c.toNode === source.id && c.toSocket === "matrix");
    return { kind: "offset", transformNodeId: source.id, baseSourceNodeId: baseConnection?.fromNode ?? null };
  }

  return null;
}
