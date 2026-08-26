import { describe, expect, it } from "vitest";
import { Graph } from "../graph/types";
import { exportSceneAsFolder } from "./exportScene";

describe("exportSceneAsFolder", () => {
  it("produces a static (single-frame) export when the graph has no Render node", async () => {
    const graph: Graph = {
      nodes: [{ id: "box-1", type: "object/box", position: { x: 0, y: 0 }, params: {} }],
      connections: [],
    };
    const files = await exportSceneAsFolder(graph, "Static Export");
    expect(files.map((f) => f.path)).toEqual(expect.arrayContaining(["scene.js", "index.html"]));

    const sceneJs = files.find((f) => f.path === "scene.js")!.data as string;
    const match = sceneJs.match(/window\.__OVM_SCENE__ = (.*);/);
    const scene = JSON.parse(match![1]);
    // No Render node -> captureScene (not captureAnimatedScene) -> no top-
    // level `frames` array at all, same shape the single-file exporter's
    // captureScene has always produced. The player treats an absent/length<=1
    // `frames` the same way: "hold forever".
    expect(scene.frames).toBeUndefined();
  });

  it("bakes one frame per Render-node frameCount, at the right time/fps, when one is present", async () => {
    const graph: Graph = {
      nodes: [
        { id: "box-1", type: "object/box", position: { x: 0, y: 0 }, params: {} },
        { id: "render-1", type: "render", position: { x: 200, y: 0 }, params: { frameCount: 4, fps: 10 } },
      ],
      connections: [{ id: "c1", fromNode: "box-1", fromSocket: "geometry", toNode: "render-1", toSocket: "geometry" }],
    };
    const files = await exportSceneAsFolder(graph, "Animated Export");
    const sceneJs = files.find((f) => f.path === "scene.js")!.data as string;

    expect(sceneJs).toContain("window.__OVM_FPS__ = 10;");
    const match = sceneJs.match(/window\.__OVM_SCENE__ = (.*);/);
    const scene = JSON.parse(match![1]);
    expect(scene.frames.length).toBe(4);
  });

  it("captures genuinely distinct per-frame poses, not N copies of the last frame", async () => {
    // Regression test: object/box hands back the SAME cached THREE.Mesh
    // instance across evaluate() calls, mutated in place. Collecting each
    // frame's Object3D reference into an array and only reading `.matrix`
    // after the whole bake loop finished (the original implementation)
    // meant every "frame" pointed at the identical, by-then-overwritten
    // object — silently baking N copies of the LAST frame's pose. Fixed by
    // reading each frame's matrix immediately, before the next frame's
    // evaluate() runs (see sceneSnapshot.ts's appendAnimatedFrame doc).
    const graph: Graph = {
      nodes: [
        { id: "box-1", type: "object/box", position: { x: 0, y: 0 }, params: {} },
        { id: "xf-1", type: "transform", position: { x: -100, y: 0 }, params: {} },
        { id: "vec-1", type: "vector/compose", position: { x: -200, y: 0 }, params: {} },
        { id: "osc-1", type: "animation/oscillator", position: { x: -300, y: 0 }, params: { frequency: 0.5, amplitude: 3 } },
        { id: "render-1", type: "render", position: { x: 200, y: 0 }, params: { frameCount: 30, fps: 30 } },
      ],
      connections: [
        { id: "c1", fromNode: "box-1", fromSocket: "geometry", toNode: "render-1", toSocket: "geometry" },
        { id: "c2", fromNode: "osc-1", fromSocket: "out", toNode: "vec-1", toSocket: "x" },
        { id: "c3", fromNode: "vec-1", fromSocket: "out", toNode: "xf-1", toSocket: "location" },
        { id: "c4", fromNode: "xf-1", fromSocket: "matrix", toNode: "box-1", toSocket: "matrix" },
      ],
    };

    const files = await exportSceneAsFolder(graph, "Motion Export");
    const sceneJs = files.find((f) => f.path === "scene.js")!.data as string;
    const scene = JSON.parse(sceneJs.match(/window\.__OVM_SCENE__ = (.*);/)![1]);
    const box = scene.children[0];
    const xPositions = box.frames.map((f: { matrix: number[] }) => f.matrix[12]);

    expect(new Set(xPositions).size).toBeGreaterThan(1);
  });

  it("does not duplicate a node consumed by another (Array source), same as the static exporter", async () => {
    const graph: Graph = {
      nodes: [
        { id: "box-1", type: "object/box", position: { x: 0, y: 0 }, params: {} },
        { id: "array-1", type: "structure/array", position: { x: 200, y: 0 }, params: {} },
      ],
      connections: [{ id: "c1", fromNode: "box-1", fromSocket: "geometry", toNode: "array-1", toSocket: "geometry" }],
    };
    const files = await exportSceneAsFolder(graph, "Array Export");
    const sceneJs = files.find((f) => f.path === "scene.js")!.data as string;
    const meshCount = (sceneJs.match(/"kind":"mesh"/g) || []).length;
    expect(meshCount).toBeGreaterThan(1); // the array's clones, not source+clones
  });
});
