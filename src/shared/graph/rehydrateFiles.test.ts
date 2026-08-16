import { describe, expect, test } from "vitest";
import { Graph } from "./types";
import { rehydrateFileNodesFromDisk } from "./rehydrateFiles";

describe("rehydrateFileNodesFromDisk", () => {
  test("no-op outside Tauri (browser dev mode), regardless of file-backed nodes present", async () => {
    const graph: Graph = {
      nodes: [
        { id: "csv-x", type: "io/csv-reader", params: { filePath: "/tmp/data.csv" }, position: { x: 0, y: 0 } },
        { id: "obj-x", type: "object/obj", params: { filePath: "/tmp/model.obj" }, position: { x: 0, y: 0 } },
        { id: "tex-x", type: "texture/image", params: { filePath: "/tmp/image.png" }, position: { x: 0, y: 0 } },
        { id: "aud-x", type: "sound/player", params: { filePath: "/tmp/track.mp3" }, position: { x: 0, y: 0 } },
      ],
      connections: [],
    };

    await expect(rehydrateFileNodesFromDisk(graph)).resolves.toEqual({ attempted: 0, succeeded: 0, failed: 0 });
  });

  test("no-op when no node has a file param set", async () => {
    const graph: Graph = {
      nodes: [{ id: "csv-x", type: "io/csv-reader", params: {}, position: { x: 0, y: 0 } }],
      connections: [],
    };

    await expect(rehydrateFileNodesFromDisk(graph)).resolves.toEqual({ attempted: 0, succeeded: 0, failed: 0 });
  });
});
