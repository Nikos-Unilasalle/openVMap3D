import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { IndexedMesh, subdivide as runSubdivide, SubdivisionMode } from "../subdivision";
import { NodeDefinition } from "../types";
import { clearMeshWarning, findFirstMesh, warnMeshRequired } from "../meshRequired";
import { primitiveOutputs } from "./object";


interface SubdivideState {
  mesh?: THREE.Mesh;
  /** Skips re-running the algorithm when neither the source geometry nor the params changed since last frame — a few subdivision levels of Catmull-Clark is real CPU work, not free to redo 60 times a second. */
  lastSignature?: string;
}

const subdivideCache = createNodeCache<SubdivideState>((s) => {
  if (s.mesh) disposeObject3D(s.mesh);
});

function getState(nodeId: string): SubdivideState {
  let state = subdivideCache.get(nodeId);
  if (!state) {
    state = {};
    subdivideCache.set(nodeId, state);
  }
  return state;
}

/**
 * Extracts a plain indexed, *welded* {positions, indices} pair from a
 * source geometry — subdivision.ts's algorithms both assume a shared-vertex
 * mesh (an edge point is computed once and reused by both triangles either
 * side of it; a vertex point needs the *complete* ring of faces around that
 * vertex to average over).
 *
 * Every three.js primitive already ships an index buffer, but not a welded
 * one: a Box needs 3 different normals at each corner (one per face), which
 * three.js gets by giving that corner 3 separate position entries — same
 * coordinates, different vertex. Subdividing straight off that index treats
 * each of a Box's 6 faces as its own disconnected island with no shared
 * edges to any neighbour, which is exactly what produced the twisted,
 * saddle-shaped result reported against Catmull-Clark on a Box: every
 * "boundary" vertex point was only ever averaging its own face's two edges,
 * not the full ring a real interior corner has.
 *
 * `mergeVertices` itself hashes on *every* attribute present, so it
 * wouldn't merge those same-position-different-normal corners either — this
 * builds a position-only geometry first (this node drops normals/UVs after
 * subdividing regardless, see toBufferGeometry) so the weld runs on
 * coordinates alone.
 */
function toIndexedMesh(geometry: THREE.BufferGeometry): IndexedMesh | null {
  const posAttr = geometry.attributes.position;
  if (!posAttr) return null;

  const positionOnly = new THREE.BufferGeometry();
  positionOnly.setAttribute("position", posAttr.clone());
  if (geometry.index) positionOnly.setIndex(geometry.index.clone());

  const welded = mergeVertices(positionOnly, 1e-4);
  const weldedPosAttr = welded.attributes.position as THREE.BufferAttribute;
  const weldedIndex = welded.index;
  if (!weldedIndex) return null;

  return {
    positions: new Float32Array(weldedPosAttr.array),
    indices: new Uint32Array(weldedIndex.array),
  };
}

function toBufferGeometry(mesh: IndexedMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  // UVs and other attributes aren't carried through — subdividing them
  // correctly needs the same face/edge/vertex-point treatment as position,
  // and for Catmull-Clark that's real additional complexity for a modifier
  // whose job is silhouette smoothing, not texture-mapped output. Dropped
  // rather than left stale/mismatched-length.
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export const SUBDIVIDE_NODE: NodeDefinition = {
  type: "modifier/subdivide",
  label: "Subdivide",
  category: "transform",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry", owns: true },
    { id: "levels", label: "Levels", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  defaultParams: {
    mode: "catmull-clark",
    levels: 1,
  },
  paramFields: [
    { id: "mode", label: "Mode", kind: "select", options: ["simple", "catmull-clark"] },
    { id: "levels", label: "Levels", kind: "number", step: 1 },
  ],
  evaluate: (inputs, params, ctx) => {
    const inputObj = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!inputObj) return { geometry: null };

    const srcMesh = findFirstMesh(inputObj);
    const srcGeom = srcMesh?.geometry;
    if (!srcMesh || !srcGeom || !srcGeom.attributes.position) {
      warnMeshRequired(ctx.nodeId, "Subdivide", inputObj);
      return primitiveOutputs(inputObj);
    }
    clearMeshWarning(ctx.nodeId);

    const mode: SubdivisionMode = params.mode === "simple" ? "simple" : "catmull-clark";
    const levels = Math.max(0, Math.min(5, Math.round(Number(params.levels) || 0)));

    // Capped at 5: Catmull-Clark roughly triples the triangle count (and
    // Simple quadruples it) per level, so level 5 alone is already a
    // several-hundred-thousand-triangle mesh off of a 100-triangle source —
    // past that the cap exists to keep a typo in the param field from
    // freezing the tab rather than to limit legitimate use.

    const state = getState(ctx.nodeId);

    const signature = `${mode}:${levels}:${srcGeom.attributes.position.count}:${srcGeom.index?.count ?? -1}`;
    if (state.mesh && state.lastSignature === signature) {
      // Topology unchanged since last run — skip re-subdividing, but the
      // source's pose still needs copying every call: an upstream animation
      // moves srcMesh.matrix every frame without ever touching its geometry,
      // so signature alone would stay stable and this early return used to
      // leave state.mesh frozen at whatever pose it last recomputed at.
      state.mesh.matrixAutoUpdate = srcMesh.matrixAutoUpdate;
      state.mesh.matrix.copy(srcMesh.matrix);
      return primitiveOutputs(state.mesh);
    }

    const indexedMesh = toIndexedMesh(srcGeom);
    if (!indexedMesh) return primitiveOutputs(inputObj);

    const result = runSubdivide(indexedMesh, mode, levels);
    const geometry = toBufferGeometry(result);

    if (!state.mesh) {
      state.mesh = new THREE.Mesh(geometry, srcMesh.material);
      state.mesh.castShadow = true;
      state.mesh.receiveShadow = true;
    } else {
      state.mesh.geometry.dispose();
      state.mesh.geometry = geometry;
      state.mesh.material = srcMesh.material;
    }
    // Same pose as whatever was plugged in — this node reshapes the
    // surface, it doesn't move it, so it has no location/rotation/scale of
    // its own the way Lattice Deform's cage does.
    state.mesh.matrixAutoUpdate = srcMesh.matrixAutoUpdate;
    state.mesh.matrix.copy(srcMesh.matrix);
    state.lastSignature = signature;

    return primitiveOutputs(state.mesh);
  },
};
