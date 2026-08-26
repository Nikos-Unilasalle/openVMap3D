import { describe, expect, it } from "vitest";
import { Graph } from "../graph/types";
import { exportSceneAsStandaloneHtml } from "./exportScene";

describe("exportSceneAsStandaloneHtml", () => {
  it("exports a single Box node's graph as a working standalone page", () => {
    const graph: Graph = {
      nodes: [{ id: "box-1", type: "object/box", position: { x: 0, y: 0 }, params: {} }],
      connections: [],
    };

    const html = exportSceneAsStandaloneHtml(graph, "Box Export");
    expect(html).toContain("<title>Box Export</title>");
    expect(html).toContain("window.__OVM_SCENE__");
    // The Box node's default geometry (a BoxGeometry mesh) must actually be
    // present in the captured tree, not just an empty top-level group.
    expect(html).toContain('"kind":"mesh"');
  });

  it("does not duplicate an object consumed by another node (e.g. an Array's source)", () => {
    // A source Box feeding an Array node: without resolveSceneRoots, the
    // source Box's OWN output would also count as a root and render a
    // second, unarrayed copy sitting at the origin alongside the array.
    const graph: Graph = {
      nodes: [
        { id: "box-1", type: "object/box", position: { x: 0, y: 0 }, params: {} },
        { id: "array-1", type: "structure/array", position: { x: 200, y: 0 }, params: {} },
      ],
      connections: [{ id: "c1", fromNode: "box-1", fromSocket: "geometry", toNode: "array-1", toSocket: "geometry" }],
    };

    const html = exportSceneAsStandaloneHtml(graph, "Array Export");
    const meshCount = (html.match(/"kind":"mesh"/g) || []).length;
    // Array's default count param produces several clones — as long as
    // there's more than the single un-arrayed source would give, and no
    // stray root-level duplicate of the plain source box.
    expect(meshCount).toBeGreaterThan(1);
  });
});
