import * as THREE from "three";

/**
 * Where a graph object actually *is*, for the nodes that only want to read a
 * position off one.
 *
 * Two things make `setFromMatrixPosition(object.matrixWorld)` the wrong
 * answer here, and both are properties of how this graph builds objects
 * rather than anything three.js does wrong:
 *
 *  - `matrixWorld` is stale during evaluation. Instancing nodes write
 *    `object.matrix` directly on wrapper Groups with `matrixAutoUpdate` off
 *    and never raise `matrixWorldNeedsUpdate`; the renderer papers over it
 *    with its own `scene.updateMatrixWorld(true)`, which runs *after* the
 *    graph has already been evaluated.
 *
 *  - The object handed down a wire is usually a wrapper. Geometry Transform,
 *    Set Instance Transform and Squash & Stretch all return a Group sitting
 *    at the origin whose *child* carries the pose. Reading the root gives
 *    (0,0,0) every frame — which is not obviously wrong, it just silently
 *    pins whatever asked to the origin.
 */

/** World matrix walked from local matrices, since the cached `matrixWorld` is stale mid-evaluation. */
export function worldMatrixOf(object: THREE.Object3D): THREE.Matrix4 {
  const chain: THREE.Object3D[] = [];
  for (let current: THREE.Object3D | null = object; current; current = current.parent) chain.push(current);

  const world = new THREE.Matrix4();
  for (let i = chain.length - 1; i >= 0; i--) {
    const node = chain[i];
    if (node.matrixAutoUpdate) node.updateMatrix();
    world.multiply(node.matrix);
  }
  return world;
}

/**
 * The object's world position, descending through wrapper Groups to the first
 * real payload so the answer is the object's own pose rather than the
 * (usually identity) wrapper's.
 */
export function objectWorldPosition(object: THREE.Object3D): THREE.Vector3 {
  const world = worldMatrixOf(object);

  let target: THREE.Object3D = object;
  while (target instanceof THREE.Group && target.children.length > 0) {
    target = target.children[0];
    if (target.matrixAutoUpdate) target.updateMatrix();
    world.multiply(target.matrix);
  }

  return new THREE.Vector3().setFromMatrixPosition(world);
}
