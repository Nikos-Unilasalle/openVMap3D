import { describe, expect, test } from "vitest";
import { DEFAULT_REGISTRY } from "./nodes";
import { resolveSceneRoots } from "./sceneRoots";
import { Connection, Graph, NodeInstance } from "./types";

function node(id: string, type: string, params: Record<string, unknown> = {}): NodeInstance {
  return { id, type, position: { x: 0, y: 0 }, params };
}

function wire(fromNode: string, fromSocket: string, toNode: string, toSocket: string): Connection {
  return { id: `${fromNode}:${fromSocket}->${toNode}:${toSocket}`, fromNode, fromSocket, toNode, toSocket };
}

function roots(nodes: NodeInstance[], connections: Connection[] = []): string[] {
  const graph: Graph = { nodes, connections };
  return resolveSceneRoots(graph, DEFAULT_REGISTRY);
}

describe("resolveSceneRoots", () => {
  test("a lone object node renders — no Render node required", () => {
    expect(roots([node("box1", "object/box")])).toEqual(["box1"]);
  });

  test("an object wired into a Merge stops being a root; the Merge takes over", () => {
    const result = roots(
      [node("box1", "object/box"), node("box2", "object/box"), node("merge1", "structure/merge")],
      [wire("box1", "geometry", "merge1", "in0"), wire("box2", "geometry", "merge1", "in1")],
    );

    expect(result).toEqual(["merge1"]);
  });

  test("a Merge's dynamically added sockets own just like its first one", () => {
    // in3 only exists once three wires are attached — resolving it needs the
    // node's live connections, not the static socket list.
    const merge = node("merge1", "structure/merge");
    const boxes = ["b0", "b1", "b2", "b3"].map((id) => node(id, "object/box"));
    const wires = boxes.map((b, i) => wire(b.id, "geometry", "merge1", `in${i}`));

    expect(roots([...boxes, merge], wires)).toEqual(["merge1"]);
  });

  test("the old explicit graph still behaves exactly as it did: Box -> Render draws once", () => {
    const result = roots(
      [node("box1", "object/box"), node("render1", "render")],
      [wire("box1", "geometry", "render1", "geometry")],
    );

    expect(result).toEqual(["render1"]);
  });

  test("unwiring from Render leaves the object visible instead of blanking the view", () => {
    // The empty Render node is still listed — the list is candidates, and the
    // caller drops the ones that evaluated to no Object3D (a Render with
    // nothing wired in resolves to undefined). What matters is that the Box
    // no longer depends on it.
    expect(roots([node("box1", "object/box"), node("render1", "render")])).toContain("box1");
  });

  test("an aim target keeps rendering — a Look At reads its position, it does not own it", () => {
    const result = roots(
      [node("box1", "object/box"), node("empty1", "object/empty"), node("look1", "transform/look-at")],
      [wire("box1", "geometry", "look1", "geometry"), wire("empty1", "geometry", "look1", "target")],
    );

    // The Box is consumed (Look At clones it into its own wrapper), the Empty
    // it aims at is not.
    expect(result).toEqual(["empty1", "look1"]);
  });

  test("a Spot Light's target stays visible, and lights are never roots themselves", () => {
    const result = roots(
      [node("empty1", "object/empty"), node("spot1", "light/spot")],
      [wire("empty1", "geometry", "spot1", "target")],
    );

    expect(result).toEqual(["empty1"]);
  });

  test("a node that only measures geometry does not consume it", () => {
    const result = roots(
      [node("box1", "object/box"), node("dist1", "math/distance")],
      [wire("box1", "geometry", "dist1", "target")],
    );

    expect(result).toContain("box1");
  });

  test("a Reroute carries the object on: the source stops being a root, the Reroute becomes one", () => {
    const result = roots(
      [node("box1", "object/box"), node("rr1", "utility/reroute")],
      [wire("box1", "geometry", "rr1", "in")],
    );

    expect(result).toEqual(["rr1"]);
  });

  test("both branches of a Logic Bridge are owned — the unselected one must not linger on screen", () => {
    const result = roots(
      [node("box1", "object/box"), node("box2", "object/box"), node("bridge1", "logic/bridge")],
      [wire("box1", "geometry", "bridge1", "ifTrue"), wire("box2", "geometry", "bridge1", "ifFalse")],
    );

    expect(result).toEqual(["bridge1"]);
  });

  test("one object feeding two owners yields two roots — Array and Merge each draw their own copy", () => {
    const result = roots(
      [node("box1", "object/box"), node("arr1", "structure/array"), node("merge1", "structure/merge")],
      [wire("box1", "geometry", "arr1", "geometry"), wire("box1", "geometry", "merge1", "in0")],
    );

    expect(result).toEqual(["arr1", "merge1"]);
  });

  test("a chain renders only its last node", () => {
    const result = roots(
      [
        node("box1", "object/box"),
        node("arr1", "structure/array"),
        node("merge1", "structure/merge"),
        node("render1", "render"),
      ],
      [
        wire("box1", "geometry", "arr1", "geometry"),
        wire("arr1", "geometry", "merge1", "in0"),
        wire("merge1", "geometry", "render1", "geometry"),
      ],
    );

    expect(result).toEqual(["render1"]);
  });

  test("nodes that produce no geometry at all are never roots", () => {
    expect(roots([node("t1", "transform"), node("v1", "value/constant")])).toEqual([]);
  });

  test("a curve node's preview geometry makes it a root", () => {
    expect(roots([node("c1", "curve/from_points")])).toEqual(["c1"]);
  });

  test("an unknown node type is ignored rather than throwing", () => {
    expect(roots([node("mystery", "not/a/real/node")])).toEqual([]);
  });

  test("geometry routed through a List Group into a Merge is owned downstream (multi-hop)", () => {
    const result = roots(
      [
        node("box1", "object/box"),
        node("box2", "object/box"),
        node("list1", "list/group"),
        node("merge1", "structure/merge"),
      ],
      [
        wire("box1", "geometry", "list1", "in0"),
        wire("box2", "geometry", "list1", "in1"),
        wire("list1", "list", "merge1", "in0"),
      ],
    );

    expect(result).toEqual(["merge1"]);
  });

  test("geometry routed through a Reroute into a Render is owned downstream (multi-hop)", () => {
    const result = roots(
      [
        node("box1", "object/box"),
        node("reroute1", "utility/reroute"),
        node("render1", "render"),
      ],
      [
        wire("box1", "geometry", "reroute1", "in"),
        wire("reroute1", "out", "render1", "geometry"),
      ],
    );

    expect(result).toEqual(["render1"]);
  });
});
