import { NodeCategory } from "./categories";
import { SocketDef } from "./sockets";

/** Read-only context every node's evaluate function receives — the only source of "now." */
export interface EvalContext {
  /** Seconds, from the deterministic clock — see clock.ts. Never Date.now() inside a node. */
  time: number;
  /** Frame/step count since the graph's epoch. Whole-number, useful for per-step (not per-second) logic. */
  step: number;
  /**
   * The instance currently being evaluated. `evaluate` is otherwise meant to
   * be pure (no reads from outside its own inputs/params/ctx), but a node
   * that owns a GPU resource — an Object node's THREE.Mesh, a Particle
   * node's simulation texture — needs a *stable* object across frames, not a
   * fresh one every evaluation. This id is the key such a node uses into its
   * own module-level cache (mirrors OpenVMap's texture cache: the cache
   * lives outside the pure calculation, keyed by a stable id, refcounted/
   * cleaned up separately). Nodes that don't own external resources ignore it.
   */
  nodeId: string;
}

/**
 * UI hints for the param panel — optional, purely presentational. A node
 * with no `paramFields` still works fine (its `defaultParams` are still the
 * fallback for unconnected inputs), it just shows nothing in the panel.
 * `id` must match a key in `defaultParams`.
 */
export type ParamFieldDef =
  | { id: string; label: string; kind: "number"; step?: number }
  | { id: string; label: string; kind: "boolean" }
  | { id: string; label: string; kind: "select"; options: string[] }
  | { id: string; label: string; kind: "color" }
  | { id: string; label: string; kind: "vector"; step?: number };

/**
 * The static description of a node *type* — shared by every instance of it.
 * `evaluate` is pure: same inputs/params/time in, same outputs out, no
 * reaching into global state. That purity is what makes the engine testable
 * without a renderer and safe to re-run every frame without accumulating state.
 *
 * `params` is deliberately untyped (`Record<string, unknown>`) rather than a
 * generic `P`: a registry holds definitions of many different node types
 * together in one collection, and TypeScript can't make a function-shaped
 * generic covariant enough for that to type-check without `any` at the
 * registry boundary anyway. Each node's own `evaluate` reads and casts the
 * specific keys it expects.
 */
export interface NodeDefinition {
  type: string;
  label: string;
  /** Drives the node header color, the param panel color, and which palette section it appears in. */
  category: NodeCategory;
  inputs: SocketDef[];
  outputs: SocketDef[];
  /** Per-instance knobs — also supplies the fallback value for an input socket left unconnected. */
  defaultParams: Record<string, unknown>;
  /** See ParamFieldDef — omit for a node with nothing worth exposing in the panel. */
  paramFields?: ParamFieldDef[];
  evaluate: (
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
    ctx: EvalContext,
  ) => Record<string, unknown>;
}

export type NodeRegistry = Map<string, NodeDefinition>;

export function createRegistry(definitions: NodeDefinition[]): NodeRegistry {
  const registry: NodeRegistry = new Map();
  for (const def of definitions) registry.set(def.type, def);
  return registry;
}

/** One placed node in a graph — the type it is, plus whatever makes this instance different from another of the same type. */
export interface NodeInstance {
  id: string;
  type: string;
  /** Per-instance overrides of defaultParams, and fallback values for unconnected inputs, keyed by socket/param id. */
  params: Record<string, unknown>;
  /** Editor-only — the evaluator never reads this. */
  position: { x: number; y: number };
}

export interface Connection {
  id: string;
  fromNode: string;
  fromSocket: string;
  toNode: string;
  toSocket: string;
}

export interface Graph {
  nodes: NodeInstance[];
  connections: Connection[];
}

export function emptyGraph(): Graph {
  return { nodes: [], connections: [] };
}
