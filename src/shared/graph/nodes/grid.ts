import * as THREE from "three";
import { NodeDefinition } from "../types";
import { createNodeCache, disposeObject3D } from "../nodeCaches";

/**
 * GridHelper bakes size/divisions/color into its geometry and vertex
 * colors at construction — unlike Object's mesh cache (where only the
 * matrix/material color change), a size/divisions/color change here needs
 * a whole new instance, not a mutation. Cached and recreated only when one
 * of those three actually changes; the old geometry/material are disposed
 * on replacement, same GPU hygiene as Viewport's own renderer.dispose().
 */
interface CachedGrid {
  grid: THREE.GridHelper;
  size: number;
  divisions: number;
  colorHex: number;
}

const gridCache = createNodeCache<CachedGrid>((c) => disposeObject3D(c.grid));

function getGrid(nodeId: string, size: number, divisions: number, color: THREE.Color): THREE.GridHelper {
  const colorHex = color.getHex();
  const cached = gridCache.get(nodeId);
  if (cached && cached.size === size && cached.divisions === divisions && cached.colorHex === colorHex) {
    return cached.grid;
  }
  if (cached) {
    cached.grid.geometry.dispose();
    (cached.grid.material as THREE.Material).dispose();
  }
  const grid = new THREE.GridHelper(size, divisions, color, color);
  gridCache.set(nodeId, { grid, size, divisions, colorHex });
  return grid;
}

/**
 * "3D Grid" from BIBLE.md's Calibration section — a visual overlay for
 * millimetring animations (and Manual Alignment, see camera.ts) against
 * the real physical space. Just reference geometry: feed it into Merge
 * alongside the real scene objects to see both at once.
 */
export const GRID_NODE: NodeDefinition = {
  type: "calibration/grid",
  label: "3D Grid",
  category: "calibration",
  inputs: [{ id: "matrix", label: "Matrix", type: "matrix" }],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { size: 10, divisions: 10, color: new THREE.Color(0x38bdf8) },
  paramFields: [
    { id: "size", label: "Size", kind: "number" },
    { id: "divisions", label: "Divisions", kind: "number" },
    { id: "color", label: "Color", kind: "color" },
  ],
  evaluate: (inputs, params, ctx) => {
    const size = Math.max(0.01, Number(params.size) || 10);
    const divisions = Math.max(1, Math.floor(Number(params.divisions) || 10));
    const color = params.color instanceof THREE.Color ? params.color : new THREE.Color(0x38bdf8);
    const grid = getGrid(ctx.nodeId, size, divisions, color);

    const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
    grid.matrixAutoUpdate = false;
    grid.matrix.copy(matrix);

    return { geometry: grid };
  },
};
