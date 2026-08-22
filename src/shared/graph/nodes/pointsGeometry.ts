import * as THREE from "three";
import { NodeDefinition } from "../types";
import { clearMeshWarning, findFirstMesh, warnMeshRequired } from "../meshRequired";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { primitiveOutputs } from "./object";

export interface ExtractedPoints {
  points: THREE.Vector3[];
  /** The original object, unchanged — pass straight through to Points to Mesh (or writePointsToMesh) so the round-trip has the right vertex count/topology/material to rebuild from. */
  geometry: THREE.Object3D;
  matrix: THREE.Matrix4;
  count: number;
}

/**
 * Shared extraction core behind Mesh to Points — one Vector3 per raw
 * vertex-buffer entry, in the mesh's own LOCAL space (not world), matching
 * the convention Curve handles/Lattice already use: points travel local,
 * `matrix` travels alongside for whoever needs to place them in the world
 * (the viewport's Points Selection handles, in particular).
 *
 * Deliberately one point per buffer entry rather than per unique position:
 * a Box has three coincident-but-distinct vertices per corner (different
 * normals/UVs), and writePointsToMesh writes this list straight back by
 * index — welding first would desync that round-trip. The cost is that a
 * seam's corners can be selected independently and spring apart; documented
 * here rather than solved, since welding-then-unwelding correctly is a
 * bigger feature on its own.
 *
 * `extraMatrix`, when given, is composed as an *outer* (world-level)
 * transform on top of the mesh's own world matrix — e.g. Points Selection
 * wiring a Transform node's output straight in to reposition where points
 * get extracted/placed without needing a separate node upstream of Mesh to
 * Points.
 *
 * Returns null (after warning once) when nothing mesh-shaped is wired in —
 * callers decide their own empty-result shape since Mesh to Points, Points
 * Selection and Spring Vector each want a different one.
 */
export function extractPointsFromMesh(
  inputObj: THREE.Object3D,
  nodeId: string,
  label: string,
  extraMatrix?: THREE.Matrix4,
): ExtractedPoints | null {
  const mesh = findFirstMesh(inputObj);
  const posAttr = mesh?.geometry?.attributes.position;
  if (!mesh || !posAttr) {
    warnMeshRequired(nodeId, label, inputObj);
    return null;
  }
  clearMeshWarning(nodeId);

  // Forced from inputObj (the root), not mesh: three's own
  // `mesh.updateWorldMatrix(true, false, true)` only forwards `force` to the
  // mesh itself, not to the parents it climbs to recompute — a wrapper group
  // whose matrixWorldNeedsUpdate flag was never set (true for OBJ Model,
  // which writes `.matrix` directly rather than through position/rotation/
  // scale) would silently keep a stale or identity matrixWorld regardless.
  // updateMatrixWorld(true) from the root correctly cascades force down
  // through every descendant instead. See shade.ts/lattice.ts for the same
  // fix and the full explanation.
  inputObj.updateMatrixWorld(true);

  const points: THREE.Vector3[] = new Array(posAttr.count);
  for (let i = 0; i < posAttr.count; i++) {
    points[i] = new THREE.Vector3().fromBufferAttribute(posAttr, i);
  }

  const matrix = extraMatrix ? new THREE.Matrix4().multiplyMatrices(extraMatrix, mesh.matrixWorld) : mesh.matrixWorld.clone();

  return { points, geometry: inputObj, matrix, count: points.length };
}

export interface ResolvedPointsInput {
  points: unknown[];
  matrix: THREE.Matrix4;
  geometry: THREE.Object3D | null;
}

/**
 * Shared "geometry-shortcut or explicit points+matrix" input resolution used
 * by both Points Selection and Points Influence — Geometry wins if both are
 * wired (not a sensible thing to wire both), otherwise falls back to the
 * explicit Points/Matrix pair (a Mesh to Points or Lattice Deform output).
 */
export function resolvePointsInput(
  inputs: Record<string, unknown>,
  nodeId: string,
  label: string,
): ResolvedPointsInput {
  if (inputs.geometry instanceof THREE.Object3D) {
    const extracted = extractPointsFromMesh(inputs.geometry, nodeId, label);
    return {
      points: extracted?.points ?? [],
      matrix: extracted?.matrix ?? new THREE.Matrix4(),
      geometry: extracted?.geometry ?? inputs.geometry,
    };
  }
  return {
    points: Array.isArray(inputs.points) ? (inputs.points as unknown[]) : [],
    matrix: inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4(),
    geometry: null,
  };
}

interface PointsMeshState {
  mesh?: THREE.Mesh;
  /** The source geometry the cached clone was built from — a different one means rebuild, not update. */
  srcGeom?: THREE.BufferGeometry;
}

const pointsMeshCache = createNodeCache<PointsMeshState>((s) => {
  if (s.mesh) disposeObject3D(s.mesh);
});

