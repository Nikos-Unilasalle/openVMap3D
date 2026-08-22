import * as THREE from "three";
import { NodeDefinition } from "../types";

/**
 * Points Selection — a pick-list of indices into an incoming Points list,
 * made by clicking/marquee-dragging the points in the 3D viewport when this
 * node is selected in the graph (see Viewport.tsx's points-edit gate,
 * parallel to the existing curve-handle one). `selectedIndices` lives as a
 * plain param — same storage convention as `pointsList` elsewhere — so a
 * selection survives save/load and undo/redo like any other param.
 *
 * Outputs `mask`, not the index list itself, because that's what Spring
 * Vector's Individual Points mode actually consumes: a same-length
 * 1-or-0-per-point array is a direct per-index lookup, whereas the index
 * list would make every consumer re-derive that lookup itself.
 */
export const POINTS_SELECTION_NODE: NodeDefinition = {
  type: "list/points-selection",
  label: "Points Selection",
  category: "list",
  inputs: [
    { id: "points", label: "Points", type: "list" },
    { id: "matrix", label: "Matrix (viewport placement)", type: "matrix" },
  ],
  outputs: [
    { id: "points", label: "Points (passthrough)", type: "list" },
    { id: "mask", label: "Mask (1=selected)", type: "list" },
    { id: "matrix", label: "Matrix (passthrough)", type: "matrix" },
    { id: "count", label: "Selected Count", type: "value" },
  ],
  // Not user-typed — set by clicking/marquee-dragging points in the
  // viewport (see Viewport.tsx). No paramFields entry: exposing a raw index
  // array as a manually-edited number field would invite hand-typed
  // out-of-range indices for no real benefit.
  defaultParams: { selectedIndices: [] as number[] },
  paramFields: [],
  evaluate: (inputs, params) => {
    const points = Array.isArray(inputs.points) ? (inputs.points as unknown[]) : [];
    const selected = Array.isArray(params.selectedIndices) ? (params.selectedIndices as number[]) : [];
    const selectedSet = new Set(selected);

    const mask = points.map((_, i) => (selectedSet.has(i) ? 1 : 0));
    const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();

    return { points, mask, matrix, count: selected.length };
  },
};
