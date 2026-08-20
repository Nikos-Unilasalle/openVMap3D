import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { NodeDefinition } from "../types";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { readPositionsSync, textureSizeFor } from "../particleRuntime";
import { findFirstMesh } from "../meshRequired";
import { isAlive } from "./particleTrails";
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
import { composeNativeMatrix } from "./transform";

function numberInput(input: unknown, param: unknown, fallback: number): number {
  const raw = input !== undefined ? input : param;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Ceiling on instances built in one frame. An InstancedMesh is one draw call
 * whatever the count, but each frame still walks the readback and writes a
 * Matrix4 per live particle on the CPU, so this is a frame-time guard rather
 * than a GPU one. Well above the "handful of particles" this node's mesh
 * sources realistically pair with.
 */
const MAX_INSTANCES = 20000;

interface InstanceState {
  mesh?: THREE.InstancedMesh;
  /** The geometry the instances were built from — swapping the Shape input rebuilds. */
  sourceGeometryId?: string;
  capacity?: number;
  /** The baked snapshot, once Bake to Mesh has been taken. Outlives the simulation deliberately. */
  baked?: THREE.Mesh;
}

const instanceCache = createNodeCache<InstanceState>((s) => {
  if (s.mesh) disposeObject3D(s.mesh);
  if (s.baked) disposeObject3D(s.baked);
});

function getState(nodeId: string): InstanceState {
  let state = instanceCache.get(nodeId);
  if (!state) {
    state = {};
    instanceCache.set(nodeId, state);
  }
  return state;
}

/**
 * Flattens an InstancedMesh's live instances into one ordinary Mesh — each
 * instance's matrix baked into a copy of the source geometry, all merged into
 * a single BufferGeometry. The result has no tie to the simulation, the
 * InstancedMesh, or this node's per-frame work: it is exactly what a Box or
 * an imported .obj hands downstream.
 */
export function bakeInstances(source: THREE.InstancedMesh, nodeId: string): THREE.Mesh {
  const matrix = new THREE.Matrix4();
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < source.count; i++) {
    source.getMatrixAt(i, matrix);
    parts.push(source.geometry.clone().applyMatrix4(matrix));
  }
  const merged = parts.length > 0 ? mergeGeometries(parts, false) ?? new THREE.BufferGeometry() : new THREE.BufferGeometry();
  for (const part of parts) part.dispose();

  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: 0xffffff }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.nodeId = nodeId;
  return mesh;
}

const EXTRA_FIELDS = [
  { id: "instanceScale", label: "Instance Scale", kind: "number" as const, step: 0.01, group: "Geometry" },
  { id: "freeze", label: "Freeze (keep current instances)", kind: "boolean" as const, group: "Geometry" },
  { id: "bake", label: "Bake to Mesh (real object, detached)", kind: "boolean" as const, group: "Geometry" },
];

/**
 * Particle Render (Instances) Node — draws each particle as a real mesh
 * instead of a sprite.
 *
 * particles/render is a THREE.Points with a bespoke shader: fast, but the
 * particles can only ever be flat camera-facing sprites, and they sit outside
 * the material system every other object node shares — no PBR, no shadows, no
 * chosen geometry. That gap is what kept particles feeling like a separate
 * world rather than another kind of object. This node closes it: wire any
 * mesh into Shape and every live particle becomes a copy of it, through one
 * InstancedMesh (one draw call) carrying the same standard material params as
 * Box, Sphere and the rest.
 *
 * Positions come from the same CPU readback connect-nearby, capture-trails
 * and particles/to-points already use, rather than a GPU instancing shader:
 * it keeps the node inside the app's ordinary material/geometry machinery
 * (a real THREE.InstancedMesh that shadows, raycasts and accepts a Material
 * input) instead of a second bespoke shader that would have to reimplement
 * all of it. The tradeoff is a per-frame matrix write per particle, bounded
 * by MAX_INSTANCES.
 */
