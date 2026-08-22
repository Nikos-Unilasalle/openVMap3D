import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { NodeDefinition } from "../types";
import { clearMeshWarning, findFirstMesh, warnMeshRequired } from "../meshRequired";
import { primitiveOutputs } from "./object";

export type FaceSelectMode = "all" | "normal" | "height";

export interface FaceSelectionConfig {
  mode: FaceSelectMode;
  axis: "x" | "y" | "z";
  threshold: number;
  invert: boolean;
}

const AXIS_VECTORS: Record<"x" | "y" | "z", THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

function triangleNormal(positions: Float32Array, a: number, b: number, c: number): THREE.Vector3 {
  const pa = new THREE.Vector3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]);
  const pb = new THREE.Vector3(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]);
  const pc = new THREE.Vector3(positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]);
  return new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa)).normalize();
}

/**
 * Which triangles a modifier acts on, expressed as a geometric predicate
 * instead of manual per-face picking — there's no interactive selection
 * state anywhere in this graph (every node is a pure function re-run every
 * frame), so "select the top faces" has to be a formula, not a click. This
 * mirrors the 90% case of Blender's own field-based selection (facing a
 * direction, above a height) without needing a general field/attribute
 * system to express it.
 */
export function selectFaces(positions: Float32Array, indices: ArrayLike<number>, faceCount: number, config: FaceSelectionConfig): boolean[] {
  const result = new Array<boolean>(faceCount);
  const axisVec = AXIS_VECTORS[config.axis] ?? AXIS_VECTORS.y;

  for (let f = 0; f < faceCount; f++) {
    const a = indices[f * 3];
    const b = indices[f * 3 + 1];
    const c = indices[f * 3 + 2];

    let selected: boolean;
    if (config.mode === "all") {
      selected = true;
    } else if (config.mode === "normal") {
      selected = triangleNormal(positions, a, b, c).dot(axisVec) >= config.threshold;
    } else {
      // height: average of the face's own 3 vertices along the chosen axis
      const key = config.axis === "x" ? 0 : config.axis === "y" ? 1 : 2;
      const avg = (positions[a * 3 + key] + positions[b * 3 + key] + positions[c * 3 + key]) / 3;
      selected = avg >= config.threshold;
    }

    result[f] = config.invert ? !selected : selected;
  }
  return result;
}

export const FACE_SELECTION_PARAM_FIELDS = [
  { id: "selectMode", label: "Select", kind: "select" as const, options: ["all", "normal", "height"] },
  { id: "axis", label: "Axis", kind: "select" as const, options: ["x", "y", "z"] },
  { id: "threshold", label: "Threshold", kind: "number" as const, step: 0.1 },
  { id: "invert", label: "Invert Selection", kind: "boolean" as const },
];

export function faceSelectionConfigFromParams(params: Record<string, unknown>): FaceSelectionConfig {
  const mode = params.selectMode === "normal" || params.selectMode === "height" ? params.selectMode : "all";
  const axis = params.axis === "x" || params.axis === "z" ? params.axis : "y";
  return {
    mode,
    axis,
    threshold: Number(params.threshold) || 0,
    invert: Boolean(params.invert),
  };
}

interface WeldedMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

/** Position-only weld, same trick as subdivide.ts's toIndexedMesh — extrude's boundary-edge detection needs a shared-vertex mesh (an edge is only "interior" if both its triangles agree it's the same vertex pair). */
function toWeldedMesh(geometry: THREE.BufferGeometry): WeldedMesh | null {
  const posAttr = geometry.attributes.position;
  if (!posAttr) return null;
  const positionOnly = new THREE.BufferGeometry();
  positionOnly.setAttribute("position", posAttr.clone());
  if (geometry.index) positionOnly.setIndex(geometry.index.clone());
  const welded = mergeVertices(positionOnly, 1e-4);
  const weldedIndex = welded.index;
  if (!weldedIndex) return null;
  return {
    positions: new Float32Array((welded.attributes.position as THREE.BufferAttribute).array),
    indices: new Uint32Array(weldedIndex.array),
  };
}

