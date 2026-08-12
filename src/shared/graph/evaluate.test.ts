import { describe, expect, test } from "vitest";
import { evaluateGraph, topoSort } from "./evaluate";
import { Connection, EvalContext, Graph, NodeDefinition, NodeInstance, createRegistry } from "./types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "" };

function node(id: string, type: string, params: Record<string, unknown> = {}): NodeInstance {
  return { id, type, params, position: { x: 0, y: 0 } };
}

function edge(fromNode: string, fromSocket: string, toNode: string, toSocket: string): Connection {
  return { id: `${fromNode}.${fromSocket}->${toNode}.${toSocket}`, fromNode, fromSocket, toNode, toSocket };
}

/** A constant Value node — the simplest possible source, output = its own param. */
const CONST: NodeDefinition = {
  type: "test/const",
  label: "Const",
  category: "math",
  inputs: [],
  outputs: [{ id: "out", label: "Out", type: "value" }],
  defaultParams: { value: 0 },
  evaluate: (_inputs, params) => ({ out: Number(params.value) || 0 }),
};

/** Value + Value -> Value, missing input treated as 0 — proves the evaluator threads data through. */
const ADD: NodeDefinition = {
  type: "test/add",
  label: "Add",
  category: "math",
  inputs: [
    { id: "a", label: "A", type: "value" },
    { id: "b", label: "B", type: "value" },
  ],
  outputs: [{ id: "out", label: "Out", type: "value" }],
  defaultParams: {},
  evaluate: (inputs) => ({ out: (Number(inputs.a) || 0) + (Number(inputs.b) || 0) }),
};

const THROWS: NodeDefinition = {
  type: "test/throws",
  label: "Throws",
  category: "math",
  inputs: [],
  outputs: [{ id: "out", label: "Out", type: "value" }],
  defaultParams: {},
  evaluate: () => {
    throw new Error("boom");
  },
};

const REGISTRY = createRegistry([CONST, ADD, THROWS]);

describe("topoSort", () => {
  test("orders a simple chain source-first", () => {
    const graph: Graph = {
      nodes: [node("a", "test/const"), node("b", "test/const"), node("c", "test/add")],
      connections: [edge("a", "out", "c", "a"), edge("b", "out", "c", "b")],
    };

    const { order, cyclic } = topoSort(graph);

    expect(cyclic).toEqual([]);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("c"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
  });

  test("reports a cycle instead of hanging", () => {
    const graph: Graph = {
      nodes: [node("a", "test/add"), node("b", "test/add")],
      connections: [edge("a", "out", "b", "a"), edge("b", "out", "a", "a")],
    };

    const { order, cyclic } = topoSort(graph);

    expect(order).toEqual([]);
    expect(cyclic.sort()).toEqual(["a", "b"]);
  });

  test("ignores a connection left dangling by a deleted node", () => {
    const graph: Graph = {
      nodes: [node("a", "test/const")],
      connections: [edge("ghost", "out", "a", "a")],
    };

    const { order, cyclic } = topoSort(graph);

    expect(order).toEqual(["a"]);
    expect(cyclic).toEqual([]);
  });
});

describe("evaluateGraph", () => {
  test("threads a value from a source node to a consumer through a connection", () => {
    const graph: Graph = {
      nodes: [node("a", "test/const", { value: 3 }), node("b", "test/const", { value: 4 }), node("c", "test/add")],
      connections: [edge("a", "out", "c", "a"), edge("b", "out", "c", "b")],
    };

    const result = evaluateGraph(graph, REGISTRY, CTX);

    expect(result.get("c")?.out).toBe(7);
  });

  test("an unconnected input falls back to the node instance's own param", () => {
    const graph: Graph = {
      nodes: [node("a", "test/const", { value: 10 }), node("c", "test/add", { b: 5 })],
      connections: [edge("a", "out", "c", "a")],
    };

    const result = evaluateGraph(graph, REGISTRY, CTX);

    expect(result.get("c")?.out).toBe(15);
  });

  test("an unknown node type is skipped, not fatal to the rest of the graph", () => {
    const graph: Graph = {
      nodes: [node("a", "test/const", { value: 1 }), node("ghost", "not/registered")],
      connections: [],
    };

    const result = evaluateGraph(graph, REGISTRY, CTX);

    expect(result.get("a")?.out).toBe(1);
    expect(result.has("ghost")).toBe(false);
  });

  test("a node that throws does not take the rest of the graph down with it", () => {
    const graph: Graph = {
      nodes: [node("a", "test/const", { value: 1 }), node("bad", "test/throws")],
      connections: [],
    };

    const result = evaluateGraph(graph, REGISTRY, CTX);

    expect(result.get("a")?.out).toBe(1);
    expect(result.get("bad")).toEqual({});
  });

  test("cyclic nodes are still evaluated, not silently dropped", () => {
    const graph: Graph = {
      nodes: [node("a", "test/add"), node("b", "test/add")],
      connections: [edge("a", "out", "b", "a"), edge("b", "out", "a", "a")],
    };

    const result = evaluateGraph(graph, REGISTRY, CTX);

    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(true);
  });
});
