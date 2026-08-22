import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { SHADE_NODE } from "./shade";

const CTX = (nodeId: string): EvalContext => ({ time: 0, step: 0, nodeId });

const cornerNormal = (normals: THREE.BufferAttribute, i: number) => new THREE.Vector3(normals.getX(i), normals.getY(i), normals.getZ(i));

/** Welds by position, mirroring the node's own weld — for asserting "no spurious splits". */
function uniquePositionCount(geo: THREE.BufferGeometry): number {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const keys = new Set<string>();
  for (let i = 0; i < pos.count; i++) keys.add(`${Math.round(pos.getX(i) * 10000)}:${Math.round(pos.getY(i) * 10000)}:${Math.round(pos.getZ(i) * 10000)}`);
  return keys.size;
}

describe("SHADE_NODE — smooth", () => {
  it("averages a Box's hard corners into non-axis-aligned normals (Box is unwelded: 3 indices per corner)", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = SHADE_NODE.evaluate({ geometry: box }, { mode: "smooth" }, CTX("shade-smooth-box"));
    const mesh = res.geometry as THREE.Mesh;

    // Unwelded vertex/index layout is preserved; only normals are replaced.
    expect(mesh.geometry.attributes.position.count).toBe(box.geometry.attributes.position.count);
    expect(mesh.geometry.index!.count).toBe(box.geometry.index!.count);

    // A smoothed cube corner averages the faces meeting there, so no axis is
    // left at ~0 the way a face normal would be (three's triangle-weighted
    // average gives (1,1,2)/√6 rather than the ideal (1,1,1)/√3 — the quad
    // diagonal puts the corner on both of a face's triangles).
    const normals = mesh.geometry.attributes.normal as THREE.BufferAttribute;
    const corner = cornerNormal(normals, 0);
    expect(Math.abs(corner.x)).toBeGreaterThan(0.3);
    expect(Math.abs(corner.y)).toBeGreaterThan(0.3);
    expect(Math.abs(corner.z)).toBeGreaterThan(0.3);
  });

  it("keeps an already-smooth sphere untouched (welded mesh, weld is a no-op)", () => {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12));
    const res = SHADE_NODE.evaluate({ geometry: sphere }, { mode: "smooth" }, CTX("shade-smooth-sphere"));
    const mesh = res.geometry as THREE.Mesh;
    expect(mesh.geometry.attributes.position.count).toBe(sphere.geometry.attributes.position.count);
  });
});

describe("SHADE_NODE — flat", () => {
  it("splits a Box into an unindexed soup where every triangle is flat", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = SHADE_NODE.evaluate({ geometry: box }, { mode: "flat" }, CTX("shade-flat-box"));
    const mesh = res.geometry as THREE.Mesh;

    expect(mesh.geometry.index).toBeNull();
    expect(mesh.geometry.attributes.position.count).toBe(box.geometry.index!.count); // 36 = 12 tris × 3
    const normals = mesh.geometry.attributes.normal as THREE.BufferAttribute;
    for (let f = 0; f < normals.count / 3; f++) {
      const a = cornerNormal(normals, f * 3);
      const b = cornerNormal(normals, f * 3 + 1);
      const c = cornerNormal(normals, f * 3 + 2);
      expect(a.angleTo(b)).toBeLessThan(1e-6);
      expect(a.angleTo(c)).toBeLessThan(1e-6);
    }
  });
});

describe("SHADE_NODE — auto smooth", () => {
  it("keeps a Box hard at 30° (90° edges > threshold): per-face flat normals", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = SHADE_NODE.evaluate({ geometry: box }, { mode: "auto", autoAngle: 30 }, CTX("shade-auto-box30"));
    const mesh = res.geometry as THREE.Mesh;
    const normals = mesh.geometry.attributes.normal as THREE.BufferAttribute;

    // Every face is its own smoothing group -> all normals axis-aligned.
    for (let i = 0; i < normals.count; i++) {
      const n = cornerNormal(normals, i);
      expect(Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z))).toBeCloseTo(1, 5);
    }
  });

  it("welds everything at 179°: a Box becomes a smooth 8-corner cube with averaged normals", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = SHADE_NODE.evaluate({ geometry: box }, { mode: "auto", autoAngle: 179 }, CTX("shade-auto-box179"));
    const mesh = res.geometry as THREE.Mesh;

    // One smoothed vertex per corner position (each corner welded to a single
    // smoothing group).
    expect(mesh.geometry.attributes.position.count).toBe(8);
    const normals = mesh.geometry.attributes.normal as THREE.BufferAttribute;
    const n = cornerNormal(normals, 0);
    expect(Math.abs(n.x)).toBeGreaterThan(0.3);
    expect(Math.abs(n.y)).toBeGreaterThan(0.3);
    expect(Math.abs(n.z)).toBeGreaterThan(0.3);
  });

  it("leaves a smooth sphere's surface welded (no spurious splits below the threshold)", () => {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12));
    const res = SHADE_NODE.evaluate({ geometry: sphere }, { mode: "auto", autoAngle: 30 }, CTX("shade-auto-sphere"));
    const mesh = res.geometry as THREE.Mesh;

    // The sphere has no hard edges, so every smoothing group is the whole
    // surface: the output is one vertex per welded position (poles and the UV
    // seam collapse into their unique places), never more.
    expect(mesh.geometry.attributes.position.count).toBe(uniquePositionCount(sphere.geometry));
  });

  it("keeps a valid triangle index — the split must reference in-bounds vertices (regression: auto destroyed the mesh by dropping its index)", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const srcTris = box.geometry.index!.count / 3;

    const res = SHADE_NODE.evaluate({ geometry: box }, { mode: "auto", autoAngle: 30 }, CTX("shade-auto-index"));
    const out = (res.geometry as THREE.Mesh).geometry;

    expect(out.index).not.toBeNull();
    expect(out.index!.count / 3).toBe(srcTris); // same 12 triangles, just re-split
    for (let i = 0; i < out.index!.count; i++) {
      expect(out.index!.getX(i)).toBeGreaterThanOrEqual(0);
      expect(out.index!.getX(i)).toBeLessThan(out.attributes.position.count);
    }
  });
});

