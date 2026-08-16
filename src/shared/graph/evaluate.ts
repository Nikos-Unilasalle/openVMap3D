import * as THREE from "three";
import { Connection, EasingType, EvalContext, Graph, Keyframe, KeyframeStore, NodeRegistry } from "./types";

export interface TopoResult {
  /** Node ids in dependency order — safe to evaluate front to back. */
  order: string[];
  /** Node ids that could not be ordered because they sit in a connection cycle. */
  cyclic: string[];
}

function bounceEaseOut(p: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  let x = p;
  if (x < 1 / d1) {
    return n1 * x * x;
  }
  if (x < 2 / d1) {
    return n1 * (x -= 1.5 / d1) * x + 0.75;
  }
  if (x < 2.5 / d1) {
    return n1 * (x -= 2.25 / d1) * x + 0.9375;
  }
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

function bounceEaseIn(p: number): number {
  return 1 - bounceEaseOut(1 - p);
}

function elasticEaseOut(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1;
}

function elasticEaseIn(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return -Math.pow(2, 10 * p - 10) * Math.sin((p * 10 - 10.75) * c4);
}

function backEaseOut(p: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

function backEaseIn(p: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * Math.pow(p, 3) - c1 * Math.pow(p, 2);
}

function backEaseInOut(p: number): number {
  const c1 = 1.70158;
  const c2 = c1 * 1.525;
  return p < 0.5
    ? (Math.pow(2 * p, 2) * ((c2 + 1) * 2 * p - c2)) / 2
    : (Math.pow(2 * p - 2, 2) * ((c2 + 1) * (p * 2 - 2) + c2) + 2) / 2;
}

function expoEaseOut(p: number): number {
  return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
}

function expoEaseIn(p: number): number {
  return p <= 0 ? 0 : Math.pow(2, 10 * p - 10);
}

function sineEaseOut(p: number): number {
  return Math.sin((p * Math.PI) / 2);
}

function sineEaseIn(p: number): number {
  return 1 - Math.cos((p * Math.PI) / 2);
}

function sineEaseInOut(p: number): number {
  return (1 - Math.cos(Math.PI * p)) / 2;
}

export function computeSegmentEasing(t: number, easeOut?: EasingType, easeIn?: EasingType): number {
  const clampedT = Math.max(0, Math.min(1, t));
  const outType = easeOut || "smooth";
  const inType = easeIn || "smooth";

  if (outType === "hold") {
    return clampedT >= 1 ? 1 : 0;
  }

  // 1. Symmetrical / identical easing cases
  if (outType === inType) {
    switch (outType) {
      case "linear":
        return clampedT;
      case "smooth":
        return sineEaseInOut(clampedT);
      case "expo":
        return clampedT < 0.5 ? Math.pow(2, 20 * clampedT - 10) / 2 : (2 - Math.pow(2, -20 * clampedT + 10)) / 2;
      case "back":
        return backEaseInOut(clampedT);
      case "bounce":
        return bounceEaseOut(clampedT);
      case "elastic":
        return elasticEaseOut(clampedT);
    }
  }

  // 2. Specific expressive arrival on K2 (easeIn)
  if (inType === "bounce" && outType !== "bounce") {
    return bounceEaseOut(clampedT);
  }
  if (inType === "elastic" && outType !== "elastic") {
    return elasticEaseOut(clampedT);
  }
  if (inType === "back" && outType !== "back") {
    return backEaseOut(clampedT);
  }

  // 3. Specific expressive departure from K1 (easeOut)
  if (outType === "bounce") {
    return bounceEaseIn(clampedT);
  }
  if (outType === "elastic") {
    return elasticEaseIn(clampedT);
  }
  if (outType === "back") {
    return backEaseIn(clampedT);
  }

  // 4. Standard smooth / linear / expo mixtures
  if (outType === "linear" && inType === "smooth") {
    return sineEaseOut(clampedT);
  }
  if (outType === "smooth" && inType === "linear") {
    return sineEaseIn(clampedT);
  }
  if (inType === "expo") {
    return expoEaseOut(clampedT);
  }
  if (outType === "expo") {
    return expoEaseIn(clampedT);
  }

  return sineEaseInOut(clampedT);
}

/**
 * Keyframe value interpolation respecting In and Out easing curves.
 */
export function interpolateValue(v1: any, v2: any, t: number, easeOut?: EasingType, easeIn?: EasingType): any {
  const ease = computeSegmentEasing(t, easeOut, easeIn);

  if (typeof v1 === "number" && typeof v2 === "number") {
    return v1 + (v2 - v1) * ease;
  }

  if (v1 instanceof THREE.Vector3 || (typeof v1 === "object" && v1 !== null && "x" in v1)) {
    const vec1 = v1 instanceof THREE.Vector3 ? v1 : new THREE.Vector3(v1.x ?? 0, v1.y ?? 0, v1.z ?? 0);
    const vec2 = v2 instanceof THREE.Vector3 ? v2 : new THREE.Vector3(v2.x ?? 0, v2.y ?? 0, v2.z ?? 0);
    return new THREE.Vector3().lerpVectors(vec1, vec2, ease);
  }

  if (v1 instanceof THREE.Color || (typeof v1 === "object" && v1 !== null && "r" in v1 && "g" in v1 && "b" in v1)) {
    const c1 = v1 instanceof THREE.Color ? v1 : new THREE.Color(v1.r ?? 1, v1.g ?? 1, v1.b ?? 1);
    const c2 = v2 instanceof THREE.Color ? v2 : new THREE.Color(v2.r ?? 1, v2.g ?? 1, v2.b ?? 1);
    return new THREE.Color().lerpColors(c1, c2, ease);
  }

  return ease >= 0.5 ? v2 : v1;
}

function parseVector3(value: unknown): THREE.Vector3 {
  if (value instanceof THREE.Vector3) return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const x = Number(obj.x);
    const y = Number(obj.y);
    const z = Number(obj.z);
    return new THREE.Vector3(
      Number.isFinite(x) ? x : 0,
      Number.isFinite(y) ? y : 0,
      Number.isFinite(z) ? z : 0,
    );
  }
  if (Array.isArray(value)) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    const z = Number(value[2]);
    return new THREE.Vector3(
      Number.isFinite(x) ? x : 0,
      Number.isFinite(y) ? y : 0,
      Number.isFinite(z) ? z : 0,
    );
  }
  return new THREE.Vector3(0, 0, 0);
}

