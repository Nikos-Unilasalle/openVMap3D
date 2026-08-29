import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { EvalResult } from "./evaluate";
import { DEFAULT_REGISTRY } from "./nodes";
import { OBJECT_DISC_NODE, OBJECT_EMPTY_NODE } from "./nodes/object";
import { connectedSocketIds, paramPanelValues } from "./paramPanelValues";
import { Graph, NodeInstance } from "./types";

function node(id: string, type: string): NodeInstance {
  return { id, type, params: {}, position: { x: 0, y: 0 } };
}

function emptyInstance(params: Record<string, unknown> = {}): NodeInstance {
  return { id: "empty1", type: OBJECT_EMPTY_NODE.type, params, position: { x: 0, y: 0 } };
}

describe("paramPanelValues", () => {
  test("a node output never shadows the identically-named param the panel edits", () => {
    // The Empty emits a `location` output decomposed from its composed
    // matrix. The panel's Location field edits the `location` *param*, so it
    // has to display that param — otherwise the field reads one value and
    // writes another, and a keyframe taken from it captures the readout
    // instead of the setting.
    const instance = emptyInstance({ location: new THREE.Vector3(1, 2, 3) });
    const graph: Graph = { nodes: [instance], connections: [] };
    const results: EvalResult = new Map([
      ["empty1", { location: new THREE.Vector3(99, 99, 99), matrix: new THREE.Matrix4() }],
    ]);

    const values = paramPanelValues(graph, instance, OBJECT_EMPTY_NODE, results);

    expect((values.location as THREE.Vector3).x).toBe(1);
    expect((values.location as THREE.Vector3).y).toBe(2);
  });

  test("gizmo-written params show through immediately", () => {
    const instance = emptyInstance({ location: new THREE.Vector3(7, 0, -4) });
    const graph: Graph = { nodes: [instance], connections: [] };

    const values = paramPanelValues(graph, instance, OBJECT_EMPTY_NODE, null);

    expect((values.location as THREE.Vector3).x).toBe(7);
    expect((values.location as THREE.Vector3).z).toBe(-4);
  });

  test("a connected input shows the upstream value — there the param is only a dead fallback", () => {
    const instance = emptyInstance({ location: new THREE.Vector3(1, 1, 1) });
    const upstream = new THREE.Matrix4().makeTranslation(5, 5, 5);
    const graph: Graph = {
      nodes: [instance],
      connections: [
        { id: "c", fromNode: "t", fromSocket: "matrix", toNode: "empty1", toSocket: "matrix" },
      ],
    };
    const results: EvalResult = new Map([["empty1", { __evaluatedInputs: { matrix: upstream } }]]);

    const values = paramPanelValues(graph, instance, OBJECT_EMPTY_NODE, results);

    expect(values.matrix).toBe(upstream);
  });

  test("an unconnected input keeps showing its editable param, not last frame's evaluated input", () => {
    const instance = emptyInstance({ location: new THREE.Vector3(3, 3, 3) });
    const graph: Graph = { nodes: [instance], connections: [] };
    const results: EvalResult = new Map([
      ["empty1", { __evaluatedInputs: { location: new THREE.Vector3(0, 0, 0) } }],
    ]);

    const values = paramPanelValues(graph, instance, OBJECT_EMPTY_NODE, results);

    expect((values.location as THREE.Vector3).x).toBe(3);
  });

  test("outputs that are not params still show through as readouts", () => {
    const cameraDef = DEFAULT_REGISTRY.get("calibration/camera")!;
    const instance: NodeInstance = {
      id: "cam",
      type: "calibration/camera",
      params: {},
      position: { x: 0, y: 0 },
    };
    const graph: Graph = { nodes: [instance], connections: [] };
    const results: EvalResult = new Map([["cam", { error: 0.42 }]]);

    const values = paramPanelValues(graph, instance, cameraDef, results);

    expect(values.error).toBe(0.42);
  });

  test("the camera's location param is not shadowed by its evaluated input", () => {
    const cameraDef = DEFAULT_REGISTRY.get("calibration/camera")!;
    const instance: NodeInstance = {
      id: "cam",
      type: "calibration/camera",
      params: { location: new THREE.Vector3(4, 1, -2) },
      position: { x: 0, y: 0 },
    };
    const graph: Graph = { nodes: [instance], connections: [] };
    const results: EvalResult = new Map([
      ["cam", { __evaluatedInputs: { location: new THREE.Vector3(0, 0, 5) } }],
    ]);

    const values = paramPanelValues(graph, instance, cameraDef, results);

    expect((values.location as THREE.Vector3).x).toBe(4);
    expect((values.location as THREE.Vector3).z).toBe(-2);
  });

  test("defaults fill in params the instance has never set", () => {
    const instance = emptyInstance({});
    const graph: Graph = { nodes: [instance], connections: [] };

    const values = paramPanelValues(graph, instance, OBJECT_EMPTY_NODE, null);

    expect(values.scale).toBeInstanceOf(THREE.Vector3);
    expect((values.scale as THREE.Vector3).x).toBe(1);
  });

  test("shows interpolated keyframe values when keyframes exist and currentFrame is provided", () => {
    const instance = emptyInstance({ rotation: new THREE.Vector3(0, 0, 0) });
    const graph: Graph = {
      nodes: [instance],
      connections: [],
      keyframes: {
        empty1: {
          "rotation.x": [
            { frame: 0, value: 0 },
            { frame: 100, value: 180 },
          ],
        },
      },
    };

    // At frame 50 -> rotation.x should be 90 (midpoint)
    const values = paramPanelValues(graph, instance, OBJECT_EMPTY_NODE, null, 50);
    expect(values.rotation).toBeInstanceOf(THREE.Vector3);
    expect((values.rotation as THREE.Vector3).x).toBeCloseTo(90);
  });
});

