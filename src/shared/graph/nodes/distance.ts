import * as THREE from "three";
import { NodeDefinition } from "../types";

/**
 * World matrix computed by walking the parent chain and multiplying local
 * matrices, instead of reading the cached `matrixWorld`.
 *
 * three only refreshes `matrixWorld` when `matrixWorldNeedsUpdate` is set, and
 * the instancing nodes (Array, Set Instance Transform, …) write `object.matrix`
 * directly on wrapper Groups with `matrixAutoUpdate = false` without raising
 * that flag. The renderer papers over it — `scene.updateMatrixWorld(true)`
 * forces the whole tree — but during graph evaluation, which runs *before* that
 * pass, every cached `matrixWorld` is stale (identity for a freshly built
 * wrapper). Reading it there made every instance report position (0,0,0), so
 * the nearest one was always index 0. Recomputing from local matrices is exact
 * and cheap for the shallow hierarchies these nodes build.
 */
function worldMatrixOf(obj: THREE.Object3D): THREE.Matrix4 {
  const chain: THREE.Object3D[] = [];
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) chain.push(cur);

  const world = new THREE.Matrix4();
  for (let i = chain.length - 1; i >= 0; i--) {
    const node = chain[i];
    if (node.matrixAutoUpdate) node.updateMatrix();
    world.multiply(node.matrix);
  }
  return world;
}

function extractPosition(val: unknown, fallback: THREE.Vector3): THREE.Vector3 {
  if (val instanceof THREE.Vector3) return val.clone();
  if (val instanceof THREE.Matrix4) return new THREE.Vector3().setFromMatrixPosition(val);
  if (val instanceof THREE.Object3D) {
    const world = worldMatrixOf(val);

    // An instance is usually a transform wrapper around the real payload —
    // descend to the first leaf so the position is the object's, not the
    // (often identity) wrapper's.
    let target: THREE.Object3D = val;
    while (target instanceof THREE.Group && target.children.length > 0) {
      target = target.children[0];
      if (target.matrixAutoUpdate) target.updateMatrix();
      world.multiply(target.matrix);
    }

    return new THREE.Vector3().setFromMatrixPosition(world);
  }
  if (val && typeof val === "object" && "position" in val && (val as any).position instanceof THREE.Vector3) {
    return ((val as any).position as THREE.Vector3).clone();
  }
  return fallback;
}

/**
 * Distance Node: Computes 3D Euclidean distance (and squared distance)
 * between two vectors, positions, or 3D objects. Also supports lists of vectors/objects.
 */
export const DISTANCE_NODE: NodeDefinition = {
  type: "math/distance",
  label: "Distance",
  category: "math",
  // `any` rather than `vector`: a position is just as often an object, its
  // matrix, or a list of either, and the editor only lets a wire cross socket
  // types through `any`. extractPosition sorts out what actually arrived.
  inputs: [
    { id: "a", label: "A (Vector / Object / Matrix)", type: "any" },
    { id: "b", label: "B (Vector / Object / Matrix)", type: "any" },
  ],
  outputs: [
    { id: "distance", label: "Distance", type: "value" },
    { id: "distanceSq", label: "Distance Sq", type: "value" },
    { id: "list", label: "List", type: "list" },
  ],
  defaultParams: {
    ax: 0,
    ay: 0,
    az: 0,
    bx: 0,
    by: 0,
    bz: 0,
  },
  paramFields: [
    { id: "ax", label: "A.X", kind: "number" },
    { id: "ay", label: "A.Y", kind: "number" },
    { id: "az", label: "A.Z", kind: "number" },
    { id: "bx", label: "B.X", kind: "number" },
    { id: "by", label: "B.Y", kind: "number" },
    { id: "bz", label: "B.Z", kind: "number" },
  ],
  evaluate: (inputs, params) => {
    const fallbackA = new THREE.Vector3(
      Number(params.ax) || 0,
      Number(params.ay) || 0,
      Number(params.az) || 0,
    );
    const fallbackB = new THREE.Vector3(
      Number(params.bx) || 0,
      Number(params.by) || 0,
      Number(params.bz) || 0,
    );

    // List evaluation support
    if (Array.isArray(inputs.a) || Array.isArray(inputs.b)) {
      const listA = Array.isArray(inputs.a) ? inputs.a : [inputs.a ?? fallbackA];
      const listB = Array.isArray(inputs.b) ? inputs.b : [inputs.b ?? fallbackB];
      const maxLength = Math.max(listA.length, listB.length);

      const distanceList: number[] = [];
      const distanceSqList: number[] = [];

      for (let i = 0; i < maxLength; i++) {
        const itemA = listA[i % listA.length];
        const itemB = listB[i % listB.length];

        const posA = extractPosition(itemA, fallbackA);
        const posB = extractPosition(itemB, fallbackB);

        const sq = posA.distanceToSquared(posB);
        distanceList.push(Math.sqrt(sq));
        distanceSqList.push(sq);
      }

      return {
        distance: distanceList[0] ?? 0,
        distanceSq: distanceSqList[0] ?? 0,
        list: distanceList,
      };
    }

    const posA = extractPosition(inputs.a, fallbackA);
    const posB = extractPosition(inputs.b, fallbackB);

    const distSq = posA.distanceToSquared(posB);
    const dist = Math.sqrt(distSq);

    return {
      distance: dist,
      distanceSq: distSq,
      list: [dist],
    };
  },
};