/** Clone the mutable types the keyframe store can hold so a caller mutating the
 * value it received can't corrupt the live store (which owns these instances).
 * A plain scalar (number/string/boolean) is returned as-is. */
function cloneKeyframeValue(value: any): any {
  if (value instanceof THREE.Vector3) return value.clone();
  if (value instanceof THREE.Color) return value.clone();
  if (value instanceof THREE.Euler) return value.clone();
  if (value instanceof THREE.Quaternion) return value.clone();
  return value;
}

function evaluateKeyframeList(list: Keyframe[], currentFrame: number, fallback: any): any {
  if (list.length === 0) return fallback;
  if (list.length === 1) return cloneKeyframeValue(list[0].value);
  if (currentFrame <= list[0].frame) return cloneKeyframeValue(list[0].value);
  if (currentFrame >= list[list.length - 1].frame) return cloneKeyframeValue(list[list.length - 1].value);

  for (let i = 0; i < list.length - 1; i++) {
    const k1 = list[i];
    const k2 = list[i + 1];
    if (currentFrame >= k1.frame && currentFrame <= k2.frame) {
      if (k1.frame === k2.frame) return cloneKeyframeValue(k1.value);
      const t = (currentFrame - k1.frame) / (k2.frame - k1.frame);
      return interpolateValue(k1.value, k2.value, t, k1.easeOut, k2.easeIn);
    }
  }

  return fallback;
}

