import * as THREE from "three";

/**
 * Tracks exactly which objects *this* viewport put into a given parent, so
 * they can be taken back out again when they stop belonging there.
 *
 * Every add/remove pair in tick() used to be written by hand, each with its
 * own rule for when to drop something, and several had no remove side at
 * all — a camera helper stayed in the scene after its node was deleted, and
 * a graph replaced wholesale by "New" left its leftovers behind. The
 * asymmetry is the bug: an object that a node no longer produces has nothing
 * left pointing at it, so the only way to remove it is to have remembered
 * that we added it.
 *
 * Objects are keyed by whatever identifies them to the caller (a node id, a
 * light uuid). `sync` is called with the full desired set each frame and
 * reconciles in both directions: anything new goes in, anything missing
 * comes out, anything whose object changed identity under the same key gets
 * swapped.
 *
 * Removal is conditional on `obj.parent === parent` throughout, because
 * these objects are cached per node id at module scope (see nodeCaches.ts)
 * and shared across viewports: a Merge node reparents one into its own
 * group, and the split view's second Viewport adds the same instance to its
 * own scene. three.js gives an Object3D exactly one parent, so by the time
 * we come to remove it, it may legitimately live somewhere else — and
 * calling remove() on a parent that no longer holds it must not disturb
 * whoever does.
 */
/**
 * Whether `obj` is `ancestor` itself or sits somewhere beneath it. Used to
 * tell an object that is already being drawn as part of the render output
 * from one that still needs adding to the scene in its own right — adding
 * the former again would pull it out of the group that holds it, since
 * three.js gives an Object3D exactly one parent.
 */
export function isSelfOrDescendantOf(obj: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = obj;
  while (cursor) {
    if (cursor === ancestor) return true;
    cursor = cursor.parent;
  }
  return false;
}

export interface SceneMembership {
  /** Reconcile the parent's contents with `desired`, adding and removing as needed. */
  sync(desired: ReadonlyMap<string, THREE.Object3D>): void;
  /** Remove everything this membership still owns. */
  clear(): void;
}

export function createSceneMembership(parent: THREE.Object3D): SceneMembership {
  const owned = new Map<string, THREE.Object3D>();

  function detach(obj: THREE.Object3D) {
    if (obj.parent === parent) parent.remove(obj);
  }

  return {
    sync(desired) {
      for (const [key, obj] of desired) {
        const previous = owned.get(key);
        if (previous && previous !== obj) detach(previous);
        if (obj.parent !== parent) parent.add(obj);
        owned.set(key, obj);
      }

      for (const [key, obj] of owned) {
        if (!desired.has(key)) {
          detach(obj);
          owned.delete(key);
        }
      }
    },

    clear() {
      for (const obj of owned.values()) detach(obj);
      owned.clear();
    },
  };
}
