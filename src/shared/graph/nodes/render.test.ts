import { describe, expect, test } from "vitest";
import { Graph } from "../types";
import { findRenderNodeId } from "./render";

function graphWith(nodes: { id: string; type: string }[]): Graph {
  return {
    nodes: nodes.map((n) => ({ ...n, params: {}, position: { x: 0, y: 0 } })),
    connections: [],
  };
}

describe("findRenderNodeId", () => {
  test("finds the id of the render-type node", () => {
    const graph = graphWith([
      { id: "box", type: "object/box" },
      { id: "output", type: "render" },
    ]);
    expect(findRenderNodeId(graph)).toBe("output");
  });

  test("no render node in the graph: undefined, not a throw", () => {
    const graph = graphWith([{ id: "box", type: "object/box" }]);
    expect(findRenderNodeId(graph)).toBeUndefined();
  });

  test("multiple render nodes: the first one in the array wins", () => {
    const graph = graphWith([
      { id: "renderA", type: "render" },
      { id: "renderB", type: "render" },
    ]);
    expect(findRenderNodeId(graph)).toBe("renderA");
  });
});