/**
 * One candidate per list item, or per child when a whole geometry pack (Group)
 * is wired straight in — never per leaf mesh. An instance is a wrapper around
 * an arbitrarily deep subtree, so flattening down to meshes would make `index`
 * count meshes instead of instances and drift from the index every other node
 * (Get Instance, list nodes) uses.
 */
function collectCandidateObjects(input: unknown): THREE.Object3D[] {
  const result: THREE.Object3D[] = [];

  function pushItem(item: unknown) {
    if (!item) return;
    if (Array.isArray(item)) {
      item.forEach(pushItem);
    } else if (item instanceof THREE.Object3D) {
      result.push(item);
    }
  }

  if (Array.isArray(input)) {
    pushItem(input);
  } else if (input instanceof THREE.Group && input.children.length > 0) {
    input.children.forEach(pushItem);
  } else {
    pushItem(input);
  }

  return result;
}

/**
 * True when the two objects are the same, or one sits inside the other — the
 * target reaches the Proximity node as its own object while the candidate list
 * carries clones nested in wrappers, so identity alone would miss "self".
 */
function isSameOrNested(a: THREE.Object3D, b: THREE.Object3D): boolean {
  for (let cur: THREE.Object3D | null = a; cur; cur = cur.parent) if (cur === b) return true;
  for (let cur: THREE.Object3D | null = b; cur; cur = cur.parent) if (cur === a) return true;
  return false;
}

/**
 * Proximity Object Node: Finds the nearest 3D Object (or Vector) from a list or group of candidate objects
 * relative to a Target object or position. Automatically unrolls instances inside Groups (e.g. Array node).
 */
export const PROXIMITY_OBJECT_NODE: NodeDefinition = {
  type: "object/proximity",
  label: "Proximity Object",
  category: "math",
  inputs: [
    { id: "target", label: "Target (Object / Vector / Matrix)", type: "any" },
    { id: "candidates", label: "Candidates", type: "any" },
  ],
  outputs: [
    { id: "object", label: "Nearest Object", type: "geometry" },
    { id: "distance", label: "Distance", type: "value" },
    { id: "index", label: "Index", type: "value" },
    { id: "vector", label: "Position", type: "vector" },
  ],
  defaultParams: {
    ignoreSelf: true,
  },
  paramFields: [
    { id: "ignoreSelf", label: "Ignore Self if in list", kind: "boolean" },
  ],
  evaluate: (inputs, params) => {
    const targetObj = inputs.target;
    const targetPos = extractPosition(targetObj, new THREE.Vector3());

    const candidateObjects = collectCandidateObjects(inputs.candidates);
    const ignoreSelf = params.ignoreSelf !== false;

    let minDistanceSq = Infinity;
    let nearestObj: THREE.Object3D | null = null;
    let nearestIndex = -1;
    let nearestPos = new THREE.Vector3();

    for (let i = 0; i < candidateObjects.length; i++) {
      const candidate = candidateObjects[i];

      if (ignoreSelf && targetObj instanceof THREE.Object3D && isSameOrNested(candidate, targetObj)) {
        continue;
      }

      const candPos = extractPosition(candidate, new THREE.Vector3());
      const distSq = targetPos.distanceToSquared(candPos);

      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        nearestObj = candidate;
        nearestIndex = i;
        nearestPos = candPos;
      }
    }

    const distance = Number.isFinite(minDistanceSq) ? Math.sqrt(minDistanceSq) : 0;

    return {
      object: nearestObj ?? (targetObj instanceof THREE.Object3D ? targetObj : new THREE.Object3D()),
      distance,
      index: nearestIndex,
      vector: nearestPos,
    };
  },
};