/**
 * Shared write-back core behind Points to Mesh — writes a (possibly edited/
 * animated) points list into a clone of `inputObj`'s own mesh's position
 * buffer, by index, and returns the rebuilt mesh (cached per `nodeId`, one
 * real THREE.Mesh reused frame to frame rather than rebuilt from scratch).
 *
 * `points` is meant to be index-aligned with whatever extractPointsFromMesh
 * produced for this same source — a length mismatch (a different mesh,
 * accidentally) returns the original object unchanged, with a console
 * warning, rather than corrupting anything.
 *
 * The clone happens ONCE per source geometry, not per frame. Re-cloning
 * every frame meant copying every attribute — index, uv, normal, none of
 * which this function changes — then disposing last frame's copy, which on
 * a heavy mesh both churned megabytes through the GC and forced three to
 * re-upload the *entire* vertex buffer set to the GPU each frame. Updating
 * the position attribute of the existing clone in place re-uploads only
 * what actually changed (position, and the normals recomputed from it).
 */
export function writePointsToMesh(nodeId: string, inputObj: THREE.Object3D, points: unknown[], label: string): THREE.Object3D {
  const srcMesh = findFirstMesh(inputObj);
  const srcGeom = srcMesh?.geometry;
  if (!srcMesh || !srcGeom || !srcGeom.attributes.position) {
    warnMeshRequired(nodeId, label, inputObj);
    return inputObj;
  }

  const posAttr = srcGeom.attributes.position;
  if (points.length !== posAttr.count) {
    warnMeshRequired(nodeId, label, inputObj);
    return inputObj;
  }
  clearMeshWarning(nodeId);

  let state = pointsMeshCache.get(nodeId);
  if (!state) {
    state = {};
    pointsMeshCache.set(nodeId, state);
  }

  // Rebuild only when there's nothing cached, the upstream geometry itself
  // was replaced, or its vertex count moved (a different mesh entirely).
  const cachedPos = state.mesh?.geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!state.mesh || state.srcGeom !== srcGeom || cachedPos?.count !== points.length) {
    if (state.mesh) disposeObject3D(state.mesh);
    const geometry = srcGeom.clone();
    state.mesh = new THREE.Mesh(geometry, srcMesh.material);
    state.mesh.castShadow = true;
    state.mesh.receiveShadow = true;
    state.srcGeom = srcGeom;
  }

  const geometry = state.mesh.geometry;
  const target = geometry.attributes.position as THREE.BufferAttribute;
  const array = target.array as Float32Array;
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as { x?: number; y?: number; z?: number };
    array[i * 3] = Number(p?.x) || 0;
    array[i * 3 + 1] = Number(p?.y) || 0;
    array[i * 3 + 2] = Number(p?.z) || 0;
  }
  target.needsUpdate = true;
  // Reuses the existing normal attribute's buffer rather than allocating one.
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  state.mesh.material = srcMesh.material;

  // matrixWorld, not matrix, and forced from the root — same reasoning as
  // extractPointsFromMesh above: srcMesh's own LOCAL matrix is identity when
  // it's nested under a posed wrapper group (OBJ Model), which would
  // silently drop the object's real pose.
  inputObj.updateMatrixWorld(true);
  state.mesh.matrixAutoUpdate = false;
  state.mesh.matrix.copy(srcMesh.matrixWorld);

  return state.mesh;
}

export const MESH_TO_POINTS_NODE: NodeDefinition = {
  type: "converter/mesh-to-points",
  label: "Mesh to Points",
  category: "converter",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    // An outer transform composed on top of the mesh's own world matrix —
    // wire in a Transform node (or anything else that outputs a Matrix) to
    // reposition where points get extracted/placed without an extra node
    // upstream of this one. Native edits already baked into the source
    // object's own pose (gizmo drags, an Array, a Set Instance Transform...)
    // are already captured via matrixWorld regardless of whether this is
    // wired — this is for composing something *additional*.
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  outputs: [
    { id: "points", label: "Points (Local)", type: "list" },
    { id: "geometry", label: "Geometry (passthrough)", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "count", label: "Count", type: "value" },
  ],
  defaultParams: {},
  paramFields: [],
  evaluate: (inputs, _params, ctx) => {
    const inputObj = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!inputObj) return { points: [], geometry: null, matrix: new THREE.Matrix4(), count: 0 };

    const extraMatrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : undefined;
    const result = extractPointsFromMesh(inputObj, ctx.nodeId, "Mesh to Points", extraMatrix);
    if (!result) return { points: [], geometry: inputObj, matrix: new THREE.Matrix4(), count: 0 };
    return { ...result };
  },
};

/**
 * Points to Mesh — closes the loop Mesh to Points opens: writes a (possibly
 * edited/animated) points list back into a clone of the original mesh's
 * position buffer, by index. `geometry` here is meant to be Mesh to Points'
 * own `geometry` passthrough output, not some other mesh — the index
 * alignment (and vertex count) has to match exactly, which passing the
 * *same* node's two outputs through this pipe guarantees; wiring in an
 * unrelated mesh with a different vertex count just passes the original
 * through unchanged (with a console warning) rather than corrupting it.
 */
export const POINTS_TO_MESH_NODE: NodeDefinition = {
  type: "converter/points-to-mesh",
  label: "Points to Mesh",
  category: "converter",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "points", label: "Points (Local)", type: "list" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {},
  paramFields: [],
  evaluate: (inputs, _params, ctx) => {
    const inputObj = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!inputObj) return { geometry: null };

    const points = Array.isArray(inputs.points) ? (inputs.points as unknown[]) : [];
    const result = writePointsToMesh(ctx.nodeId, inputObj, points, "Points to Mesh");
    return primitiveOutputs(result);
  },
};