describe("SHADE_NODE — plumbing", () => {
  it("returns null geometry when nothing is wired in", () => {
    const res = SHADE_NODE.evaluate({}, SHADE_NODE.defaultParams, CTX("shade-empty"));
    expect(res.geometry).toBeNull();
  });

  it("passes through a Group's mesh (findFirstMesh) and reports its matrix", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.matrixAutoUpdate = false;
    box.matrix.setPosition(3, 4, 5);
    const group = new THREE.Group();
    group.add(box);

    const res = SHADE_NODE.evaluate({ geometry: group }, { mode: "flat" }, CTX("shade-group"));
    const mesh = res.geometry as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh).not.toBe(box); // reshaped copy, not the source
    const pos = new THREE.Vector3().setFromMatrixPosition(mesh.matrix);
    expect(pos.x).toBeCloseTo(3);
    expect(pos.z).toBeCloseTo(5);
  });

  it("reads pose through a posed wrapper group, not just the mesh's own (identity) local matrix — the OBJ Model case", () => {
    // OBJ Model bakes its Location/Rotation/Scale/Pivot onto a wrapper Group
    // around the parsed mesh, leaving the mesh's own .matrix at identity —
    // reading srcMesh.matrix directly (instead of matrixWorld) silently
    // dropped the object back to the origin, which is exactly what made a
    // repositioned/rescaled OBJ "disappear" once Shade sat between it and
    // Render.
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); // matrix stays identity
    const wrapper = new THREE.Group();
    wrapper.matrixAutoUpdate = false;
    wrapper.matrix.compose(
      new THREE.Vector3(10, -2, 7),
      new THREE.Quaternion(),
      new THREE.Vector3(0.05, 0.05, 0.05), // a drastically rescaled import, e.g.
    );
    wrapper.add(mesh);

    const res = SHADE_NODE.evaluate({ geometry: wrapper }, { mode: "flat" }, CTX("shade-obj-wrapper"));
    const outMesh = res.geometry as THREE.Mesh;
    const pos = new THREE.Vector3().setFromMatrixPosition(outMesh.matrix);
    const scale = new THREE.Vector3().setFromMatrixScale(outMesh.matrix);
    expect(pos.x).toBeCloseTo(10);
    expect(pos.y).toBeCloseTo(-2);
    expect(pos.z).toBeCloseTo(7);
    expect(scale.x).toBeCloseTo(0.05);
  });

  it("forces matrixAutoUpdate off even when the source mesh defaults it true (a raw OBJLoader mesh does)", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    expect(mesh.matrixAutoUpdate).toBe(true); // three's own default — OBJLoader never touches it
    const wrapper = new THREE.Group();
    wrapper.matrixAutoUpdate = false;
    wrapper.matrix.setPosition(1, 2, 3);
    wrapper.add(mesh);

    const res = SHADE_NODE.evaluate({ geometry: wrapper }, { mode: "flat" }, CTX("shade-autoupdate"));
    const outMesh = res.geometry as THREE.Mesh;
    expect(outMesh.matrixAutoUpdate).toBe(false);
  });

  it("keeps tracking the source's pose across calls when the cache hits (animation upstream stays live)", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.matrixAutoUpdate = false;
    box.matrix.setPosition(0, 0, 0);
    const ctx = CTX("shade-pose");

    const first = SHADE_NODE.evaluate({ geometry: box }, { mode: "flat" }, ctx);
    const firstMesh = first.geometry as THREE.Mesh;

    box.matrix.setPosition(7, 0, 0);
    const second = SHADE_NODE.evaluate({ geometry: box }, { mode: "flat" }, ctx);
    const secondMesh = second.geometry as THREE.Mesh;
    expect(secondMesh).toBe(firstMesh); // cache hit, same object
    expect(new THREE.Vector3().setFromMatrixPosition(secondMesh.matrix).x).toBeCloseTo(7);
  });

  it("rebuilds when the mode changes, not just on first evaluation", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const ctx = CTX("shade-rebuild");

    const flat = SHADE_NODE.evaluate({ geometry: box }, { mode: "flat" }, ctx);
    expect((flat.geometry as THREE.Mesh).geometry.index).toBeNull();

    const smooth = SHADE_NODE.evaluate({ geometry: box }, { mode: "smooth" }, ctx);
    expect((smooth.geometry as THREE.Mesh).geometry.index).not.toBeNull();
  });
});
