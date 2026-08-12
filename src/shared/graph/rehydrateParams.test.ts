import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAMERA_NODE } from "./nodes/camera";
import { DEFAULT_REGISTRY } from "./nodes";
import { OBJECT_BOX_NODE } from "./nodes/object";
import { TRANSFORM_NODE } from "./nodes/transform";
import { rehydrateGraphParams } from "./rehydrateParams";
import { Graph, NodeInstance } from "./types";

function node(id: string, type: string, params: Record<string, unknown> = {}): NodeInstance {
  return { id, type, params, position: { x: 0, y: 0 } };
}

/** What a THREE.Vector3/Color instance actually looks like after a JSON round-trip through Tauri's cross-window IPC — a plain object with the same enumerable fields, prototype gone. */
function plainVector(x: number, y: number, z: number) {
  return { x, y, z };
}
function plainColor(r: number, g: number, b: number) {
  return { r, g, b };
}

describe("rehydrateGraphParams", () => {
  it("turns a plain {x,y,z} object back into a THREE.Vector3 where the node's default says it should be one", () => {
    // Arrange
    const graph: Graph = {
      nodes: [node("t1", TRANSFORM_NODE.type, { location: plainVector(1, 2, 3) })],
      connections: [],
    };

    // Act
    const result = rehydrateGraphParams(graph, DEFAULT_REGISTRY);

    // Assert
    const location = result.nodes[0].params.location;
    expect(location).toBeInstanceOf(THREE.Vector3);
    expect((location as THREE.Vector3).x).toBe(1);
    expect((location as THREE.Vector3).y).toBe(2);
    expect((location as THREE.Vector3).z).toBe(3);
  });

  it("turns a plain {r,g,b} object back into a THREE.Color", () => {
    const graph: Graph = {
      nodes: [node("b1", OBJECT_BOX_NODE.type, { color: plainColor(0.2, 0.4, 0.6) })],
      connections: [],
    };

    const result = rehydrateGraphParams(graph, DEFAULT_REGISTRY);

    const color = result.nodes[0].params.color;
    expect(color).toBeInstanceOf(THREE.Color);
    expect((color as THREE.Color).r).toBeCloseTo(0.2);
    expect((color as THREE.Color).g).toBeCloseTo(0.4);
    expect((color as THREE.Color).b).toBeCloseTo(0.6);
  });

  it("leaves an already-real THREE.Vector3 alone", () => {
    const original = new THREE.Vector3(5, 6, 7);
    const graph: Graph = { nodes: [node("t1", TRANSFORM_NODE.type, { location: original })], connections: [] };

    const result = rehydrateGraphParams(graph, DEFAULT_REGISTRY);

    expect(result.nodes[0].params.location).toBe(original);
  });

  it("leaves params with no class-typed default untouched", () => {
    const graph: Graph = {
      nodes: [node("cam", CAMERA_NODE.type, { mode: "calibrated", calibrationPicks: { a: { x: 0.1, y: 0.2 } } })],
      connections: [],
    };

    const result = rehydrateGraphParams(graph, DEFAULT_REGISTRY);

    expect(result.nodes[0].params.mode).toBe("calibrated");
    expect(result.nodes[0].params.calibrationPicks).toEqual({ a: { x: 0.1, y: 0.2 } });
  });

  it("leaves an unknown node type's params untouched instead of throwing", () => {
    const graph: Graph = { nodes: [node("x", "not/a/real/type", { location: plainVector(1, 1, 1) })], connections: [] };
    const result = rehydrateGraphParams(graph, DEFAULT_REGISTRY);
    expect(result.nodes[0].params.location).toEqual(plainVector(1, 1, 1));
  });

  it("does not mutate the input graph", () => {
    const graph: Graph = { nodes: [node("t1", TRANSFORM_NODE.type, { location: plainVector(1, 2, 3) })], connections: [] };
    const before = JSON.stringify(graph);
    rehydrateGraphParams(graph, DEFAULT_REGISTRY);
    expect(JSON.stringify(graph)).toBe(before);
  });
});
