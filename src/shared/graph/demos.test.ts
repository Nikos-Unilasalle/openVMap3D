import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deserializeProject } from "./storage";
import { DEFAULT_REGISTRY } from "./nodes/index";
import { evaluateGraph } from "./evaluate";
import { initBvhRaycast } from "../three/bvh";

const DEMO_DIR = join(process.cwd(), "demos");

describe("demo .tsuji files", () => {
  const files = readdirSync(DEMO_DIR).filter((f) => f.endsWith(".tsuji"));
  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    it(`loads and evaluates ${file}`, () => {
      initBvhRaycast();
      const text = readFileSync(join(DEMO_DIR, file), "utf8");
      // deserializeProject, not deserializeGraph: saving a demo from the app
      // writes the multi-canvas project shape, and a demo re-saved that way
      // used to fail this test on its format rather than on its content.
      const project = deserializeProject(text, DEFAULT_REGISTRY);
      const graph = project.canvases.find((c) => c.nodes.length > 0) ?? project.canvases[0];
      expect(graph.nodes.length).toBeGreaterThan(0);

      const results = evaluateGraph(graph, DEFAULT_REGISTRY, {
        time: 1.2,
        step: 36,
        nodeId: "demo-check",
        renderSize: { width: 1920, height: 1080 },
        currentFrame: 36,
        keyframes: graph.keyframes,
      } as never);

      // Every registered node must have produced a result (a throwing node
      // yields {}). Unknown types come from legacy demos and are skipped.
      for (const node of graph.nodes) {
        if (!DEFAULT_REGISTRY.has(node.type)) continue;
        const res = results.get(node.id);
        expect(res, `node ${node.id} (${node.type}) failed to evaluate`).toBeDefined();
      }
    });
  }
});
