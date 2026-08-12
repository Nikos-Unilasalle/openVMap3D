import { Connection, EvalContext, Graph, NodeRegistry } from "./types";

export interface TopoResult {
  /** Node ids in dependency order — safe to evaluate front to back. */
  order: string[];
  /** Node ids that could not be ordered because they sit in a connection cycle. */
  cyclic: string[];
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

    const params = { ...def.defaultParams, ...instance.params };
    const nodeConnections = graph.connections.filter((c) => c.toNode === nodeId);
    const socketDefs = def.dynamicInputs ? def.dynamicInputs(nodeConnections) : def.inputs;
    const inputs: Record<string, unknown> = {};
    for (const socket of socketDefs) {
      const conn = connectionInto(graph.connections, nodeId, socket.id);
      // Unconnected fallback must come from the *merged* params, not raw
      // instance.params — a freshly placed node (params: {}) has nothing of
      // its own yet, and every unconnected input silently read as undefined
      // instead of its declared defaultParams value.
      inputs[socket.id] = conn ? results.get(conn.fromNode)?.[conn.fromSocket] : params[socket.id];
    }

    try {
      results.set(nodeId, def.evaluate(inputs, params, { ...ctx, nodeId }));
    } catch (err) {
      console.error(`node ${nodeId} (${instance.type}) failed to evaluate`, err);
      results.set(nodeId, {});
    }
  }

  return results;
}
