import * as THREE from "three";
import { NodeDefinition } from "../types";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { composeNativeMatrix } from "./transform";
import {
  applyMaterialParams,
  buildPrimitiveDynamicParamFields,
  COMMON_DEFAULT_PARAMS,
  COMMON_PRIMITIVE_INPUTS,
  COMMON_PRIMITIVE_OUTPUTS,
  extractMaterialParams,
  extractTextureParams,
  primitiveOutputs,
} from "./object";

interface FrozenState {
  mesh: THREE.Mesh;
  /** The exact params.positions array the current geometry was built from — a new Bake creates a new array, so identity is enough to detect it. */
  builtFrom?: unknown;
}

const frozenCache = createNodeCache<FrozenState>((s) => disposeObject3D(s.mesh));

function buildGeometry(params: Record<string, unknown>): THREE.BufferGeometry {
  const positions = Array.isArray(params.positions) ? (params.positions as number[]) : [];
  const normals = Array.isArray(params.normals) ? (params.normals as number[]) : [];
  const uvs = Array.isArray(params.uvs) ? (params.uvs as number[]) : [];
  const index = Array.isArray(params.index) ? (params.index as number[]) : null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length === positions.length) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  } else {
    geometry.computeVertexNormals();
  }
  if (uvs.length > 0) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  if (index) geometry.setIndex(index);
  return geometry;
}

/**
 * Frozen Geometry node — the actual output of Particle Render (Instances)'
 * Bake button (see bakeInstancesToGeometryData in particleInstances.ts). Its
 * geometry is stored as plain number arrays in params rather than a live
 * THREE object, so it round-trips through save/reload like any other node
 * and, being a real single Mesh, is exactly what Boolean, Subdivide and
 * Lattice Deform need (see meshRequired.ts) — none of which accept the
 * InstancedMesh it was captured from.
 */
export const OBJECT_FROZEN_NODE: NodeDefinition = {
  type: "object/frozen",
  label: "Frozen Geometry",
  category: "object",
  inputs: [...COMMON_PRIMITIVE_INPUTS],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: {
    ...COMMON_DEFAULT_PARAMS,
    positions: [] as number[],
    normals: [] as number[],
    uvs: [] as number[],
    index: null as number[] | null,
    // A baked-in geometry has no upstream node whose own default side choice
    // this could otherwise inherit (Box picks FrontSide, Plane picks
    // DoubleSide, each baked into their own evaluate call) — a source that
    // was two-sided (glTF's own doubleSided flag, e.g. a leaf or a cloth
    // panel with real thickness) needs its own switch here instead.
    doubleSided: 0,
  },
  paramFields: buildPrimitiveDynamicParamFields([
    { id: "doubleSided", label: "Double Sided", kind: "boolean", group: "Material" },
  ])(),
  dynamicParamFields: buildPrimitiveDynamicParamFields([
    { id: "doubleSided", label: "Double Sided", kind: "boolean", group: "Material" },
  ]),
  evaluate: (inputs, params, ctx) => {
    let state = frozenCache.get(ctx.nodeId);
    if (!state || state.builtFrom !== params.positions) {
      if (state) disposeObject3D(state.mesh);
      const mesh = new THREE.Mesh(buildGeometry(params), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.nodeId = ctx.nodeId;
      state = { mesh, builtFrom: params.positions };
      frozenCache.set(ctx.nodeId, state);
    }
    const mesh = state.mesh;

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    const side = params.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    applyMaterialParams(mesh, matParams, side, texParams);

    return primitiveOutputs(mesh);
  },
};
