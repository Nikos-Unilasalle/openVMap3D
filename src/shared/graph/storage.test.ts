import { describe, expect, it } from "vitest";
import {
  deserializeGraph,
  ensureOvmExtension,
  incrementFilename,
  serializeGraph,
} from "./storage";
import { Graph } from "./types";

describe("storage utilities", () => {
  describe("ensureOvmExtension", () => {
    it("appends .ovm if missing", () => {
      expect(ensureOvmExtension("project")).toBe("project.ovm");
    });

    it("keeps .ovm extension if present", () => {
      expect(ensureOvmExtension("project_v1.ovm")).toBe("project_v1.ovm");
    });

    it("keeps .json extension if present for backward compatibility", () => {
      expect(ensureOvmExtension("project_v1.json")).toBe("project_v1.json");
    });
  });

  describe("incrementFilename", () => {
    it("increments .ovm version numbers", () => {
      expect(incrementFilename("project_v1.ovm")).toBe("project_v2.ovm");
      expect(incrementFilename("graph_01.ovm")).toBe("graph_02.ovm");
      expect(incrementFilename("scene_09.ovm")).toBe("scene_10.ovm");
    });

    it("appends _v2.ovm when no number exists", () => {
      expect(incrementFilename("my_graph.ovm")).toBe("my_graph_v2.ovm");
      expect(incrementFilename("my_graph")).toBe("my_graph_v2.ovm");
    });

    it("handles .json files gracefully", () => {
      expect(incrementFilename("project_v1.json")).toBe("project_v2.json");
    });
  });

  describe("serializeGraph & deserializeGraph", () => {
    it("round-trips a valid graph", () => {
      const graph: Graph = {
        nodes: [
          { id: "1", type: "time", position: { x: 0, y: 0 }, params: {} },
          { id: "2", type: "render", position: { x: 100, y: 0 }, params: {} },
        ],
        connections: [
          { id: "1.sec->2.geom", fromNode: "1", fromSocket: "seconds", toNode: "2", toSocket: "geometry" },
        ],
      };

      const json = serializeGraph(graph);
      const restored = deserializeGraph(json);

      expect(restored).toEqual(graph);
    });

    it("throws on invalid JSON or missing fields", () => {
      expect(() => deserializeGraph("not json")).toThrow();
      expect(() => deserializeGraph("{}")).toThrow("missing 'nodes'");
      expect(() => deserializeGraph('{"nodes": [{}], "connections": []}')).toThrow("missing required fields");
    });
  });
});