describe("connectedSocketIds", () => {
  test("lists the sockets of this node that have a wire in them", () => {
    const graph: Graph = {
      nodes: [node("a", "value/constant"), node("b", "canvas/goto")],
      connections: [
        { id: "c1", fromNode: "a", fromSocket: "out", toNode: "b", toSocket: "canvas" },
        { id: "c2", fromNode: "a", fromSocket: "out", toNode: "b", toSocket: "trigger" },
      ],
    };

    expect(connectedSocketIds(graph, "b")).toEqual(new Set(["canvas", "trigger"]));
  });

  test("a wire out of the node doesn't count — only what drives it", () => {
    const graph: Graph = {
      nodes: [node("a", "canvas/goto"), node("b", "value/constant")],
      connections: [{ id: "c1", fromNode: "a", fromSocket: "switched", toNode: "b", toSocket: "value" }],
    };

    expect(connectedSocketIds(graph, "a")).toEqual(new Set());
  });

  test("a node with nothing plugged in has no driven params", () => {
    const graph: Graph = { nodes: [node("a", "canvas/goto")], connections: [] };

    expect(connectedSocketIds(graph, "a")).toEqual(new Set());
  });
});

describe("paramPanelValues — scalar angle sockets", () => {
  // The panel converts on the way out (toDisplayUnit: radians -> degrees), so
  // everything paramPanelValues hands it must be in stored units. A scalar
  // angle wire is in degrees (degreesInput), so it has to be converted back
  // here — without it the panel converted a second time and a wired 36 read
  // as 2063.
  function discWired(wired: number) {
    const instance: NodeInstance = { id: "disc1", type: OBJECT_DISC_NODE.type, params: {}, position: { x: 0, y: 0 } };
    const source = node("v1", "value/constant");
    const graph: Graph = {
      nodes: [instance, source],
      connections: [{ id: "c", fromNode: "v1", fromSocket: "out", toNode: "disc1", toSocket: "arcAngle" }],
    };
    const results: EvalResult = new Map([["disc1", { __evaluatedInputs: { arcAngle: wired } }]]);
    return paramPanelValues(graph, instance, OBJECT_DISC_NODE, results);
  }

  test("a wired 36 is stored as 36 degrees' worth of radians, so the panel shows 36", () => {
    const values = discWired(36);
    expect(values.arcAngle as number).toBeCloseTo((36 * Math.PI) / 180, 6);
  });

  test("a wired 360 reads back as a full turn", () => {
    expect(discWired(360).arcAngle as number).toBeCloseTo(Math.PI * 2, 6);
  });

  test("a vector rotation socket is left in radians — it carries a rotation between nodes", () => {
    const instance: NodeInstance = { id: "t1", type: "transform", params: {}, position: { x: 0, y: 0 } };
    const source = node("r1", "physics/rolling");
    const graph: Graph = {
      nodes: [instance, source],
      connections: [{ id: "c", fromNode: "r1", fromSocket: "rotation", toNode: "t1", toSocket: "rotation" }],
    };
    const rot = new THREE.Vector3(Math.PI / 2, 0, 0);
    const results: EvalResult = new Map([["t1", { __evaluatedInputs: { rotation: rot } }]]);
    const def = DEFAULT_REGISTRY.get("transform")!;
    const values = paramPanelValues(graph, instance, def, results);
    expect(values.rotation).toBe(rot);
  });
});
