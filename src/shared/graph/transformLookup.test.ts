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

  it("falls through to a native target when nothing is wired into matrix, for an object type with a native pose", () => {
    const graph: Graph = { nodes: [node("box1", "object/box")], connections: [] };
    expect(resolveGizmoTarget(graph, "box1")).toEqual({
      kind: "native",
      objectNodeId: "box1",
      deltaSourceNodeId: null,
    });
  });

  it("falls through to a native target when the wired source is not a Transform or Matrix Transform node — the wired node becomes the delta", () => {
    // Arrange — a Look At node also outputs a matrix, but isn't editable via location/rotation/scale
    const graph: Graph = {
      nodes: [node("look1", "transform/look-at"), node("box1", "object/box")],
      connections: [wire("look1", "matrix", "box1", "matrix")],
    };

    // Act / Assert — the object's own native pose is still draggable; the
    // Look At output composes on top of it as the delta, not cancelling it.
    expect(resolveGizmoTarget(graph, "box1")).toEqual({
      kind: "native",
      objectNodeId: "box1",
      deltaSourceNodeId: "look1",
    });
  });

  it("a connection into a different socket doesn't count as a delta source", () => {
    const graph: Graph = {
      nodes: [node("t1", "transform"), node("box1", "object/box")],
      connections: [wire("t1", "matrix", "box1", "color")],
    };
    expect(resolveGizmoTarget(graph, "box1")).toEqual({
      kind: "native",
      objectNodeId: "box1",
      deltaSourceNodeId: null,
    });
  });

  it("returns null for an unknown object node id", () => {
    const graph: Graph = { nodes: [], connections: [] };
    expect(resolveGizmoTarget(graph, "missing")).toBeNull();
  });

  it("returns null for an object type with no native pose (e.g. Ambient Light, position-independent) and nothing Transform-like wired in", () => {
    const graph: Graph = { nodes: [node("amb1", "light/ambient")], connections: [] };
    expect(resolveGizmoTarget(graph, "amb1")).toBeNull();
  });

  it("returns null for a node type not in GIZMO_SELECTABLE_TYPES at all", () => {
    const graph: Graph = { nodes: [node("merge1", "structure/merge")], connections: [] };
    expect(resolveGizmoTarget(graph, "merge1")).toBeNull();
  });
});

describe("GIZMO_SELECTABLE_TYPES", () => {
  it("lists the primitive object node types", () => {
    expect(GIZMO_SELECTABLE_TYPES).toEqual([
      "object/box",
      "object/plane",
      "object/sphere",
      "object/disc",
      "object/cylinder",
      "object/cone",
      "object/bar_graph",
      "object/line_graph",
      "object/chart_axis",
      "object/pie_chart",
      "object/scatter_plot",
      "object/point_cloud",
      "object/obj",
      "object/text",
      "curve/to_mesh",
      "curve/deform",
      "object/empty",
      "texture/plane",
      "light/directional",
      "light/point",
      "light/spot",
      "calibration/camera",
      "calibration/grid",
      "modifier/lattice",
    ]);
  });
});
