import * as THREE from "three";
import { Graph, KeyframeStore, NodeInstance } from "./types";

/**
 * Deep-copies a graph while keeping its THREE instances *as instances*,
 * along with its keyframes and markers.
 *
 * The obvious `JSON.parse(JSON.stringify(graph))` does not: it flattens a
 * THREE.Vector3 into a plain `{x, y, z}` and a THREE.Color into `{r, g, b}`.
 * Every node's `evaluate` guards its params with `instanceof` before trusting
 * them (see asVector3 in transform.ts and friends), so a flattened param
 * silently reads as absent and falls back to the node's default. Undo/redo
 * used that JSON round-trip for its snapshots, which is why stepping back
 * quietly reset every vector and colour in the graph to defaults instead of
 * restoring what was there.
 *
 * Same failure the IPC boundary has, but the cure differs: IPC genuinely
 * hands over JSON and has to rebuild instances from the registry's
 * defaultParams (rehydrateParams.ts). Here the originals are still in memory,
 * so they can just be cloned — no registry, no guessing a param's intended
 * type from its shape.
 */
export function cloneParamValue(value: unknown): unknown {
  if (value instanceof THREE.Vector3) return value.clone();
  if (value instanceof THREE.Color) return value.clone();
  if (value instanceof THREE.Matrix4) return value.clone();
  if (value instanceof THREE.Quaternion) return value.clone();
  if (value instanceof THREE.Euler) return value.clone();
  if (Array.isArray(value)) {
    // Fast path: an array of plain numbers — exactly what baked geometry
    // is (positions/normals/uvs/index, routinely tens of thousands of
    // entries once a model has been exploded into nodes) — is cheaper to
    // shallow-copy in one native call than to run every element through
    // the six instanceof checks above. Only the first element is checked:
    // a mixed array isn't a shape any node produces, and the per-element
    // path below still handles one correctly if it ever shows up.
    if (value.length === 0 || typeof value[0] !== "object" || value[0] === null) {
      return value.slice();
    }
    return value.map(cloneParamValue);
  }
  // Textures, meshes and other GPU resources are shared on purpose — a node's
  // cached mesh must stay the same object across frames — so anything that
  // isn't a plain object is passed through by reference rather than copied.
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return cloneParams(value as Record<string, unknown>);
  }
  return value;
}

export function cloneParams(params: Record<string, unknown>): Record<string, unknown> {
  const cloned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) cloned[key] = cloneParamValue(value);
  return cloned;
}

export function cloneKeyframes(store?: KeyframeStore): KeyframeStore | undefined {
  if (!store) return undefined;
  const cloned: KeyframeStore = {};
  for (const [nodeId, paramMap] of Object.entries(store)) {
    cloned[nodeId] = {};
    for (const [paramKey, list] of Object.entries(paramMap)) {
      cloned[nodeId][paramKey] = list.map((kf) => ({
        frame: kf.frame,
        value: cloneParamValue(kf.value),
        easeIn: kf.easeIn,
        easeStrength: kf.easeStrength,
        easeBezier: kf.easeBezier ? ([...kf.easeBezier] as [number, number, number, number]) : undefined,
      }));
    }
  }
  return cloned;
}

function cloneNode(node: NodeInstance): NodeInstance {
  return {
    id: node.id,
    type: node.type,
    position: { x: node.position.x, y: node.position.y },
    params: cloneParams(node.params),
  };
}

export function cloneGraph(graph: Graph): Graph {
  return {
    nodes: graph.nodes.map(cloneNode),
    connections: graph.connections.map((c) => ({ ...c })),
    keyframes: cloneKeyframes(graph.keyframes),
    markers: graph.markers ? graph.markers.map((m) => ({ ...m })) : undefined,
    exposedParams: graph.exposedParams ? graph.exposedParams.map((e) => ({ ...e })) : undefined,
  };
}
