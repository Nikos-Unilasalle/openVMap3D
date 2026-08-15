import * as THREE from "three";
import { growingSockets } from "../dynamicInputs";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";

const INPUT_PREFIX = "in";

/**
 * Same GPU-resource-cache pattern as object.ts's meshCache — the group
 * needs to be the SAME THREE.Group across frames, not a fresh one every
 * evaluation, so the viewport can hold a stable reference to it.
 */
const groupCache = createNodeCache<THREE.Group>();

function getGroup(nodeId: string): THREE.Group {
  const existing = groupCache.get(nodeId);
  if (existing) return existing;
  const group = new THREE.Group();
  groupCache.set(nodeId, group);
  return group;
}

/**
 * Fans any number of Geometry inputs into one Geometry output — a
 * THREE.Group holding all of them — so a scene can carry more than one
 * object into Render, which still only takes a single Geometry input;
 * Merge is what combines multiple objects down to that one socket.
 * Inputs grow dynamically: wiring the last empty "In N" socket adds a new
 * empty one below it (see dynamicInputs.ts), so there's always exactly one
 * free socket to drag the next connection into.
 */
export const MERGE_NODE: NodeDefinition = {
  type: "structure/merge",
  label: "Merge",
  category: "structure",
  inputs: [
    { id: "visible", label: "Visible", type: "value" },
    { id: `${INPUT_PREFIX}0`, label: "In 1", type: "geometry", owns: true },
  ],
  dynamicInputs: (connections) => [
    { id: "visible", label: "Visible", type: "value" as const },
    ...growingSockets(connections, INPUT_PREFIX, (i) => ({
      id: `${INPUT_PREFIX}${i}`,
      label: `In ${i + 1}`,
      type: "geometry",
      owns: true,
    })),
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { visible: 1 },
  evaluate: (inputs, _params, ctx) => {
    const group = getGroup(ctx.nodeId);
    group.clear();
    for (const value of Object.values(inputs)) {
      if (value instanceof THREE.Object3D) group.add(value);
    }
    return { geometry: group };
  },
};
