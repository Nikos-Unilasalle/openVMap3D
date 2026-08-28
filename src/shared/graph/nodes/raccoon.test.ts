import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { OBJECT_RACCOON_NODE } from "./raccoon";
import { raccoonGeometry } from "../../three/raccoonGeometry";

const CTX = { time: 0, step: 0, nodeId: "raccoon-test" } as EvalContext;

describe("raccoonGeometry", () => {
  it("decodes into a complete, finite mesh", () => {
    const geometry = raccoonGeometry();
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");

    expect(position.count).toBe(4200);
    expect(position.count % 3).toBe(0); // whole triangles
    expect(normal.count).toBe(position.count);
    expect(uv.count).toBe(position.count);

    // A truncated or mis-aligned base64 payload decodes to NaNs rather than
    // failing outright, and an all-NaN mesh renders as nothing at all.
    const values = position.array as Float32Array;
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("stands on y=0 and is centred on x/z, at roughly unit scale", () => {
    // The node's whole reason for not being a loader is that it behaves like
    // a primitive — so its origin has to be predictable, not wherever the
    // source OBJ happened to sit.
    const box = raccoonGeometry().boundingBox!;
    expect(box.min.y).toBeCloseTo(0, 3);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 3);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 3);
    const size = box.getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(2);
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.5);
  });

  it("is shared, not rebuilt per call", () => {
    expect(raccoonGeometry()).toBe(raccoonGeometry());
  });
});

describe("OBJECT_RACCOON_NODE", () => {
  it("evaluates to a mesh carrying the shared geometry", () => {
    const res = OBJECT_RACCOON_NODE.evaluate({}, OBJECT_RACCOON_NODE.defaultParams, CTX);
    const mesh = res.geometry as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.geometry).toBe(raccoonGeometry());
    expect(res.matrix).toBeInstanceOf(THREE.Matrix4);
  });

  it("reuses one mesh per node id across frames", () => {
    const a = OBJECT_RACCOON_NODE.evaluate({}, OBJECT_RACCOON_NODE.defaultParams, CTX).geometry;
    const b = OBJECT_RACCOON_NODE.evaluate({}, OBJECT_RACCOON_NODE.defaultParams, CTX).geometry;
    expect(a).toBe(b);
  });

  it("honours the standard primitive transform params", () => {
    const res = OBJECT_RACCOON_NODE.evaluate(
      {},
      { ...OBJECT_RACCOON_NODE.defaultParams, location: new THREE.Vector3(2, 0, -1) },
      { ...CTX, nodeId: "raccoon-moved" },
    );
    const mesh = res.geometry as THREE.Mesh;
    const pos = new THREE.Vector3().setFromMatrixPosition(mesh.matrix);
    expect([pos.x, pos.y, pos.z]).toEqual([2, 0, -1]);
  });
});
