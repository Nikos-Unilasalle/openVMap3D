import { describe, expect, test, vi } from "vitest";
import { DEFAULT_REGISTRY } from "./nodes";
import { pruneDanglingConnections } from "./pruneConnections";
import { Connection, Graph, NodeInstance } from "./types";

function node(id: string, type: string): NodeInstance {
  return { id, type, position: { x: 0, y: 0 }, params: {} };
}

function wire(fromNode: string, fromSocket: string, toNode: string, toSocket: string): Connection {
  return { id: `${fromNode}:${fromSocket}->${toNode}:${toSocket}`, fromNode, fromSocket, toNode, toSocket };
}

function prune(nodes: NodeInstance[], connections: Connection[]): Connection[] {
  return pruneDanglingConnections({ nodes, connections }, DEFAULT_REGISTRY).connections;
}

describe("pruneDanglingConnections", () => {
  test("keeps a connection between two sockets that exist", () => {
    const connections = [wire("box1", "geometry", "render1", "geometry")];

    expect(prune([node("box1", "object/box"), node("render1", "render")], connections)).toEqual(connections);
  });

  test("drops a wire into a socket that no longer exists", () => {
    // What a .ovm saved before the Camera's unused geometry input was
    // removed still carries.
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = prune(
      [node("box1", "object/box"), node("cam1", "calibration/camera")],
      [wire("box1", "geometry", "cam1", "geometry")],
    );

    expect(result).toEqual([]);
  });

  test("the Camera still accepts an object to aim at", () => {
    const connections = [wire("empty1", "geometry", "cam1", "target")];

    expect(prune([node("empty1", "object/empty"), node("cam1", "calibration/camera")], connections)).toEqual(
      connections,
    );
  });

  test("drops a wire whose node is gone", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(prune([node("box1", "object/box")], [wire("box1", "geometry", "deleted", "geometry")])).toEqual([]);
  });

  test("keeps a Merge's dynamically grown sockets", () => {
    const boxes = ["b0", "b1", "b2"].map((id) => node(id, "object/box"));
    const connections = boxes.map((b, i) => wire(b.id, "geometry", "merge1", `in${i}`));

    expect(prune([...boxes, node("merge1", "structure/merge")], connections)).toEqual(connections);
  });

  test("leaves an unknown node type's wires alone rather than rewriting a graph it can't read", () => {
    const connections = [wire("mystery", "out", "box1", "matrix")];

    expect(prune([node("mystery", "plugin/not-registered"), node("box1", "object/box")], connections)).toEqual(
      connections,
    );
  });

  test("returns the very same graph object when nothing is dangling", () => {
    const graph: Graph = {
      nodes: [node("box1", "object/box"), node("render1", "render")],
      connections: [wire("box1", "geometry", "render1", "geometry")],
    };

    expect(pruneDanglingConnections(graph, DEFAULT_REGISTRY)).toBe(graph);
  });

  test("prunes wires connected to non-existent sockets on dynamic nodes", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const connections = [
      wire("box1", "geometry", "merge1", "in0"),
      wire("box2", "geometry", "merge1", "nonExistentSocket"),
    ];

    const result = prune(
      [node("box1", "object/box"), node("box2", "object/box"), node("merge1", "structure/merge")],
      connections,
    );

    expect(result).toEqual([wire("box1", "geometry", "merge1", "in0")]);
  });
});
