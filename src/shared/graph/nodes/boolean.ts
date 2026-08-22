import * as THREE from "three";
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from "three-bvh-csg";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { NodeDefinition } from "../types";
import { clearMeshWarning, findFirstMesh, warnMeshRequired } from "../meshRequired";
import { primitiveOutputs } from "./object";


interface BooleanState {
  mesh?: THREE.Mesh;
  /** Skips re-running the (expensive) CSG when neither geometry, pose nor params changed. */
  lastSignature?: string;
}

const booleanCache = createNodeCache<BooleanState>((s) => {
  if (s.mesh) disposeObject3D(s.mesh);
});

function getState(nodeId: string): BooleanState {
  let state = booleanCache.get(nodeId);
  if (!state) {
    state = {};
    booleanCache.set(nodeId, state);
  }
  return state;
}

/** three-bvh-csg stores its MeshBVH on `geometry.n` — null it before disposing. */
function disposeGeometry(g: THREE.BufferGeometry): void {
  (g as { n?: unknown }).n = null;
  g.dispose();
}

/**
 * A cheap FNV-1a over the raw bytes of a position attribute. Animating a source
 * mesh at the *vertex* level (a deform feeding this node) mutates positions in
 * place and keeps the same geometry uuid, so a uuid-only cache signature would
 * wrongly reuse the stale CSG result and freeze the animation. Hashing the
 * positions detects that change for a small per-evaluate cost (still far
 * cheaper than re-running the CSG).
 */
function hashPositions(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): string {
  const arr = attr?.array as ArrayLike<number> | undefined;
  if (!arr) return "none";
  const view = new DataView(
    (arr as Float32Array).buffer,
    (arr as Float32Array).byteOffset,
    (arr as Float32Array).byteLength,
  );
  let hash = 0x811c9dc5;
  for (let i = 0; i < view.byteLength; i++) {
    hash ^= view.getUint8(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

const OPERATIONS: Record<string, number> = { add: ADDITION, subtract: SUBTRACTION, intersect: INTERSECTION };

/**
 * Boolean (CSG) modifier — combines two closed meshes via union / subtraction /
 * intersection using three-bvh-csg. Both inputs' world transforms are baked into
 * their geometry first, so the shapes meet wherever you actually placed them.
 *
 * For the cleanest result both inputs should be watertight (manifold, no open
 * edges) — CSG cannot recover from open or self-intersecting surfaces.
 */
export const BOOLEAN_NODE: NodeDefinition = {
  type: "modifier/boolean",
  label: "Boolean",
  category: "transform",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry", owns: true },
    { id: "boolean", label: "Boolean Shape", type: "geometry", owns: true },
    { id: "operation", label: "Operation", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  defaultParams: {
    operation: "subtract",
    useGroups: true,
  },
  paramFields: [
    { id: "operation", label: "Operation", kind: "select", options: ["add", "subtract", "intersect"] },
    { id: "useGroups", label: "Keep Materials (Groups)", kind: "boolean" },
  ],
  evaluate: (inputs, params, ctx) => {
    const inputA = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    const inputB = inputs.boolean instanceof THREE.Object3D ? inputs.boolean : null;
    if (!inputA || !inputB) {
      return inputA ? primitiveOutputs(inputA) : { geometry: null };
    }

    const srcA = findFirstMesh(inputA);
    const srcB = findFirstMesh(inputB);
    if (!srcA || !srcB || !srcA.geometry?.attributes.position || !srcB.geometry?.attributes.position) {
      warnMeshRequired(ctx.nodeId, "Boolean", srcA ? inputB : inputA);
      return primitiveOutputs(inputA);
    }
    clearMeshWarning(ctx.nodeId);

    // Recompute the sources' world matrices, forced, from their OWN root
    // (inputA/inputB), not from the found mesh: a mesh feeding a modifier is
    // no longer drawn itself, so nothing keeps its matrixWorld fresh, and
    // `mesh.updateWorldMatrix(true, false, true)` only forwards `force` to
    // the mesh itself — three's own updateWorldMatrix does NOT propagate
    // force to the parent it climbs to (see Object3D.updateWorldMatrix), so
    // a mesh nested under a posed wrapper group whose own matrixWorldNeedsUpdate
    // was never set (OBJ Model bakes its pose onto exactly such a group)
    // still computed a stale/identity world matrix despite this call.
    // updateMatrixWorld(true) from the root correctly cascades force
    // downward through every descendant instead.
    inputA.updateMatrixWorld(true);
    inputB.updateMatrixWorld(true);

    const operation = String(inputs.operation ?? params.operation ?? "subtract");
    const useGroups = Boolean(params.useGroups);

    const state = getState(ctx.nodeId);

    const signature = JSON.stringify([
      operation,
      useGroups,
      srcA.geometry.uuid,
      hashPositions(srcA.geometry.attributes.position),
      [...srcA.matrixWorld.elements],
      srcB.geometry.uuid,
      hashPositions(srcB.geometry.attributes.position),
      [...srcB.matrixWorld.elements],
    ]);
    if (state.mesh && state.lastSignature === signature) {
      return primitiveOutputs(state.mesh);
    }

    // Clone + bake each shape's world transform so the CSG happens in world
    // space — the two shapes meet wherever you actually positioned them. Pass
    // each shape's material so, with useGroups on, faces that came from object
    // 2 keep object 2's material (the result carries a material array).
    const brushA = new Brush(srcA.geometry.clone(), srcA.material);
    brushA.geometry.applyMatrix4(srcA.matrixWorld);
    const brushB = new Brush(srcB.geometry.clone(), srcB.material);
    brushB.geometry.applyMatrix4(srcB.matrixWorld);

    try {
      const evaluator = new Evaluator();
      evaluator.useGroups = useGroups;
      const result = evaluator.evaluate(brushA, brushB, OPERATIONS[operation] ?? SUBTRACTION);
      const geometry = result.geometry;

      if (!state.mesh) {
        state.mesh = new THREE.Mesh(geometry, useGroups ? result.material : srcA.material);
        state.mesh.castShadow = true;
        state.mesh.receiveShadow = true;
      } else {
        disposeGeometry(state.mesh.geometry);
        state.mesh.geometry = geometry;
        // useGroups → the library hands back a per-input material array, so
        // faces from object 2 inherit object 2's material; otherwise a single
        // material (object 1's) applies to the whole result.
        state.mesh.material = useGroups ? result.material : srcA.material;
      }
      // The result is already positioned (both inputs baked) — local identity.
      state.mesh.matrixAutoUpdate = false;
      state.mesh.matrix.identity();
      state.lastSignature = signature;
      return primitiveOutputs(state.mesh);
    } catch (err) {
      console.error("Boolean CSG failed:", err);
      return primitiveOutputs(inputA);
    } finally {
      disposeGeometry(brushA.geometry);
      disposeGeometry(brushB.geometry);
    }
  },
};
