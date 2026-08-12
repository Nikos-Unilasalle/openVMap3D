import { describe, expect, it } from "vitest";
import { Connection, Graph, NodeInstance } from "../types";
import { findReferencePointsForCamera } from "./graphLookup";

function node(id: string, type: string, params: Record<string, unknown> = {}): NodeInstance {
  return { id, type, params, position: { x: 0, y: 0 } };
}

function wire(fromNode: string, fromSocket: string, toNode: string, toSocket: string): Connection {
  return { id: `${fromNode}->${toNode}`, fromNode, fromSocket, toNode, toSocket };
}

function graphWith(connections: Connection[], cornerParams: Record<string, unknown> = {}): Graph {
  return {
    nodes: [node("cam", "calibration/camera"), node("corner", "calibration/room_corner", cornerParams)],
    connections,
  };
}

describe("findReferencePointsForCamera", () => {
  it("returns the wired Room Corner's reference points", () => {
    // Arrange
    const graph = graphWith([wire("corner", "points", "cam", "refPoints")]);

    // Act
    const points = findReferencePointsForCamera(graph, "cam");

    // Assert
    expect(points).not.toBeNull();
    expect(points).toHaveLength(6);
  });

  it("reflects the Room Corner's own measured dimensions", () => {
    // Arrange
    const graph = graphWith([wire("corner", "points", "cam", "refPoints")], { width: 5, height: 4, depth: 3 });

    // Act
    const points = findReferencePointsForCamera(graph, "cam")!;

    // Assert
    expect(points.find((p) => p.id === "wallA-floor")!.world.x).toBe(5);
    expect(points.find((p) => p.id === "corner-ceiling")!.world.y).toBe(4);
    expect(points.find((p) => p.id === "wallB-floor")!.world.z).toBe(3);
  });

  it("returns null when nothing is wired into Ref Points", () => {
    expect(findReferencePointsForCamera(graphWith([]), "cam")).toBeNull();
  });

  it("ignores a wire into a different socket", () => {
    const graph = graphWith([wire("corner", "geometry", "cam", "location")]);
    expect(findReferencePointsForCamera(graph, "cam")).toBeNull();
  });

  it("returns null when the wired source is not a calibration target", () => {
    // Arrange — a List node wired in carries a list, but not reference points
    const graph: Graph = {
      nodes: [node("cam", "calibration/camera"), node("list", "list/build")],
      connections: [wire("list", "out", "cam", "refPoints")],
    };

    // Act / Assert
    expect(findReferencePointsForCamera(graph, "cam")).toBeNull();
  });
});
