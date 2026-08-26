import * as THREE from "three";
import { createNodeCache } from "../nodeCaches";

/**
 * Solid faces where a clip plane cuts through geometry — the three.js
 * stencil-cap technique (webgl_clipping_stencil), driven from a node.
 *
 * Per clip plane, per mesh in the clipped subtree, two extra draws go into
 * the stencil buffer only (no color, no depth): back faces incrementing,
 * front faces decrementing, both clipped by that one plane. On a closed mesh
 * every entry/exit pair cancels, *except* where the plane cut the front face
 * away — so the stencil ends up non-zero exactly on the cut's cross-section.
 * A quad drawn at the plane, gated on stencil != 0, then paints that
 * cross-section and nothing else.
 *
 * Everything lives in the scene graph as children of the meshes it caps,
 * rather than in a separate render pass: the cap is a normal lit material
 * that has to sit in the real scene to see the real lights, and the stencil
 * draws have to be sequenced against the object's own draw, which is what
 * `renderOrder` already does inside one render. The stencil buffer itself is
 * not free — WebGLRenderer must be constructed with `stencil: true` (see
 * Viewport), or every stencil op here is a silent no-op and no cap appears.
 *
 * The tradeoff versus Boolean is unchanged: this is pixels, not geometry. The
 * cut *looks* solid but no vertex was added, so nothing downstream (export,
 * raycast, a mesh modifier) sees a capped solid.
 */

/** Marks every mesh this module adds, so a later pass never treats one as real geometry. */
const CAP_HELPER_FLAG = "__clipCapHelper";

const noopRaycast = () => {};

export interface ClipCapPlaneSpec {
  /** The plane as applied to the object — the stencil pass must clip the same way the object does. */
  plane: THREE.Plane;
  /** World matrix for this plane's cap quad: a unit XY quad mapped onto the cut. */
  capMatrix: THREE.Matrix4;
  /** Extra planes trimming the cap to the cut's outline (a box face); empty for a lone slice plane. */
  restrictPlanes: THREE.Plane[];
}

export interface ClipCapSpec {
  nodeId: string;
  object: THREE.Object3D;
  planes: ClipCapPlaneSpec[];
  color: THREE.Color;
  roughness: number;
  metalness: number;
}

interface CapState {
  object: THREE.Object3D;
  /** Two per (source mesh × plane), parented to the source mesh so they inherit its exact world transform. */
  stencilMeshes: THREE.Mesh[];
  /** One per plane, parented to the clipped object but positioned in world space directly. */
  capMeshes: THREE.Mesh[];
  /** What the built rig assumes: rebuild when the mesh set or the plane count changes. */
  signature: string;
}

const capCache = createNodeCache<CapState>((state) => teardown(state));

function isHelper(object: THREE.Object3D): boolean {
  return object.userData?.[CAP_HELPER_FLAG] === true;
}

/** Every real mesh under `object` — helpers this module (or another clip node) added are not geometry. */
function collectSourceMeshes(object: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && !isHelper(child)) meshes.push(child);
  });
  return meshes;
}

function teardown(state: CapState): void {
  for (const mesh of state.stencilMeshes) {
    mesh.removeFromParent();
    // Geometry is the source mesh's own — shared on purpose, never ours to dispose.
    (mesh.material as THREE.Material).dispose();
  }
  for (const mesh of state.capMeshes) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  state.stencilMeshes.length = 0;
  state.capMeshes.length = 0;
}

function makeStencilMesh(source: THREE.Mesh, side: THREE.Side, op: THREE.StencilOp, renderOrder: number): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial();
  material.side = side;
  material.depthWrite = false;
  material.depthTest = false;
  material.colorWrite = false;
  material.stencilWrite = true;
  material.stencilFunc = THREE.AlwaysStencilFunc;
  material.stencilFail = op;
  material.stencilZFail = op;
  material.stencilZPass = op;

  const mesh = new THREE.Mesh(source.geometry, material);
  mesh.userData[CAP_HELPER_FLAG] = true;
  mesh.raycast = noopRaycast;
  mesh.renderOrder = renderOrder;
  // Identity local matrix under the source mesh: same world transform, for free, every frame.
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  source.add(mesh);
  return mesh;
}

