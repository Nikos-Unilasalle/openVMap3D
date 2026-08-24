import * as THREE from "three";
import { NodeDefinition } from "../types";
import { asVector3 } from "./transform";
import { writePointsToMesh } from "./pointsGeometry";
import { TOGGLE_POINTS_KEYFRAME_ACTION } from "./curve";

/**
 * Seeds/reseeds `pointsList` from whatever mesh is currently wired into
 * Basis — see App.tsx's onParamAction. A button rather than something
 * automatic in `evaluate`: evaluate is pure and can't write back into the
 * graph, and re-running this on every topology change (an upstream Subdivide
 * dialled up, say) would silently discard whatever the operator already
 * edited here.
 */
export const RESEED_MESH_POINTS_ACTION = "object/reseed-edit-points";

/**
 * Edit Mesh Points — the mesh equivalent of Curve from Points' draggable
 * control-point handles (see curveHandles.ts / curveLookup.ts, which key off
 * any node with an array-valued `pointsList` param, this one included), but
 * fixed-topology: no insert/remove, since a mesh's vertex buffer is not free
 * to grow or shrink the way a curve's control-point list is — every entry
 * has to keep lining up with the source mesh's own vertex indices for
 * writePointsToMesh's index-aligned write-back to mean anything. Viewport.tsx
 * explicitly blocks the curve editor's insert/remove keys for this node type.
 *
 * `pointsList` starts empty (there is no mesh to seed it from until Basis is
 * wired) — "Reset Points from Basis" fills it in, and the node passes Basis
 * straight through, unedited, until then.
 */
export const EDIT_MESH_POINTS_NODE: NodeDefinition = {
  type: "object/edit_points",
  label: "Edit Mesh Points",
  category: "object",
  inputs: [{ id: "basis", label: "Basis", type: "geometry", owns: true }],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {
    pointsList: [],
  },
  paramFields: [
    { id: "reseedButton", label: "Reset Points from Basis", kind: "button", action: RESEED_MESH_POINTS_ACTION },
    { id: "pointsKeyframeButton", label: "Keyframe points at frame", kind: "button", action: TOGGLE_POINTS_KEYFRAME_ACTION },
  ],
  evaluate: (inputs, params, ctx) => {
    const basisObj = inputs.basis as THREE.Object3D | undefined;
    if (!basisObj) return { geometry: null };

    const pointsList = Array.isArray(params.pointsList) ? params.pointsList : [];
    // Not seeded yet (or Basis was swapped for something else without
    // re-seeding): pass the mesh through untouched rather than guess.
    if (pointsList.length === 0) return { geometry: basisObj };

    const points = pointsList.map((p) => asVector3(p, new THREE.Vector3()));
    const result = writePointsToMesh(ctx.nodeId, basisObj, points, "Edit Mesh Points");
    return { geometry: result };
  },
};
