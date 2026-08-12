import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { EvalContext } from "../types";
import { CAMERA_NODE } from "./camera";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "cam-test" };

describe("CAMERA_NODE", () => {
  test("composes location/rotation into a matrix and passes fov through", () => {
    const location = new THREE.Vector3(1, 2, 3);
    const rotation = new THREE.Vector3(0, Math.PI / 2, 0);

    const result = CAMERA_NODE.evaluate({ location, rotation, fov: 70 }, CAMERA_NODE.defaultParams, CTX);
    const matrix = result.matrix as THREE.Matrix4;

    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(1);
    expect(position.y).toBeCloseTo(2);
    expect(position.z).toBeCloseTo(3);
    expect(result.fov).toBe(70);
  });

  test("unconnected inputs default to the standard starting pose, not the origin", () => {
    const result = CAMERA_NODE.evaluate({}, CAMERA_NODE.defaultParams, CTX);
    const position = new THREE.Vector3().setFromMatrixPosition(result.matrix as THREE.Matrix4);

    expect(position.x).toBeCloseTo(3);
    expect(position.y).toBeCloseTo(3);
    expect(position.z).toBeCloseTo(5);
    expect(result.fov).toBe(50);
  });
});