export const PARTICLE_RENDER_INSTANCES_NODE: NodeDefinition = {
  type: "particles/render-instances",
  label: "Particle Render (Instances)",
  category: "particles",
  inputs: [
    { id: "positions", label: "Positions", type: "texture" },
    { id: "count", label: "Count", type: "value" },
    { id: "shape", label: "Shape (Mesh)", type: "geometry" },
    { id: "instanceScale", label: "Instance Scale", type: "value" },
    ...COMMON_PRIMITIVE_INPUTS,
  ],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: {
    ...COMMON_DEFAULT_PARAMS,
    instanceScale: 0.1,
    freeze: false,
    bake: false,
  },
  paramFields: buildPrimitiveDynamicParamFields(EXTRA_FIELDS)(),
  dynamicParamFields: buildPrimitiveDynamicParamFields(EXTRA_FIELDS),
  evaluate: (inputs, params, ctx) => {
    const state = getState(ctx.nodeId);

    const texture = inputs.positions instanceof THREE.Texture ? inputs.positions : null;
    const capacity = Math.max(0, Math.min(MAX_INSTANCES, Math.round(numberInput(inputs.count, params.count, 0))));
    const instanceScale = Math.max(0.0001, numberInput(inputs.instanceScale, params.instanceScale, 0.1));
    // A boolean rather than a "bake" button on purpose: a button press is a
    // moment, and nothing would carry it across a save/reload, whereas this
    // is state the .tsuji stores — reopen the file and the frozen pose is
    // still frozen. Freezing keeps the instance matrices exactly as they were
    // on the last live frame, so the node becomes an ordinary static object
    // downstream (Merge, Transform, Boolean, export) while the simulation
    // behind it keeps running or not, indifferently.
    const freeze = params.freeze === true;
    // Bake goes further than Freeze: instead of holding an InstancedMesh
    // still, it flattens the live instances into one ordinary merged mesh and
    // keeps *that*, from then on ignoring the simulation entirely. The
    // difference matters beyond "detached": an InstancedMesh is not
    // vertex-addressable, so Boolean, Subdivide and Lattice Deform all refuse
    // it (see meshRequired.ts) — a baked mesh is a real mesh those nodes act
    // on, and it survives the particle system being retuned, gated off, or
    // deleted. Taken once, on the first frame Bake is switched on, then held.
    const bake = params.bake === true;

    // Fall back to a small box so the node shows something the moment it is
    // added, before a Shape is wired — same "useful with nothing connected"
    // contract every primitive node has.
    const shapeObject = inputs.shape instanceof THREE.Object3D ? inputs.shape : null;
    const shapeMesh = shapeObject ? findFirstMesh(shapeObject) : null;
    const sourceGeometry = shapeMesh?.geometry ?? null;
    const sourceGeometryId = sourceGeometry?.uuid ?? "__default_box__";

    // Rebuilding allocates a fresh InstancedMesh, which would discard the
    // very matrices freezing exists to preserve — so once frozen, never
    // rebuild, even if Shape or Count changes underneath.
    const mustRebuild = !state.mesh || state.sourceGeometryId !== sourceGeometryId || state.capacity !== capacity;
    if (mustRebuild && !(freeze && state.mesh)) {
      if (state.mesh) disposeObject3D(state.mesh);
      // Cloned, not shared: InstancedMesh takes ownership of its geometry for
      // disposal, and the Shape node still owns and draws the original.
      const geometry = sourceGeometry ? sourceGeometry.clone() : new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff }), Math.max(1, capacity));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.userData.nodeId = ctx.nodeId;
      state.mesh = mesh;
      state.sourceGeometryId = sourceGeometryId;
      state.capacity = capacity;
    }
    // Always set: the rebuild guard above only skips when a mesh already
    // exists to preserve (`freeze && state.mesh`), so a missing one is still
    // built even with freeze on.
    const mesh = state.mesh!;

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
    }

    let live = mesh.count;
    if (!freeze && texture && capacity > 0 && ctx.renderer) {
      live = 0;
      const size = textureSizeFor(capacity);
      const buffer = readPositionsSync(ctx.renderer, texture, size, ctx.nodeId);
      const matrix = new THREE.Matrix4();
      const scale = new THREE.Vector3(instanceScale, instanceScale, instanceScale);
      const quaternion = new THREE.Quaternion();
      const position = new THREE.Vector3();
      for (let i = 0; i < capacity; i++) {
        // Same age >= 0 aliveness test particles/render's vertex shader uses —
        // a dead or still-pre-spawn texel is parked at the world origin, and
        // instancing those would stack a pile of meshes at (0,0,0).
        if (!isAlive(buffer[i * 4 + 3])) continue;
        position.set(buffer[i * 4], buffer[i * 4 + 1], buffer[i * 4 + 2]);
        mesh.setMatrixAt(live, matrix.compose(position, quaternion, scale));
        live++;
      }
      mesh.instanceMatrix.needsUpdate = true;
    } else if (!freeze) {
      // Live, but nothing to read (no texture / no renderer) — draw nothing
      // rather than leaving the previous frame's instances on screen.
      live = 0;
    }
    // Only the live prefix is drawn; the rest of the allocated capacity keeps
    // whatever stale matrices it had, unread. Frozen, `live` is simply
    // whatever the last live frame left here.
    mesh.count = live;

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);

    if (bake) {
      if (!state.baked) state.baked = bakeInstances(mesh, ctx.nodeId);
      const baked = state.baked;
      baked.matrixAutoUpdate = false;
      baked.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
      applyMaterialParams(baked, matParams, THREE.FrontSide, texParams);
      return primitiveOutputs(baked);
    }
    // Switching Bake back off drops the snapshot, so re-enabling it takes a
    // fresh one rather than resurrecting a stale pose.
    if (state.baked) {
      disposeObject3D(state.baked);
      state.baked = undefined;
    }

    applyMaterialParams(mesh as unknown as THREE.Mesh, matParams, THREE.FrontSide, texParams);

    return primitiveOutputs(mesh);
  },
};
