import * as THREE from "three";
import { NodeDefinition } from "../types";

function extractPosition(val: unknown, fallback: THREE.Vector3): THREE.Vector3 {
  if (val instanceof THREE.Vector3) return val;
  if (val instanceof THREE.Object3D) return val.position;
  if (val && typeof val === "object" && "position" in val && (val as any).position instanceof THREE.Vector3) {
    return (val as any).position;
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
  inputs: [
    { id: "a", label: "A", type: "vector" },
    { id: "b", label: "B", type: "vector" },
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

function collectCandidateObjects(input: unknown): THREE.Object3D[] {
  const result: THREE.Object3D[] = [];

  function helper(item: unknown) {
    if (!item) return;
    if (Array.isArray(item)) {
      item.forEach(helper);
    } else if (item instanceof THREE.Group && item.children.length > 0) {
      item.children.forEach(helper);
    } else if (item instanceof THREE.Object3D) {
      result.push(item);
    }
  }

  helper(input);
  return result;
}

/**
 * Proximity Object Node: Finds the nearest 3D Object (or Vector) from a list or group of candidate objects
 * relative to a Target object or position. Automatically unrolls instances inside Groups (e.g. Array node).
 */
export const PROXIMITY_OBJECT_NODE: NodeDefinition = {
  type: "object/proximity",
  label: "Proximity Object",
  category: "structure",
  inputs: [
    { id: "target", label: "Target", type: "geometry" },
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

      if (ignoreSelf && targetObj instanceof THREE.Object3D && candidate === targetObj) {
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

    let outputObj: THREE.Object3D;
    if (nearestObj) {
      const clone = nearestObj.clone(true);
      clone.matrixAutoUpdate = nearestObj.matrixAutoUpdate;
      clone.matrix.copy(nearestObj.matrix);
      clone.matrixWorldNeedsUpdate = true;
      outputObj = clone;
    } else {
      outputObj = targetObj instanceof THREE.Object3D ? targetObj : new THREE.Object3D();
    }

    return {
      object: outputObj,
      distance,
      index: nearestIndex,
      vector: nearestPos,
    };
  },
};

