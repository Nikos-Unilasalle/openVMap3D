import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FORCE_FIELD_NODE } from "./forceField";
import { ForceFieldDescriptor } from "../particleRuntime";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "field-test" };

describe("FORCE_FIELD_NODE", () => {
  it("defaults to an attractor with the documented defaults", () => {
    const res = FORCE_FIELD_NODE.evaluate({}, FORCE_FIELD_NODE.defaultParams, CTX);
    const field = res.field as ForceFieldDescriptor;
    expect(field.type).toBe("attractor");
    expect(field.strength).toBe(2);
    expect(field.radius).toBe(0);
    expect(field.position).toEqual(new THREE.Vector3(0, 0, 0));
  });

  it("falls back to attractor for an unrecognized fieldType param", () => {
    const res = FORCE_FIELD_NODE.evaluate({}, { ...FORCE_FIELD_NODE.defaultParams, fieldType: "black-hole" }, CTX);
    expect((res.field as ForceFieldDescriptor).type).toBe("attractor");
  });

  it("reads each declared type through", () => {
    for (const type of ["attractor", "vortex", "wind", "turbulence"]) {
      const res = FORCE_FIELD_NODE.evaluate({}, { ...FORCE_FIELD_NODE.defaultParams, fieldType: type }, CTX);
      expect((res.field as ForceFieldDescriptor).type).toBe(type);
    }
  });

  it("prefers wired vector/value inputs over params", () => {
    const res = FORCE_FIELD_NODE.evaluate(
      { position: new THREE.Vector3(1, 2, 3), strength: 9 },
      { ...FORCE_FIELD_NODE.defaultParams, position: new THREE.Vector3(0, 0, 0), strength: 2 },
      CTX,
    );
    const field = res.field as ForceFieldDescriptor;
    expect(field.position).toEqual(new THREE.Vector3(1, 2, 3));
    expect(field.strength).toBe(9);
  });

  it("transforms position and axis when a matrix input is wired", () => {
    // Translation (10, 0, 0) and 90° Y rotation
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(10, 0, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)),
      new THREE.Vector3(1, 1, 1),
    );

    const res = FORCE_FIELD_NODE.evaluate(
      {
        matrix,
        position: new THREE.Vector3(0, 0, 2),
        axis: new THREE.Vector3(0, 0, 1),
      },
      FORCE_FIELD_NODE.defaultParams,
      CTX,
    );
    const field = res.field as ForceFieldDescriptor;

    // (0, 0, 2) rotated 90° about Y is (2, 0, 0), translated by (10, 0, 0) is (12, 0, 0)
    expect(field.position.x).toBeCloseTo(12, 5);
    expect(field.position.y).toBeCloseTo(0, 5);
    expect(field.position.z).toBeCloseTo(0, 5);

    // axis (0, 0, 1) rotated 90° about Y becomes (1, 0, 0)
    expect(field.axis.x).toBeCloseTo(1, 5);
    expect(field.axis.y).toBeCloseTo(0, 5);
    expect(field.axis.z).toBeCloseTo(0, 5);
  });
});
