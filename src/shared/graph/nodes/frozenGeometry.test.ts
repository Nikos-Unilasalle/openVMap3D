import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { OBJECT_FROZEN_NODE } from "./frozenGeometry";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "frozen-test" };

const TRIANGLE = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] };

describe("OBJECT_FROZEN_NODE", () => {
  it("builds a real mesh from plain position arrays", () => {
    const res = OBJECT_FROZEN_NODE.evaluate({}, { ...OBJECT_FROZEN_NODE.defaultParams, ...TRIANGLE }, CTX);
    const mesh = res.geometry as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.geometry.getAttribute("position").count).toBe(3);
  });

  it("defaults to single-sided, matching every other primitive's own default", () => {
    const res = OBJECT_FROZEN_NODE.evaluate({}, { ...OBJECT_FROZEN_NODE.defaultParams, ...TRIANGLE }, { ...CTX, nodeId: "frozen-1side" });
    const mesh = res.geometry as THREE.Mesh;
    expect((mesh.material as THREE.Material).side).toBe(THREE.FrontSide);
  });

  it("goes double-sided when asked, for a source that was two-sided (e.g. a glTF leaf/cloth panel)", () => {
    const res = OBJECT_FROZEN_NODE.evaluate(
      {},
      { ...OBJECT_FROZEN_NODE.defaultParams, ...TRIANGLE, doubleSided: 1 },
      { ...CTX, nodeId: "frozen-2side" },
    );
    const mesh = res.geometry as THREE.Mesh;
    expect((mesh.material as THREE.Material).side).toBe(THREE.DoubleSide);
  });

  it("switches side on an existing mesh when the param changes, not just at creation", () => {
    const ctx = { ...CTX, nodeId: "frozen-switch" };
    const params = { ...OBJECT_FROZEN_NODE.defaultParams, ...TRIANGLE };

    const first = OBJECT_FROZEN_NODE.evaluate({}, params, ctx).geometry as THREE.Mesh;
    expect((first.material as THREE.Material).side).toBe(THREE.FrontSide);

    const second = OBJECT_FROZEN_NODE.evaluate({}, { ...params, doubleSided: 1 }, ctx).geometry as THREE.Mesh;
    expect(second).toBe(first); // same mesh, geometry untouched
    expect((second.material as THREE.Material).side).toBe(THREE.DoubleSide);
  });
});