/**
 * Extrudes the selected faces outward along their own averaged vertex
 * normals: duplicates the selected patch's vertices, offsets the duplicates
 * by `distance`, re-targets the selected faces onto the duplicates (the
 * raised cap), and stitches a wall of new triangles around the patch's
 * boundary — every edge touched by exactly one selected face (a mesh
 * boundary within the selection) or shared between one selected and one
 * unselected face. An edge shared by two selected faces is interior to the
 * patch and gets no wall.
 *
 * Wall winding comes from the selected face's own edge direction (not just
 * the undirected pair) so it comes out facing outward automatically,
 * consistent with the cap, without guessing from geometry.
 */
function extrudeSelected(mesh: WeldedMesh, selected: boolean[], distance: number): WeldedMesh {
  const { positions, indices } = mesh;
  const faceCount = indices.length / 3;
  const vertexCount = positions.length / 3;

  const vertexNormalSum = new Float32Array(vertexCount * 3);
  const vertexSelected = new Uint8Array(vertexCount);
  for (let f = 0; f < faceCount; f++) {
    if (!selected[f]) continue;
    const a = indices[f * 3];
    const b = indices[f * 3 + 1];
    const c = indices[f * 3 + 2];
    const n = triangleNormal(positions, a, b, c);
    for (const v of [a, b, c]) {
      vertexSelected[v] = 1;
      vertexNormalSum[v * 3] += n.x;
      vertexNormalSum[v * 3 + 1] += n.y;
      vertexNormalSum[v * 3 + 2] += n.z;
    }
  }

  const oldToNew = new Int32Array(vertexCount).fill(-1);
  const outPositions: number[] = Array.from(positions);
  for (let v = 0; v < vertexCount; v++) {
    if (!vertexSelected[v]) continue;
    const nx = vertexNormalSum[v * 3];
    const ny = vertexNormalSum[v * 3 + 1];
    const nz = vertexNormalSum[v * 3 + 2];
    const len = Math.hypot(nx, ny, nz) || 1;
    outPositions.push(
      positions[v * 3] + (nx / len) * distance,
      positions[v * 3 + 1] + (ny / len) * distance,
      positions[v * 3 + 2] + (nz / len) * distance,
    );
    oldToNew[v] = outPositions.length / 3 - 1;
  }

  const outIndices: number[] = [];
  for (let f = 0; f < faceCount; f++) {
    const a = indices[f * 3];
    const b = indices[f * 3 + 1];
    const c = indices[f * 3 + 2];
    if (selected[f]) {
      outIndices.push(oldToNew[a], oldToNew[b], oldToNew[c]);
    } else {
      outIndices.push(a, b, c);
    }
  }

  interface EdgeEntry {
    u: number;
    v: number;
    selected: boolean;
  }
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const edgeMap = new Map<string, EdgeEntry[]>();
  for (let f = 0; f < faceCount; f++) {
    const tri = [indices[f * 3], indices[f * 3 + 1], indices[f * 3 + 2]];
    for (let e = 0; e < 3; e++) {
      const u = tri[e];
      const v = tri[(e + 1) % 3];
      const key = edgeKey(u, v);
      const arr = edgeMap.get(key) ?? [];
      arr.push({ u, v, selected: selected[f] });
      edgeMap.set(key, arr);
    }
  }

  for (const entries of edgeMap.values()) {
    const selEntry = entries.find((e) => e.selected);
    if (!selEntry) continue;
    const selectedCount = entries.filter((e) => e.selected).length;
    if (selectedCount === entries.length && entries.length === 2) continue; // interior to the patch
    const { u, v } = selEntry;
    const u2 = oldToNew[u];
    const v2 = oldToNew[v];
    outIndices.push(u, v, v2);
    outIndices.push(u, v2, u2);
  }

  return { positions: new Float32Array(outPositions), indices: new Uint32Array(outIndices) };
}

interface MeshEditState {
  mesh?: THREE.Mesh;
  lastSignature?: string;
}

const meshEditCache = createNodeCache<MeshEditState>((s) => {
  if (s.mesh) disposeObject3D(s.mesh);
});