export function evaluateKeyframeValue(
  keyframes: KeyframeStore | undefined,
  nodeId: string,
  paramKey: string,
  currentFrame: number,
  fallbackValue: any,
): any {
  if (!keyframes || currentFrame === undefined || currentFrame < 0) return fallbackValue;
  const nodeKeyframes = keyframes[nodeId];
  if (!nodeKeyframes) return fallbackValue;

  const directList = nodeKeyframes[paramKey];
  if (directList && directList.length > 0) {
    return evaluateKeyframeList(directList, currentFrame, fallbackValue);
  }

  const xList = nodeKeyframes[`${paramKey}.x`];
  const yList = nodeKeyframes[`${paramKey}.y`];
  const zList = nodeKeyframes[`${paramKey}.z`];

  if (xList || yList || zList) {
    const baseVec = parseVector3(fallbackValue);
    const resultVec = baseVec.clone();

    if (xList && xList.length > 0) {
      resultVec.x = evaluateKeyframeList(xList, currentFrame, baseVec.x);
    }
    if (yList && yList.length > 0) {
      resultVec.y = evaluateKeyframeList(yList, currentFrame, baseVec.y);
    }
    if (zList && zList.length > 0) {
      resultVec.z = evaluateKeyframeList(zList, currentFrame, baseVec.z);
    }

    return resultVec;
  }

  return fallbackValue;
}

/**
 * Kahn's algorithm. A node graph editor lets a user wire a cycle by mistake
 * sooner or later — this reports which nodes are caught in one rather than
 * hanging (a naive DFS-based sort would recurse forever on a cycle).
 * Dangling connections (referencing a node id no longer in the graph — the
 * editor deleted a node without cleaning up its wires) are silently ignored
 * rather than crashing the sort; the connection is just dead weight.
 */
export function topoSort(graph: Graph): TopoResult {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const downstream = new Map<string, string[]>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    downstream.set(id, []);
  }

  for (const conn of graph.connections) {
    if (!nodeIds.has(conn.fromNode) || !nodeIds.has(conn.toNode)) continue;
    downstream.get(conn.fromNode)!.push(conn.toNode);
    inDegree.set(conn.toNode, (inDegree.get(conn.toNode) ?? 0) + 1);
  }

  const queue = [...inDegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of downstream.get(id) ?? []) {
      const remaining = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  const ordered = new Set(order);
  const cyclic = graph.nodes.map((n) => n.id).filter((id) => !ordered.has(id));
  return { order, cyclic };
}

/** Per-node outputs from the most recent evaluation, keyed by node id then socket id. */
export type EvalResult = Map<string, Record<string, unknown>>;

function connectionInto(connections: Connection[], nodeId: string, socketId: string): Connection | undefined {
  return connections.find((c) => c.toNode === nodeId && c.toSocket === socketId);
}

/**
 * Evaluates every node once, in dependency order, eagerly — not the
 * lazy/memoized pull model Blender's node trees use. In a real-time context
 * the Time node changes every frame and most of the graph depends on it
 * transitively anyway, so "evaluate everything every frame" is both simpler
 * and rarely more expensive than the bookkeeping a dirty-tracking pull model
 * would need. Revisit only if profiling on a real graph says otherwise.
 *
 * Cyclic nodes are still evaluated — appended after the proper order, in
 * whatever order they appear in the graph — rather than silently skipped:
 * a node with no output is worse to debug than a node with a wrong one, and
 * "wrong" here usually still reads as "wrong in an obvious way" (e.g. reading
 * last frame's value from a node that isn't ready yet).
 */
/**
 * The one input socket the evaluator handles itself rather than leaving to
 * each node: hiding an object is the same operation for every node that has
 * one, and doing it here means a node only has to *declare* the socket to
 * get it — wireable from a Logic node, keyframable, and hierarchical (a
 * hidden Merge hides everything in it) because three.js already works that
 * way.
 *
 * Visibility is scene membership, not a look: unlike an opacity of 0 it
 * costs nothing to draw, applies to objects with no material of their own,
 * and takes the whole subtree with it.
 */
const VISIBILITY_SOCKET = "visible";

function applyVisibility(geometry: unknown, value: unknown): void {
  // undefined means the node never declared the socket — leave it alone.
  if (value === undefined || !(geometry instanceof THREE.Object3D)) return;
  const asNumber = Number(value);
  geometry.visible = Number.isFinite(asNumber) ? asNumber !== 0 : Boolean(value);
}

// The previous frame's per-node socket outputs, carried across calls so that a
// connected input whose source failed or hasn't resolved yet this frame (a
// cyclic node, a throwing node, an unknown type) still sees the last value it
// actually produced — instead of silently falling back to a static param. This
// is what the cyclic-node comment below has always promised but `results` is a
// fresh Map each pass, so it needed an explicit home to survive between frames.
let previousFrameOutputs: EvalResult | null = null;

