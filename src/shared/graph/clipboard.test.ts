import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { getGraphClipboard, setGraphClipboard, hasGraphClipboard } from "./clipboard";
import { NodeInstance } from "./types";

describe("GRAPH CLIPBOARD SYSTEM", () => {
  test("stores and retrieves copied nodes, connections, and keyframes", () => {
    const nodeA: NodeInstance = {
      id: "node-1",
      type: "transform",
      position: { x: 100, y: 200 },
      params: { location: new THREE.Vector3(1, 2, 3), name: "Box" },
    };

    setGraphClipboard({
      nodes: [nodeA],
      connections: [],
      keyframes: {
        "node-1": {
          "rotation.x": [{ frame: 0, value: 0 }, { frame: 60, value: 90 }],
        },
      },
    });

    expect(hasGraphClipboard()).toBe(true);

    const clip = getGraphClipboard();
    expect(clip).not.toBeNull();
    expect(clip?.nodes).toHaveLength(1);
    expect(clip?.nodes[0].id).toBe("node-1");
    expect(clip?.nodes[0].params.location).toBeInstanceOf(THREE.Vector3);
    expect((clip?.nodes[0].params.location as THREE.Vector3).x).toBe(1);
    expect(clip?.keyframes?.["node-1"]?.["rotation.x"]).toHaveLength(2);

    // Mutation of retrieved clipboard does not corrupt global store
    clip!.nodes[0].position.x = 999;
    (clip!.nodes[0].params.location as THREE.Vector3).x = 777;

    const clip2 = getGraphClipboard();
    expect(clip2?.nodes[0].position.x).toBe(100);
    expect((clip2?.nodes[0].params.location as THREE.Vector3).x).toBe(1);
  });
});
