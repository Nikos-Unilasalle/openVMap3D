import { describe, expect, test } from "vitest";
import { CANVAS_COUNT, emptyGraph, emptyProject, Graph, isCanvasEmpty, normalizeCanvases } from "./types";

function graphWithNodes(count: number): Graph {
  return {
    nodes: Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      type: "object/box",
      position: { x: 0, y: 0 },
      params: {},
    })),
    connections: [],
  };
}

describe("normalizeCanvases", () => {
  test("pads a short list up to the full set of slots", () => {
    const canvases = normalizeCanvases([graphWithNodes(1)]);

    expect(canvases).toHaveLength(CANVAS_COUNT);
    expect(canvases[0].nodes).toHaveLength(1);
    expect(canvases[CANVAS_COUNT - 1].nodes).toHaveLength(0);
  });

  test("trims a list longer than the document holds", () => {
    const tooMany = Array.from({ length: CANVAS_COUNT + 3 }, () => graphWithNodes(1));

    expect(normalizeCanvases(tooMany)).toHaveLength(CANVAS_COUNT);
  });

  test("keeps existing canvases as they are, by identity", () => {
    const first = graphWithNodes(2);

    expect(normalizeCanvases([first])[0]).toBe(first);
  });

  test("padding slots are distinct objects, not the same empty graph shared", () => {
    // They're about to be edited independently — sharing one would make
    // building in canvas 2 show up in canvas 3.
    const canvases = normalizeCanvases([]);

    expect(canvases[1]).not.toBe(canvases[2]);
  });
});

describe("emptyProject", () => {
  test("opens on the first canvas with every slot empty", () => {
    const project = emptyProject();

    expect(project.activeCanvas).toBe(0);
    expect(project.canvases).toHaveLength(CANVAS_COUNT);
    expect(project.canvases.every(isCanvasEmpty)).toBe(true);
  });
});

describe("isCanvasEmpty", () => {
  test("empty when it has no nodes, or isn't there at all", () => {
    expect(isCanvasEmpty(emptyGraph())).toBe(true);
    expect(isCanvasEmpty(undefined)).toBe(true);
  });

  test("a canvas holding anything is not empty", () => {
    expect(isCanvasEmpty(graphWithNodes(1))).toBe(false);
  });
});
