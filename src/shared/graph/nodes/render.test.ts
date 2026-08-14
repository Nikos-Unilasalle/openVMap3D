import { describe, expect, test } from "vitest";
import { Graph } from "../types";
import { findRenderNodeId, RENDER_NODE } from "./render";

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

describe("RENDER_NODE evaluation", () => {
  test("computes width, height, and aspect ratio from resolution preset or custom params", () => {
    const defaultRes = RENDER_NODE.evaluate({}, RENDER_NODE.defaultParams, { time: 0, step: 0, nodeId: "r1" });
    expect(defaultRes.width).toBe(1920);
    expect(defaultRes.height).toBe(1080);
    expect(defaultRes.aspect).toBeCloseTo(16 / 9);

    const customRes = RENDER_NODE.evaluate({}, { resolutionPreset: "Custom", width: 1000, height: 1000 }, { time: 0, step: 0, nodeId: "r1" });
    expect(customRes.width).toBe(1000);
    expect(customRes.height).toBe(1000);
    expect(customRes.aspect).toBe(1);
  });
});
