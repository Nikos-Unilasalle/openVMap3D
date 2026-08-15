import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { evaluateGraph } from "../evaluate";
import { createRegistry, EvalContext } from "../types";
import { MERGE_NODE } from "./merge";
import { OBJECT_BOX_NODE } from "./object";
import { RENDER_NODE } from "./render";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "test" };

describe("MERGE_NODE", () => {
  test("combines connected geometry inputs into one Group", () => {
    const a = new THREE.Object3D();
    const b = new THREE.Object3D();
    const result = MERGE_NODE.evaluate({ in0: a, in1: b }, {}, CTX).geometry as THREE.Group;

    expect(result).toBeInstanceOf(THREE.Group);
    expect(result.children).toEqual([a, b]);
  });

  test("an empty trailing socket (undefined) contributes nothing", () => {
    const a = new THREE.Object3D();
    const result = MERGE_NODE.evaluate({ in0: a, in1: undefined }, {}, CTX).geometry as THREE.Group;

    expect(result.children).toEqual([a]);
  });

  test("re-evaluating drops an input that's no longer connected — the group isn't a one-way accumulator", () => {
    const a = new THREE.Object3D();
    const b = new THREE.Object3D();
    MERGE_NODE.evaluate({ in0: a, in1: b }, {}, CTX);
    const result = MERGE_NODE.evaluate({ in0: a }, {}, CTX).geometry as THREE.Group;

    expect(result.children).toEqual([a]);
  });

  test("dynamicInputs always offers exactly one socket past the last connected one", () => {
    // "visible" leads every geometry node's inputs (see evaluate.ts) — the
    // growing In N sockets follow it.
    expect(MERGE_NODE.dynamicInputs?.([]).map((s) => s.id)).toEqual(["visible", "in0"]);
    expect(
      MERGE_NODE.dynamicInputs?.([
        { id: "c0", fromNode: "box", fromSocket: "geometry", toNode: "merge", toSocket: "in0" },
      ]).map((s) => s.id),
    ).toEqual(["visible", "in0", "in1"]);
  });

  test("end to end through evaluateGraph: two Box nodes into Merge into Render both survive", () => {
    const registry = createRegistry([OBJECT_BOX_NODE, MERGE_NODE, RENDER_NODE]);
    const graph = {
      nodes: [
        { id: "boxA", type: "object/box", params: {}, position: { x: 0, y: 0 } },
        { id: "boxB", type: "object/box", params: {}, position: { x: 0, y: 0 } },
        { id: "merge", type: "structure/merge", params: {}, position: { x: 0, y: 0 } },
        { id: "output", type: "render", params: {}, position: { x: 0, y: 0 } },
      ],
      connections: [
        { id: "e1", fromNode: "boxA", fromSocket: "geometry", toNode: "merge", toSocket: "in0" },
        { id: "e2", fromNode: "boxB", fromSocket: "geometry", toNode: "merge", toSocket: "in1" },
        { id: "e3", fromNode: "merge", fromSocket: "geometry", toNode: "output", toSocket: "geometry" },
      ],
    };

    const result = evaluateGraph(graph, registry, CTX);
    const group = result.get("output")?.geometry as THREE.Group;

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children).toHaveLength(2);
  });
});
