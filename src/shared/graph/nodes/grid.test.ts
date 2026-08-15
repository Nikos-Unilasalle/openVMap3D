import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { EvalContext } from "../types";
import { GRID_NODE } from "./grid";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "grid-test" };

describe("GRID_NODE", () => {
  test("outputs a GridHelper positioned by the incoming matrix", () => {
    const matrix = new THREE.Matrix4().makeTranslation(0, -1, 0);
    const result = GRID_NODE.evaluate({ matrix }, GRID_NODE.defaultParams, CTX);
    const grid = result.geometry as THREE.GridHelper;

    expect(grid).toBeInstanceOf(THREE.GridHelper);
    expect(grid.matrixAutoUpdate).toBe(false);
    const position = new THREE.Vector3().setFromMatrixPosition(grid.matrix);
    expect(position.y).toBeCloseTo(-1);
  });

  test("the same instance is reused across frames when params don't change", () => {
    const first = GRID_NODE.evaluate({}, GRID_NODE.defaultParams, { ...CTX, nodeId: "grid-stable" }).geometry;
    const second = GRID_NODE.evaluate({}, GRID_NODE.defaultParams, { ...CTX, nodeId: "grid-stable" }).geometry;
    expect(first).toBe(second);
  });

  test("changing size rebuilds the instance instead of silently keeping the old geometry", () => {
    const first = GRID_NODE.evaluate({}, { size: 10, divisions: 10 }, { ...CTX, nodeId: "grid-resize" }).geometry;
    const second = GRID_NODE.evaluate({}, { size: 20, divisions: 10 }, { ...CTX, nodeId: "grid-resize" }).geometry;
    expect(first).not.toBe(second);
  });

  test("composes native location/rotation/scale and tags itself with nodeId", () => {
    const location = new THREE.Vector3(2, 3, 4);
    const rotation = new THREE.Vector3(0, Math.PI / 2, 0);
    const scale = new THREE.Vector3(2, 2, 2);

    const result = GRID_NODE.evaluate(
      {},
      { ...GRID_NODE.defaultParams, location, rotation, scale },
      { ...CTX, nodeId: "grid-transform" }
    );
    const grid = result.geometry as THREE.GridHelper;
    expect(grid.userData.nodeId).toBe("grid-transform");

    const pos = new THREE.Vector3().setFromMatrixPosition(grid.matrix);
    expect(pos.x).toBeCloseTo(2);
    expect(pos.y).toBeCloseTo(3);
    expect(pos.z).toBeCloseTo(4);
  });

  test("preserves live-dragged matrix during gizmo interaction", () => {
    const ctx = { ...CTX, nodeId: "grid-drag" };
    const grid = GRID_NODE.evaluate({}, GRID_NODE.defaultParams, ctx).geometry as THREE.GridHelper;
    grid.matrix.copy(new THREE.Matrix4().makeTranslation(10, 5, 2));

    const dragged = GRID_NODE.evaluate(
      {},
      GRID_NODE.defaultParams,
      { ...ctx, liveEditNodeId: "grid-drag" }
    );
    const draggedPos = new THREE.Vector3().setFromMatrixPosition((dragged.geometry as THREE.GridHelper).matrix);
    expect(draggedPos.x).toBeCloseTo(10);
    expect(draggedPos.y).toBeCloseTo(5);
    expect(draggedPos.z).toBeCloseTo(2);
  });
});
