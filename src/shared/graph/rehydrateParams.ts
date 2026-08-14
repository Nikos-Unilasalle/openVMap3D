import * as THREE from "three";
import { Graph, NodeRegistry } from "./types";

/**
 * Undoes the one real cost of broadcasting the graph across the Tauri IPC
 * boundary (see ipc.ts): the event bridge round-trips every payload through
 * Rust as JSON, so a THREE.Vector3/Color param — a real class instance in
 * the main window — arrives in the output window as a plain object with the
 * same fields and no prototype. Every node's `evaluate()` checks
 * `instanceof THREE.Vector3` before trusting an input/param (see
 * asVector3() in transform.ts, camera.ts, etc.), so a stripped instance
 * silently fails that check and falls back to the node's default — any
 * edited Vector3/Color param (a Transform node's location dragged via the
 * viewport gizmo, a Box's color, ...) reads as unedited in the output
 * window specifically, even though the raw numbers did arrive correctly.
 *
 * Ground truth for what a param is *supposed* to be comes from the node's
 * own `defaultParams` — the same registry both windows already share
 * locally, never itself sent over IPC — rather than guessing from the
 * received value's shape, which would be ambiguous (a Vector3 and a
 * Quaternion look identical minus the `w`).
 */
export function rehydrateGraphParams(graph: Graph, registry: NodeRegistry): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((instance) => {
      const def = registry.get(instance.type);
      if (!def) return instance;

      let changed = false;
      const params: Record<string, unknown> = { ...instance.params };

      for (const key of Object.keys(instance.params)) {
        const defaultValue = def.defaultParams[key];
        const value = instance.params[key];
        if (!value || typeof value !== "object") continue;

        if (defaultValue instanceof THREE.Vector3 && !(value instanceof THREE.Vector3)) {
          const v = value as { x?: unknown; y?: unknown; z?: unknown };
          params[key] = new THREE.Vector3(Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0);
          changed = true;
        } else if (defaultValue instanceof THREE.Color && !(value instanceof THREE.Color)) {
          const c = value as { r?: unknown; g?: unknown; b?: unknown };
          params[key] = new THREE.Color(Number(c.r) || 0, Number(c.g) || 0, Number(c.b) || 0);
          changed = true;
        }
      }

      return changed ? { ...instance, params } : instance;
    }),
  };
}