function makeCapMesh(owner: THREE.Object3D, renderOrder: number): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.userData[CAP_HELPER_FLAG] = true;
  mesh.raycast = noopRaycast;
  mesh.renderOrder = renderOrder;
  // The cap sits on a world-space clip plane, so its world matrix is set
  // outright rather than derived from the parent it happens to hang under.
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // Leave the buffer clean for the next plane's pass (and for anything else
  // in the frame that reads stencil) — same trick as the three.js example.
  mesh.onAfterRender = (renderer) => renderer.clearStencil();
  owner.add(mesh);
  return mesh;
}

/**
 * Builds (or refreshes) the cap rig for one node. Cheap on a steady graph:
 * only plane data, matrices and material values are touched per frame — the
 * meshes themselves are rebuilt only when the clipped mesh set changes.
 */
export function applyClipCaps(spec: ClipCapSpec): void {
  const sourceMeshes = collectSourceMeshes(spec.object);
  const signature = [spec.object.uuid, spec.planes.length, sourceMeshes.map((m) => m.uuid).join(",")].join("|");

  let state = capCache.get(spec.nodeId);
  if (state && (state.object !== spec.object || state.signature !== signature)) {
    teardown(state);
    state = undefined;
  }

  if (!state) {
    state = { object: spec.object, stencilMeshes: [], capMeshes: [], signature };
    for (let i = 0; i < spec.planes.length; i++) {
      for (const source of sourceMeshes) {
        state.stencilMeshes.push(makeStencilMesh(source, THREE.BackSide, THREE.IncrementWrapStencilOp, i + 1));
        state.stencilMeshes.push(makeStencilMesh(source, THREE.FrontSide, THREE.DecrementWrapStencilOp, i + 1));
      }
      // Just after this plane's stencil draws, before the next plane's.
      state.capMeshes.push(makeCapMesh(spec.object, i + 1.5));
    }
    capCache.set(spec.nodeId, state);
  }

  const perPlane = sourceMeshes.length * 2;
  for (let i = 0; i < spec.planes.length; i++) {
    const planeSpec = spec.planes[i];
    for (let j = 0; j < perPlane; j++) {
      const mesh = state.stencilMeshes[i * perPlane + j];
      if (mesh) (mesh.material as THREE.Material).clippingPlanes = [planeSpec.plane];
    }

    const cap = state.capMeshes[i];
    if (!cap) continue;
    const material = cap.material as THREE.MeshStandardMaterial;
    material.clippingPlanes = planeSpec.restrictPlanes;
    material.color.copy(spec.color);
    material.roughness = spec.roughness;
    material.metalness = spec.metalness;
    cap.matrix.copy(planeSpec.capMatrix);
    cap.matrixWorld.copy(planeSpec.capMatrix);
  }
}

/** Drops a node's caps — call when its cap toggle goes off or its input disappears. */
export function removeClipCaps(nodeId: string): void {
  const state = capCache.get(nodeId);
  if (!state) return;
  teardown(state);
  capCache.delete(nodeId);
}

const boundsBox = new THREE.Box3();
const meshBox = new THREE.Box3();
const boundsSphere = new THREE.Sphere();

/**
 * How big a cap quad has to be to cover the object's cross-section, for a cut
 * with no outline of its own to borrow (a lone slice plane). The stencil trims
 * the quad back to the real silhouette, so overshooting is free and coming up
 * short is not — hence the generous multiplier.
 */
export function capCoverRadius(object: THREE.Object3D): number {
  boundsBox.makeEmpty();
  for (const mesh of collectSourceMeshes(object)) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) continue;
    meshBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    boundsBox.union(meshBox);
  }
  if (boundsBox.isEmpty()) return 1;
  boundsBox.getBoundingSphere(boundsSphere);
  return Math.max(1, boundsSphere.radius * 2.5);
}

/** Test seam: how many helper meshes a node currently owns. */
export function clipCapHelperCount(nodeId: string): { stencil: number; caps: number } {
  const state = capCache.get(nodeId);
  return { stencil: state?.stencilMeshes.length ?? 0, caps: state?.capMeshes.length ?? 0 };
}

/** Test seam: the cap quads a node currently owns, in plane order. */
export function clipCapMeshes(nodeId: string): THREE.Mesh[] {
  return capCache.get(nodeId)?.capMeshes ?? [];
}
