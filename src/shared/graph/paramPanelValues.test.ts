import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { EvalResult } from "./evaluate";
import { DEFAULT_REGISTRY } from "./nodes";
import { OBJECT_EMPTY_NODE } from "./nodes/object";
import { paramPanelValues } from "./paramPanelValues";
import { Graph, NodeInstance } from "./types";

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
});
