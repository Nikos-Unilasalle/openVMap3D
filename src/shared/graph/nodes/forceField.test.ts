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
});
