import * as THREE from "three";
import { NodeDefinition } from "../types";
import { clearMeshWarning, findFirstMesh, warnMeshRequired } from "../meshRequired";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { primitiveOutputs } from "./object";

/**
 * Mesh to Points — one Vector3 per raw vertex-buffer entry, in the
 * mesh's own LOCAL space (not world), matching the convention Curve
 * handles/Lattice already use: points travel local, `matrix` travels
 * alongside for whoever needs to place them in the world (the viewport's
 * Points Selection handles, in particular).
 *
 * Deliberately one point per buffer entry rather than per unique position:
 * a Box has three coincident-but-distinct vertices per corner (different
 * normals/UVs), and Points to Geometry writes this list straight back by
 * index — welding first would desync that round-trip. The cost is that a
 * seam's corners can be selected independently and spring apart; documented
 * on the node rather than solved, since welding-then-unwelding correctly is
 * a bigger feature on its own.
 */
export const MESH_TO_POINTS_NODE: NodeDefinition = {
  type: "converter/mesh-to-points",
  label: "Mesh to Points",
  category: "converter",
  inputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
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

    const mesh = findFirstMesh(inputObj);
    const posAttr = mesh?.geometry?.attributes.position;
    if (!mesh || !posAttr) {
      warnMeshRequired(ctx.nodeId, "Mesh to Points", inputObj);
      return { points: [], geometry: inputObj, matrix: new THREE.Matrix4(), count: 0 };
    }
    clearMeshWarning(ctx.nodeId);

    // Same "force" reasoning as Lattice Deform: a node feeding this one is no
    // longer drawn itself, so its matrixWorld is never refreshed otherwise.
    mesh.updateWorldMatrix(true, false, true);

    const points: THREE.Vector3[] = new Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) {
      points[i] = new THREE.Vector3().fromBufferAttribute(posAttr, i);
    }

    return { points, geometry: inputObj, matrix: mesh.matrixWorld.clone(), count: points.length };
  },
};

interface PointsToGeometryState {
  mesh?: THREE.Mesh;
}

const p2gCache = createNodeCache<PointsToGeometryState>((s) => {
  if (s.mesh) disposeObject3D(s.mesh);
});

function getState(nodeId: string): PointsToGeometryState {
  let state = p2gCache.get(nodeId);
  if (!state) {
    state = {};
    p2gCache.set(nodeId, state);
  }
  return state;
}

/**
 * Points to Mesh — closes the loop Geometry to Points opens: writes a
 * (possibly edited/animated) points list back into a clone of the original
 * mesh's position buffer, by index. `geometry` here is meant to be Geometry
 * to Points' own `geometry` passthrough output, not some other mesh — the
 * index alignment (and vertex count) has to match exactly, which passing
 * the *same* node's two outputs through this pipe guarantees; wiring in an
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

    const srcMesh = findFirstMesh(inputObj);
    const srcGeom = srcMesh?.geometry;
    if (!srcMesh || !srcGeom || !srcGeom.attributes.position) {
      warnMeshRequired(ctx.nodeId, "Points to Mesh", inputObj);
      return { geometry: inputObj };
    }

    const points = Array.isArray(inputs.points) ? (inputs.points as unknown[]) : [];
    const posAttr = srcGeom.attributes.position;
    if (points.length !== posAttr.count) {
      warnMeshRequired(ctx.nodeId, "Points to Mesh", inputObj);
      return { geometry: inputObj };
    }
    clearMeshWarning(ctx.nodeId);

    const state = getState(ctx.nodeId);
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      const p = points[i] as { x?: number; y?: number; z?: number };
      positions[i * 3] = Number(p?.x) || 0;
      positions[i * 3 + 1] = Number(p?.y) || 0;
      positions[i * 3 + 2] = Number(p?.z) || 0;
    }

    const geometry = srcGeom.clone();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
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
    state.mesh.matrixAutoUpdate = false;
    state.mesh.matrix.copy(srcMesh.matrix);

    return primitiveOutputs(state.mesh);
  },
};
