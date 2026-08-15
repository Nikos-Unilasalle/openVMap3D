import * as THREE from "three";
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
  /**
   * The node whose mesh is currently being dragged by the viewport's
   * TransformControls gizmo, if any — the one narrow, documented exception
   * to `evaluate` being otherwise pure. The graph re-evaluates every node
   * every frame (see evaluate.ts), which normally means an Object node's
   * mesh gets its matrix overwritten from the graph on the very next frame
   * — fine, except *during* a gizmo drag that overwrite would fight the
   * drag and the mesh would flicker back to its pre-drag pose 60 times a
   * second. A node whose id matches this one skips that overwrite for the
   * frame, leaving whatever the gizmo just set. Ignored by nodes that don't
   * own a mesh.
   */
  liveEditNodeId?: string | null;
  /**
   * The window's own WebGLRenderer, when one exists — only a node that owns
   * a GPU resource needing a live renderer to construct (a Particle Simulate
   * node's GPUComputationRenderer) reads this; every other node ignores it,
   * same as liveEditNodeId. Absent in contexts with no renderer at all
   * (tests, a headless evaluate call) — those nodes degrade gracefully
   * rather than throwing.
   */
  renderer?: THREE.WebGLRenderer;
  /** Active animation current frame index. */
  currentFrame?: number;
  /** Active keyframe store. */
  keyframes?: KeyframeStore;
}

/**
 * UI hints for the param panel — optional, purely presentational. A node
 * with no `paramFields` still works fine (its `defaultParams` are still the
 * fallback for unconnected inputs), it just shows nothing in the panel.
 * `id` must match a key in `defaultParams`.
 */
export type ParamFieldDef =
  /**
   * `degrees` is a *display* unit only: the param itself, and every socket
   * carrying the same quantity, stay in radians so an Oscillator or Value
   * Math node can feed a rotation input without unit gymnastics. It only
   * tells the panel to show and accept degrees, which is what anyone
   * dialling in an angle by hand actually wants to type.
   */
  | { id: string; label: string; kind: "number"; step?: number; degrees?: boolean; group?: string }
  | { id: string; label: string; kind: "boolean"; group?: string }
  | { id: string; label: string; kind: "select"; options: string[]; group?: string }
  | { id: string; label: string; kind: "color"; group?: string }
  | { id: string; label: string; kind: "vector"; step?: number; degrees?: boolean; group?: string }
  | { id: string; label: string; kind: "text"; group?: string }
  | { id: string; label: string; kind: "curve_profile"; group?: string }
  | {
      id: string;
      label: string;
      kind: "file";
      accept?: string[];
      group?: string;
      /**
       * Called with the instance's id, the picked path, and the file's text
       * content right after a successful pick — before `onChange(id, path)`
       * stores the path itself. This is how a node parses/caches what it
       * actually needs (CSV Reader's csvStore, say) without the generic
       * param panel needing to know anything CSV-specific.
       */
      onLoaded?: (nodeId: string, path: string, content: any) => void;
    };

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
  /**
   * When present, overrides `paramFields` for a specific instance — for a
   * node like CSV Reader whose "which column" dropdown can't be known until
   * a file has actually been loaded for *this* instance. Takes the
   * instance itself (so it can key into whatever module-level cache the
   * node's own file keeps its loaded state in, the same "cache outside the
   * pure calculation, keyed by a stable id" pattern as `EvalContext.nodeId`).
   */
  dynamicParamFields?: (instance: NodeInstance) => ParamFieldDef[];
  /**
   * When present, overrides `inputs` for a specific instance based on its
   * own current connections — for a node like Merge whose socket count
   * grows as wires are added or Logic Bridge whose inputs change socket type.
   */
  dynamicInputs?: (
    connections: Connection[],
    connectionTypes?: { connection: Connection; sourceSocketType: import("./sockets").SocketType }[],
  ) => SocketDef[];
  /**
   * When present, overrides `outputs` for a specific instance based on its
   * own current connections — for a node like Logic Bridge whose output type
   * adapts to match its connected input type.
   */
  dynamicOutputs?: (
    connections: Connection[],
    connectionTypes?: { connection: Connection; sourceSocketType: import("./sockets").SocketType }[],
  ) => SocketDef[];
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

export interface Keyframe {
  frame: number;
  value: any;
}

/** Keyframes store keyed by nodeId -> paramKey -> array of Keyframe sorted by frame ascending. */
export type KeyframeStore = Record<string, Record<string, Keyframe[]>>;

export interface Graph {
  nodes: NodeInstance[];
  connections: Connection[];
  keyframes?: KeyframeStore;
  markers?: number[];
}

export function emptyGraph(): Graph {
  return { nodes: [], connections: [], keyframes: {}, markers: [] };
}

/**
 * How many canvases a project holds. Fixed rather than grown on demand —
 * the same "scene list" model OpenVMap 2D already has, and what makes a
 * canvas addressable by a stable number from anywhere (the selector, a Go To
 * Canvas node, a key binding later) instead of by an identity that shifts as
 * canvases are added and removed.
 */
export const CANVAS_COUNT = 6;

/**
 * A whole document: several independent node trees, one shown at a time.
 *
 * Each canvas is a complete Graph of its own — its own nodes, wires,
 * keyframes and markers, its own Render node holding its output settings.
 * Not one big graph partitioned by a per-node tag: BIBLE.md's scene model is
 * "multiple independent trees, not one mega-graph", and it is what keeps a
 * canvas's membership a matter of *which tree a node is in* rather than
 * something that has to be wired or tagged.
 *
 * Only the active canvas is evaluated and drawn. Node ids are UUIDs
 * (GraphEditor.tsx), so the per-node-id caches that hold meshes and other GPU
 * resources (nodeCaches.ts) can't collide across canvases — an inactive
 * canvas keeps its objects, and switching back to it costs one evaluation
 * rather than a rebuild.
 */
export interface Project {
  canvases: Graph[];
  /** Index into `canvases` — the one being edited, evaluated and rendered. */
  activeCanvas: number;
}

export function emptyProject(): Project {
  return { canvases: Array.from({ length: CANVAS_COUNT }, emptyGraph), activeCanvas: 0 };
}

/** Pads/trims a canvas list to exactly CANVAS_COUNT — what a file loaded from any version gets normalized through. */
export function normalizeCanvases(canvases: Graph[]): Graph[] {
  return Array.from({ length: CANVAS_COUNT }, (_, i) => canvases[i] ?? emptyGraph());
}

/** True when nothing has been built in this canvas yet — drives the dimmed slots in the canvas selector. */
export function isCanvasEmpty(graph: Graph | undefined): boolean {
  return !graph || graph.nodes.length === 0;
}
