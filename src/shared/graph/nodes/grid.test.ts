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
});