export function evaluateGraph(graph: Graph, registry: NodeRegistry, ctx: EvalContext): EvalResult {
  const { order, cyclic } = topoSort(graph);
  const results: EvalResult = new Map();
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  for (const nodeId of [...order, ...cyclic]) {
    const instance = nodesById.get(nodeId);
    if (!instance) continue;

    const def = registry.get(instance.type);
    if (!def) {
      console.error(`unknown node type "${instance.type}" on node ${nodeId} — skipped`);
      continue;
    }

    // Deep-clone the mutable values that live on the shared defaultParams (a
    // Vector3/Color instance is common to every node of this type). A plain
    // spread would hand each node the *same* object by reference, so any node
    // mutating params.location in place would corrupt every other instance
    // that didn't override it. Cloning here isolates them (keyframe
    // interpolation below already clones its own Vector3/Color).
    const params: Record<string, unknown> = { ...def.defaultParams, ...instance.params };

    // Clone the shared mutable defaults one level deep, but only for the keys
    // the instance did NOT override (its own object comes from IPC/graph and
    // is already per-instance).
    for (const key of Object.keys(def.defaultParams)) {
      if (key in instance.params) continue;
      const v = def.defaultParams[key];
      if (v instanceof THREE.Vector3 || v instanceof THREE.Color || v instanceof THREE.Euler || v instanceof THREE.Quaternion) {
        params[key] = v.clone();
      }
    }

    // Apply keyframe interpolation to params so that param-based properties
    // (location, rotation, scale, color, etc.) reflect their animated values
    // during evaluation — not just in the param panel.  Without this, the
    // param panel shows the interpolated value but the viewport reads the
    // static stored value, so the 3D scene never moves.
    const kfStore = ctx.keyframes || graph.keyframes;
    const frame = ctx.currentFrame ?? -1;
    if (kfStore && frame >= 0 && kfStore[nodeId]) {
      for (const paramKey of Object.keys(params)) {
        params[paramKey] = evaluateKeyframeValue(kfStore, nodeId, paramKey, frame, params[paramKey]);
      }
    }
    const nodeConnections = graph.connections.filter((c) => c.toNode === nodeId);
    const socketDefs = def.dynamicInputs ? def.dynamicInputs(nodeConnections) : def.inputs;
    const inputs: Record<string, unknown> = {};
    // Which sockets a wire actually reaches, kept alongside the values: the
    // fill-in below makes `inputs.x !== undefined` true either way, so a node
    // forking its behaviour on "is this driven" has no other way to tell (see
    // EvalContext.connectedInputs).
    const connectedInputs = new Set<string>();
    const inputSources = new Map<string, string>();
    for (const socket of socketDefs) {
      const conn = connectionInto(graph.connections, nodeId, socket.id);
      if (conn) {
        connectedInputs.add(socket.id);
        inputSources.set(socket.id, conn.fromNode);
        // Priority rule: Node connection l'emporte toujours sur les keyframes!
        // If the source produced no value this frame (it threw, is an unknown
        // type, or is a cyclic node not ready yet), reuse the last frame's
        // output if we have one — never let a *connected* socket silently drop
        // to a static param as if nothing were wired to it.
        const fresh = results.get(conn.fromNode)?.[conn.fromSocket];
        inputs[socket.id] =
          fresh !== undefined ? fresh : previousFrameOutputs?.get(conn.fromNode)?.[conn.fromSocket];
      } else {
        // Unconnected socket: evaluate keyframe interpolation if keyframes exist
        const fallback = params[socket.id];
        inputs[socket.id] = evaluateKeyframeValue(
          ctx.keyframes || graph.keyframes,
          nodeId,
          socket.id,
          ctx.currentFrame ?? -1,
          fallback,
        );
      }
    }

    try {
      const outputs = def.evaluate(inputs, params, { ...ctx, nodeId, connectedInputs, inputSources }) || {};
      applyVisibility(outputs.geometry, inputs[VISIBILITY_SOCKET]);
      results.set(nodeId, {
        ...outputs,
        __evaluatedInputs: inputs,
      });
    } catch (err) {
      console.error(`node ${nodeId} (${instance.type}) failed to evaluate`, err);
      results.set(nodeId, {});
    }
  }

  previousFrameOutputs = results;
  return results;
}
