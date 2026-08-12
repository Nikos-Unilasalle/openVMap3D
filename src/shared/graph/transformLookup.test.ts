import { describe, expect, it } from "vitest";
import { Connection, Graph, NodeInstance } from "./types";
import { findUpstreamTransformNode, GIZMO_SELECTABLE_TYPES } from "./transformLookup";

function node(id: string, type: string): NodeInstance {
  return { id, type, params: {}, position: { x: 0, y: 0 } };
}

function wire(fromNode: string, fromSocket: string, toNode: string, toSocket: string): Connection {
  return { id: `${fromNode}->${toNode}`, fromNode, fromSocket, toNode, toSocket };
}

describe("findUpstreamTransformNode", () => {
  it("finds a Transform node wired directly into the object's matrix input", () => {
    // Arrange
    const graph: Graph = {
      nodes: [node("t1", "transform"), node("box1", "object/box")],
      connections: [wire("t1", "matrix", "box1", "matrix")],
    };

    // Act
    const result = findUpstreamTransformNode(graph, "box1");

    // Assert
    expect(result).toBe("t1");
  });

  it("returns null when nothing is wired into matrix", () => {
    const graph: Graph = { nodes: [node("box1", "object/box")], connections: [] };
    expect(findUpstreamTransformNode(graph, "box1")).toBeNull();
  });

  it("returns null when the wired source is not a Transform node", () => {
    // Arrange — a Look At node also outputs a matrix, but isn't editable via location/rotation/scale
    const graph: Graph = {
      nodes: [node("look1", "transform/look-at"), node("box1", "object/box")],
      connections: [wire("look1", "matrix", "box1", "matrix")],
    };

    // Act / Assert
    expect(findUpstreamTransformNode(graph, "box1")).toBeNull();
  });

  it("ignores a connection into a different socket", () => {
    const graph: Graph = {
      nodes: [node("t1", "transform"), node("box1", "object/box")],
      connections: [wire("t1", "matrix", "box1", "color")],
    };
    expect(findUpstreamTransformNode(graph, "box1")).toBeNull();
  });

  it("returns null for an unknown object node id", () => {
    const graph: Graph = { nodes: [], connections: [] };
    expect(findUpstreamTransformNode(graph, "missing")).toBeNull();
  });
});

describe("GIZMO_SELECTABLE_TYPES", () => {
  it("lists the primitive object node types", () => {
    expect(GIZMO_SELECTABLE_TYPES).toEqual(["object/box", "object/plane", "object/sphere"]);
  });
});