function getState(cache: typeof meshEditCache, nodeId: string): MeshEditState {
  let state = cache.get(nodeId);
  if (!state) {
    state = {};
    cache.set(nodeId, state);
  }
  return state;
}

/**
 * Extrude Mesh modifier — pushes the selected faces outward along their own
 * averaged normal and stitches a wall around the patch. Distance is
 * wireable so it can be driven/animated like any other modifier param
 * (Subdivide's Levels, Lattice's Influence).
 *
 * UV/vertex-color attributes are not carried through, same tradeoff as
 * Subdivide made before it grew its own UV pass — extruding a texture
 * correctly needs new UV space for the cap and walls, which is real
 * additional work for a modifier whose job is silhouette, not
 * texture-mapped output. Normals are recomputed smooth.
 */
export const EXTRUDE_MESH_NODE: NodeDefinition = {
  type: "modifier/extrude",
  label: "Extrude Mesh",
  category: "transform",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry", owns: true },
    { id: "distance", label: "Distance", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  defaultParams: {
    distance: 0.5,
    selectMode: "all",
    axis: "y",
    threshold: 0,
    invert: false,
  },
  paramFields: [{ id: "distance", label: "Distance", kind: "number", step: 0.05 }, ...FACE_SELECTION_PARAM_FIELDS],
  evaluate: (inputs, params, ctx) => {
    const inputObj = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!inputObj) return { geometry: null };

    const srcMesh = findFirstMesh(inputObj);
    const srcGeom = srcMesh?.geometry;
    if (!srcMesh || !srcGeom || !srcGeom.attributes.position) {
      warnMeshRequired(ctx.nodeId, "Extrude Mesh", inputObj);
      return primitiveOutputs(inputObj);
    }
    clearMeshWarning(ctx.nodeId);

    const distance = inputs.distance !== undefined ? Number(inputs.distance) : Number(params.distance) || 0;
    const selection = faceSelectionConfigFromParams(params);

    const state = getState(meshEditCache, ctx.nodeId);
    const signature = `${distance}:${selection.mode}:${selection.axis}:${selection.threshold}:${selection.invert}:${srcGeom.attributes.position.count}:${srcGeom.index?.count ?? -1}`;
    if (state.mesh && state.lastSignature === signature) {
      // srcMesh.matrix is only its LOCAL pose — correct for a mesh that
      // directly carries its own transform (Box, Sphere, ...), but wrong for
      // one nested under a posed wrapper group (OBJ Model bakes its Location/
      // Rotation/Scale/Pivot onto the group, not the mesh inside it), where
      // .matrix alone is identity and this would silently reset the pose.
      // matrixWorld is correct either way. Also force matrixAutoUpdate off
      // rather than copying the source's flag: an OBJ-parsed mesh defaults to
      // true, which would have three's own render loop recompute (and wipe)
      // this matrix from its untouched position/quaternion/scale next frame.
      inputObj.updateMatrixWorld(true);
      state.mesh.matrixAutoUpdate = false;
      state.mesh.matrix.copy(srcMesh.matrixWorld);
      return primitiveOutputs(state.mesh);
    }

    const welded = toWeldedMesh(srcGeom);
    if (!welded) return primitiveOutputs(inputObj);

    const faceCount = welded.indices.length / 3;
    const selected = selectFaces(welded.positions, welded.indices, faceCount, selection);
    if (distance === 0 || !selected.some(Boolean)) {
      return primitiveOutputs(inputObj);
    }

    const result = extrudeSelected(welded, selected, distance);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(result.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    if (!state.mesh) {
      state.mesh = new THREE.Mesh(geometry, srcMesh.material);
      state.mesh.castShadow = true;
      state.mesh.receiveShadow = true;
    } else {
      state.mesh.geometry.dispose();
      state.mesh.geometry = geometry;
      state.mesh.material = srcMesh.material;
    }
    // See the first occurrence above for why matrixWorld (not matrix) and
    // a forced-false matrixAutoUpdate.
    inputObj.updateMatrixWorld(true);
    state.mesh.matrixAutoUpdate = false;
    state.mesh.matrix.copy(srcMesh.matrixWorld);
    state.lastSignature = signature;

    return primitiveOutputs(state.mesh);
  },
};

/**
 * Delete Geometry modifier — drops the selected faces entirely rather than
 * moving anything, so unlike Extrude this needs no new topology: surviving
 * faces keep their original vertex indices verbatim, which means position,
 * normal, UV, everything carries through untouched. Orphaned vertices (no
 * longer referenced by any surviving face) are left in the buffer rather
 * than compacted — wasted memory is cheaper than a second remap pass, and
 * three.js draws nothing but what the index buffer points at.
 */
export const DELETE_GEOMETRY_NODE: NodeDefinition = {
  type: "modifier/delete-geometry",
  label: "Delete Geometry",
  category: "transform",
  inputs: [{ id: "geometry", label: "Geometry", type: "geometry", owns: true }],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  defaultParams: {
    // "height" + threshold 0 deletes exactly the upper half by default — a
    // visible, obviously-a-starting-point result, rather than "all" which
    // (with invert off) would delete the entire mesh the instant this node
    // is dropped in.
    selectMode: "height",
    axis: "y",
    threshold: 0,
    invert: false,
  },
  paramFields: FACE_SELECTION_PARAM_FIELDS,
  evaluate: (inputs, params, ctx) => {
    const inputObj = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!inputObj) return { geometry: null };

    const srcMesh = findFirstMesh(inputObj);
    const srcGeom = srcMesh?.geometry;
    if (!srcMesh || !srcGeom || !srcGeom.attributes.position) {
      warnMeshRequired(ctx.nodeId, "Delete Geometry", inputObj);
      return primitiveOutputs(inputObj);
    }
    clearMeshWarning(ctx.nodeId);

    const selection = faceSelectionConfigFromParams(params);
    const state = getState(meshEditCache, ctx.nodeId);
    const signature = `${selection.mode}:${selection.axis}:${selection.threshold}:${selection.invert}:${srcGeom.attributes.position.count}:${srcGeom.index?.count ?? -1}`;
    if (state.mesh && state.lastSignature === signature) {
      // See the first occurrence above for why matrixWorld (not matrix) and
      // a forced-false matrixAutoUpdate.
      inputObj.updateMatrixWorld(true);
      state.mesh.matrixAutoUpdate = false;
      state.mesh.matrix.copy(srcMesh.matrixWorld);
      return primitiveOutputs(state.mesh);
    }

    const posAttr = srcGeom.attributes.position;
    const srcIndex = srcGeom.index;
    const faceCount = srcIndex ? srcIndex.count / 3 : posAttr.count / 3;
    const positions = new Float32Array(posAttr.array as ArrayLike<number>);
    const indices: number[] = [];
    if (srcIndex) {
      for (let i = 0; i < srcIndex.count; i++) indices.push(srcIndex.getX(i));
    } else {
      for (let i = 0; i < posAttr.count; i++) indices.push(i);
    }

    const toDelete = selectFaces(positions, indices, faceCount, selection);
    const keepIndices: number[] = [];
    for (let f = 0; f < faceCount; f++) {
      if (toDelete[f]) continue;
      keepIndices.push(indices[f * 3], indices[f * 3 + 1], indices[f * 3 + 2]);
    }

    const geometry = srcGeom.clone();
    geometry.setIndex(keepIndices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    if (!state.mesh) {
      state.mesh = new THREE.Mesh(geometry, srcMesh.material);
      state.mesh.castShadow = true;
      state.mesh.receiveShadow = true;
    } else {
      state.mesh.geometry.dispose();
      state.mesh.geometry = geometry;
      state.mesh.material = srcMesh.material;
    }
    // See the first occurrence above for why matrixWorld (not matrix) and
    // a forced-false matrixAutoUpdate.
    inputObj.updateMatrixWorld(true);
    state.mesh.matrixAutoUpdate = false;
    state.mesh.matrix.copy(srcMesh.matrixWorld);
    state.lastSignature = signature;

    return primitiveOutputs(state.mesh);
  },
};
