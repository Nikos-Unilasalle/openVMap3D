import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { disposeGeometryBvh, getBoundsTree, initBvhRaycast, sampleSurfacePoints } from "./bvh";

describe("bvh", () => {
  it("builds and caches a bounds tree for a geometry", () => {
    initBvhRaycast();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const first = getBoundsTree(geo);
    expect(geo.boundsTree).toBeDefined();
    const second = getBoundsTree(geo);
    expect(second).toBe(first);
  });

  it("rebuilds the bounds tree when the position attribute changes", () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const first = getBoundsTree(geo);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    (pos.array as Float32Array)[0] += 10;
    pos.needsUpdate = true;
    const second = getBoundsTree(geo);
    expect(second).not.toBe(first);
  });

  it("disposeGeometryBvh frees the tree", () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    getBoundsTree(geo);
    expect(geo.boundsTree).toBeDefined();
    disposeGeometryBvh(geo);
    expect(geo.boundsTree).toBeFalsy();
  });

  it("samples area-weighted points + normals on a mesh surface", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    let s = 123;
    const prng = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    const { positions, normals } = sampleSurfacePoints(mesh, 100, prng);
    expect(positions.length).toBe(100);
    expect(normals.length).toBe(100);
    const box = new THREE.Box3().setFromObject(mesh);
    for (const p of positions) {
      expect(box.containsPoint(p)).toBe(true);
    }
  });
});
