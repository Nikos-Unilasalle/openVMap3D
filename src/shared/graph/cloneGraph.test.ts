import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { cloneGraph, cloneParams } from "./cloneGraph";
import { Graph } from "./types";

function graphWith(params: Record<string, unknown>): Graph {
  return {
    nodes: [{ id: "a", type: "transform", position: { x: 1, y: 2 }, params }],
    connections: [{ id: "c", fromNode: "a", fromSocket: "matrix", toNode: "b", toSocket: "matrix" }],
  };
}

describe("cloneParams", () => {
  test("keeps a Vector3 an actual Vector3 — the JSON round-trip this replaces did not, which is what silently reset params on undo", () => {
    const cloned = cloneParams({ location: new THREE.Vector3(1, 2, 3) });

    expect(cloned.location).toBeInstanceOf(THREE.Vector3);
    expect(cloned.location).toEqual(new THREE.Vector3(1, 2, 3));
  });

  test("keeps a Color an actual Color", () => {
    const cloned = cloneParams({ color: new THREE.Color(0x336699) });

    expect(cloned.color).toBeInstanceOf(THREE.Color);
    expect((cloned.color as THREE.Color).getHex()).toBe(0x336699);
  });

  test("keeps a Matrix4 an actual Matrix4", () => {
    const cloned = cloneParams({ matrix: new THREE.Matrix4().makeTranslation(4, 5, 6) });

    expect(cloned.matrix).toBeInstanceOf(THREE.Matrix4);
  });

  test("copies rather than aliases, so editing the restored graph cannot write back into the snapshot", () => {
    const original = new THREE.Vector3(1, 2, 3);
    const cloned = cloneParams({ location: original });

    (cloned.location as THREE.Vector3).x = 99;

    expect(original.x).toBe(1);
  });

  test("clones plain nested objects, such as the camera's calibration picks", () => {
    const picks = { "corner-floor": { x: 0.5, y: 0.78 } };
    const cloned = cloneParams({ calibrationPicks: picks }) as { calibrationPicks: typeof picks };

    cloned.calibrationPicks["corner-floor"].x = 0.1;

    expect(picks["corner-floor"].x).toBe(0.5);
  });

  test("passes shared GPU resources through by reference — a cached texture must stay the same object", () => {
    const texture = new THREE.Texture();
    const cloned = cloneParams({ texture });

    expect(cloned.texture).toBe(texture);
  });

  test("leaves primitives and strings alone", () => {
    expect(cloneParams({ n: 4, s: "cover", b: true })).toEqual({ n: 4, s: "cover", b: true });
  });
});

describe("cloneGraph", () => {
  test("produces an independent graph", () => {
    const graph = graphWith({ location: new THREE.Vector3(1, 2, 3) });
    const cloned = cloneGraph(graph);

    cloned.nodes[0].position.x = 42;
    cloned.nodes.push({ id: "z", type: "time", position: { x: 0, y: 0 }, params: {} });

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].position.x).toBe(1);
  });

  test("round-trips node identity, type and connections unchanged", () => {
    const graph = graphWith({});
    const cloned = cloneGraph(graph);

    expect(cloned.nodes[0].id).toBe("a");
    expect(cloned.nodes[0].type).toBe("transform");
    expect(cloned.connections).toEqual(graph.connections);
    expect(cloned.connections[0]).not.toBe(graph.connections[0]);
  });

  test("preserves keyframes and markers across undo snapshots", () => {
    const graph: Graph = {
      nodes: [{ id: "a", type: "transform", position: { x: 0, y: 0 }, params: {} }],
      connections: [],
      keyframes: {
        a: {
          "rotation.x": [
            { frame: 0, value: 0, easeIn: "smooth", easeOut: "bounce" },
            { frame: 60, value: 180, easeIn: "bounce", easeOut: "smooth" },
          ],
        },
      },
      markers: [0, 30, 60],
    };

    const cloned = cloneGraph(graph);
    expect(cloned.keyframes).toBeDefined();
    expect(cloned.keyframes?.a?.["rotation.x"]).toHaveLength(2);
    expect(cloned.keyframes?.a?.["rotation.x"][0].value).toBe(0);
    expect(cloned.keyframes?.a?.["rotation.x"][0].easeOut).toBe("bounce");
    expect(cloned.markers).toEqual([0, 30, 60]);

    // Mutation of cloned should not affect original
    cloned.keyframes!.a["rotation.x"][0].frame = 99;
    cloned.markers!.push(120);

    expect(graph.keyframes!.a["rotation.x"][0].frame).toBe(0);
    expect(graph.markers).toEqual([0, 30, 60]);
  });
});
