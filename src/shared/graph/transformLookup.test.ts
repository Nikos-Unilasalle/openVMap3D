import { describe, expect, it } from "vitest";
import { Connection, Graph, NodeInstance } from "./types";
import { GIZMO_SELECTABLE_TYPES, resolveGizmoTarget } from "./transformLookup";

function node(id: string, type: string): NodeInstance {
  return { id, type, params: {}, position: { x: 0, y: 0 } };
}

function wire(fromNode: string, fromSocket: string, toNode: string, toSocket: string): Connection {
  return { id: `${fromNode}->${toNode}`, fromNode, fromSocket, toNode, toSocket };
}

describe("resolveGizmoTarget", () => {
  it("finds a Transform node wired directly into the object's matrix input", () => {
    // Arrange
    const graph: Graph = {
      nodes: [node("t1", "transform"), node("box1", "object/box")],
      connections: [wire("t1", "matrix", "box1", "matrix")],
    };

    // Act
    const result = resolveGizmoTarget(graph, "box1");

    // Assert
    expect(result).toEqual({ kind: "absolute", transformNodeId: "t1" });
  });

  it("resolves a Matrix Transform node as an offset target, with its own base source", () => {
    // Arrange
    const graph: Graph = {
      nodes: [node("t1", "transform"), node("mt1", "transform/matrix-transform"), node("box1", "object/box")],
      connections: [wire("t1", "matrix", "mt1", "matrix"), wire("mt1", "matrix", "box1", "matrix")],
    };

    // Act
    const result = resolveGizmoTarget(graph, "box1");

    // Assert
    expect(result).toEqual({ kind: "offset", transformNodeId: "mt1", baseSourceNodeId: "t1" });
  });

  it("resolves a Matrix Transform node with no base wired as an offset target with a null base", () => {
    const graph: Graph = {
      nodes: [node("mt1", "transform/matrix-transform"), node("box1", "object/box")],
      connections: [wire("mt1", "matrix", "box1", "matrix")],
    };

    const result = resolveGizmoTarget(graph, "box1");

    expect(result).toEqual({ kind: "offset", transformNodeId: "mt1", baseSourceNodeId: null });
  });

  it("returns null when nothing is wired into matrix", () => {
    const graph: Graph = { nodes: [node("box1", "object/box")], connections: [] };
    expect(resolveGizmoTarget(graph, "box1")).toBeNull();
  });

  it("returns null when the wired source is not a Transform or Matrix Transform node", () => {
    // Arrange — a Look At node also outputs a matrix, but isn't editable via location/rotation/scale
    const graph: Graph = {
      nodes: [node("look1", "transform/look-at"), node("box1", "object/box")],
      connections: [wire("look1", "matrix", "box1", "matrix")],
    };

    // Act / Assert
    expect(resolveGizmoTarget(graph, "box1")).toBeNull();
  });

  it("ignores a connection into a different socket", () => {
    const graph: Graph = {
      nodes: [node("t1", "transform"), node("box1", "object/box")],
      connections: [wire("t1", "matrix", "box1", "color")],
    };
    expect(resolveGizmoTarget(graph, "box1")).toBeNull();
  });

  it("returns null for an unknown object node id", () => {
    const graph: Graph = { nodes: [], connections: [] };
    expect(resolveGizmoTarget(graph, "missing")).toBeNull();
  });
});

describe("GIZMO_SELECTABLE_TYPES", () => {
  it("lists the primitive object node types", () => {
    expect(GIZMO_SELECTABLE_TYPES).toEqual([
      "object/box",
      "object/plane",
      "object/sphere",
      "object/obj",
      "object/text",
      "texture/plane",
      "light/directional",
      "light/point",
      "light/spot",
    ]);
  });
});
