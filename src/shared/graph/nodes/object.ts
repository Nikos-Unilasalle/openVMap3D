import * as THREE from "three";
import { NodeDefinition } from "../types";

/**
 * Meshes are stable GPU resources, not values a pure function can hand back
 * fresh every frame — the viewport needs the *same* Object3D reference every
 * evaluation so it can keep it in its THREE.Scene rather than re-adding a new
 * one 60 times a second. Cached here, outside the pure evaluate(), keyed by
 * the node's own id (ctx.nodeId) — same shape as OpenVMap's texture cache.
 * No release hook yet: fine for the smoke-test scale of graphs this engine
 * runs today, but this cache will leak across full node deletion once the
 * editor can delete nodes — needs a disposeNode(id) call from wherever that
 * lands, tracked as a follow-up, not solved here.
 */
const meshCache = new Map<string, THREE.Mesh>();

function boxMesh(nodeId: string): THREE.Mesh {
  const existing = meshCache.get(nodeId);
  if (existing) return existing;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  meshCache.set(nodeId, mesh);
  return mesh;
}

/**
 * "Polygon or imported mesh, same node type" per BIBLE.md — box is the one
 * primitive implemented today, standing in for the general case while the
 * pipeline itself gets proven end to end. More primitives (plane, sphere,
 * imported glTF) are additive later, same node shape.
 */
export const OBJECT_BOX_NODE: NodeDefinition = {
  type: "object/box",
  label: "Box",
  category: "structure",
  inputs: [
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "color", label: "Color", type: "color" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { color: new THREE.Color(0xffffff) },
  paramFields: [{ id: "color", label: "Color (fallback)", kind: "color" }],
  evaluate: (inputs, params, ctx) => {
    const mesh = boxMesh(ctx.nodeId);

    const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrix);

    const color = inputs.color instanceof THREE.Color ? inputs.color : (params.color as THREE.Color);
    (mesh.material as THREE.MeshStandardMaterial).color.copy(color);

    return { geometry: mesh };
  },
};

function planeMesh(nodeId: string): THREE.Mesh {
  const existing = meshCache.get(nodeId);
  if (existing) return existing;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  );
  meshCache.set(nodeId, mesh);
  return mesh;
}

/** 2D Plane polygon primitive (flat z=0 quad in 3D). */
export const OBJECT_PLANE_NODE: NodeDefinition = {
  type: "object/plane",
  label: "Plane",
  category: "structure",
  inputs: [
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "color", label: "Color", type: "color" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { color: new THREE.Color(0xffffff) },
  paramFields: [{ id: "color", label: "Color (fallback)", kind: "color" }],
  evaluate: (inputs, params, ctx) => {
    const mesh = planeMesh(ctx.nodeId);

    const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrix);

    const color = inputs.color instanceof THREE.Color ? inputs.color : (params.color as THREE.Color);
    (mesh.material as THREE.MeshStandardMaterial).color.copy(color);

    return { geometry: mesh };
  },
};

function sphereMesh(nodeId: string): THREE.Mesh {
  const existing = meshCache.get(nodeId);
  if (existing) return existing;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  meshCache.set(nodeId, mesh);
  return mesh;
}

/** Sphere 3D geometry primitive. */
export const OBJECT_SPHERE_NODE: NodeDefinition = {
  type: "object/sphere",
  label: "Sphere",
  category: "structure",
  inputs: [
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "color", label: "Color", type: "color" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { color: new THREE.Color(0xffffff) },
  paramFields: [{ id: "color", label: "Color (fallback)", kind: "color" }],
  evaluate: (inputs, params, ctx) => {
    const mesh = sphereMesh(ctx.nodeId);

    const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrix);

    const color = inputs.color instanceof THREE.Color ? inputs.color : (params.color as THREE.Color);
    (mesh.material as THREE.MeshStandardMaterial).color.copy(color);

    return { geometry: mesh };
  },
};

