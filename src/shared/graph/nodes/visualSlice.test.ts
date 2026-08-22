import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { VISUAL_SLICE_NODE } from "./visualSlice";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "slice-test" };

describe("VISUAL_SLICE_NODE", () => {
  it("assigns a clipping plane to every mesh material in the subtree", () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const group = new THREE.Group();
    group.add(meshA, meshB);

    VISUAL_SLICE_NODE.evaluate(
      { geometry: group, point: new THREE.Vector3(0, 0, 0), direction: new THREE.Vector3(0, 1, 0) },
      VISUAL_SLICE_NODE.defaultParams,
      CTX,
    );

    expect(meshA.material.clippingPlanes).toHaveLength(1);
    expect(meshB.material.clippingPlanes).toHaveLength(1);
    expect(meshA.material.clippingPlanes![0].normal.y).toBeCloseTo(1);
  });

  it("invert flips the plane normal", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    VISUAL_SLICE_NODE.evaluate(
      { geometry: mesh, point: new THREE.Vector3(0, 0, 0), direction: new THREE.Vector3(0, 1, 0) },
      { ...VISUAL_SLICE_NODE.defaultParams, invert: 1 },
      CTX,
    );
    expect(mesh.material.clippingPlanes![0].normal.y).toBeCloseTo(-1);
  });

  it("falls back to the default normal when a degenerate zero vector is given", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    VISUAL_SLICE_NODE.evaluate(
      { geometry: mesh, point: new THREE.Vector3(0, 0, 0), direction: new THREE.Vector3(0, 0, 0) },
      VISUAL_SLICE_NODE.defaultParams,
      CTX,
    );
    const n = mesh.material.clippingPlanes![0].normal;
    expect(n.length()).toBeCloseTo(1);
  });

  it("plane sits at the given point along the given normal", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    VISUAL_SLICE_NODE.evaluate(
      { geometry: mesh, point: new THREE.Vector3(0, 2.5, 0), direction: new THREE.Vector3(0, 1, 0) },
      VISUAL_SLICE_NODE.defaultParams,
      CTX,
    );
    const plane = mesh.material.clippingPlanes![0];
    expect(plane.distanceToPoint(new THREE.Vector3(0, 2.5, 0))).toBeCloseTo(0);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 10, 0))).toBeGreaterThan(0);
    expect(plane.distanceToPoint(new THREE.Vector3(0, -10, 0))).toBeLessThan(0);
  });

  it("turns on renderer.localClippingEnabled when a renderer is present", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const fakeRenderer = { localClippingEnabled: false } as unknown as THREE.WebGLRenderer;
    VISUAL_SLICE_NODE.evaluate(
      { geometry: mesh },
      VISUAL_SLICE_NODE.defaultParams,
      { ...CTX, renderer: fakeRenderer },
    );
    expect(fakeRenderer.localClippingEnabled).toBe(true);
  });

  it("passes through null when nothing is wired", () => {
    const res = VISUAL_SLICE_NODE.evaluate({}, VISUAL_SLICE_NODE.defaultParams, CTX);
    expect(res.geometry).toBeNull();
  });
});
