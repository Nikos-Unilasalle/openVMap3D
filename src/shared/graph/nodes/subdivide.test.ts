import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { SUBDIVIDE_NODE } from "./subdivide";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "subdivide-test" };

describe("SUBDIVIDE_NODE", () => {
  it("subdivides a box (catmull-clark) into a smoother, denser mesh", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const originalTris = box.geometry.index!.count / 3;

    const res = SUBDIVIDE_NODE.evaluate(
      { geometry: box },
      { mode: "catmull-clark", levels: 1 },
      CTX,
    );

    const mesh = res.geometry as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.geometry.index!.count / 3).toBeGreaterThan(originalTris);
    expect(mesh.geometry.attributes.normal).toBeDefined();
  });

  it("simple mode never moves a vertex, just densifies", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));

    const res = SUBDIVIDE_NODE.evaluate({ geometry: box }, { mode: "simple", levels: 1 }, CTX);
    const mesh = res.geometry as THREE.Mesh;

    mesh.geometry.computeBoundingBox();
    const box3 = mesh.geometry.boundingBox!;
    expect(box3.max.x).toBeCloseTo(1);
    expect(box3.min.x).toBeCloseTo(-1);
  });

  it("0 levels passes the geometry through unchanged (still triangulated the same way)", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const originalTris = box.geometry.index!.count / 3;

    const res = SUBDIVIDE_NODE.evaluate({ geometry: box }, { mode: "simple", levels: 0 }, CTX);
    const mesh = res.geometry as THREE.Mesh;

    expect(mesh.geometry.index!.count / 3).toBe(originalTris);
  });

  it("returns the input untouched when nothing is wired in", () => {
    const res = SUBDIVIDE_NODE.evaluate({}, SUBDIVIDE_NODE.defaultParams, CTX);
    expect(res.geometry).toBeNull();
  });

  it("carries the source mesh's transform through unchanged", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.matrixAutoUpdate = false;
    box.matrix.compose(new THREE.Vector3(3, 4, 5), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));

    const res = SUBDIVIDE_NODE.evaluate({ geometry: box }, { mode: "simple", levels: 1 }, CTX);
    const mesh = res.geometry as THREE.Mesh;
    const pos = new THREE.Vector3().setFromMatrixPosition(mesh.matrix);
    expect(pos.x).toBeCloseTo(3);
    expect(pos.z).toBeCloseTo(5);
  });

  it("keeps tracking the source's pose across calls even when the topology cache hits (regression: animation upstream used to freeze)", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.matrixAutoUpdate = false;
    box.matrix.setPosition(0, 0, 0);

    const ctx: EvalContext = { time: 0, step: 0, nodeId: "subdivide-pose-test" };
    const first = SUBDIVIDE_NODE.evaluate({ geometry: box }, { mode: "simple", levels: 1 }, ctx);
    const firstMesh = first.geometry as THREE.Mesh;
    expect(new THREE.Vector3().setFromMatrixPosition(firstMesh.matrix).x).toBeCloseTo(0);

    // Same geometry (same vertex/index counts) -> hits the cached mesh, but
    // the source's matrix moved since, same as an upstream Time-driven
    // animation would move it frame to frame without changing topology.
    box.matrix.setPosition(7, 0, 0);
    const second = SUBDIVIDE_NODE.evaluate({ geometry: box }, { mode: "simple", levels: 1 }, ctx);
    const secondMesh = second.geometry as THREE.Mesh;
    expect(secondMesh).toBe(firstMesh);
    expect(new THREE.Vector3().setFromMatrixPosition(secondMesh.matrix).x).toBeCloseTo(7);
  });
});

describe("SUBDIVIDE_NODE on unwelded primitives (Box, Disc, ...)", () => {
  /**
   * BoxGeometry gives each corner 3 separate position entries (one per
   * face, so each can carry its own normal) — same coordinates, different
   * vertex indices. Reported bug: Catmull-Clark on a Box produced a
   * twisted, saddle-shaped result instead of a rounded cube, because each
   * face was subdivided as its own disconnected island.
   */
  it("catmull-clark on a Box stays inside the Box's own bounds — no warping past the corners", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));

    const res = SUBDIVIDE_NODE.evaluate({ geometry: box }, { mode: "catmull-clark", levels: 2 }, CTX);
    const mesh = res.geometry as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox!;

    // A rounding subdivision only ever pulls vertices *inward* from the
    // source's flat faces — never past them. The saddle-twist bug pushed
    // face centres outward past x=±1 while corners collapsed inward, which
    // this bounding-box check catches directly.
    expect(b.max.x).toBeLessThanOrEqual(1 + 1e-6);
    expect(b.min.x).toBeGreaterThanOrEqual(-1 - 1e-6);
    expect(b.max.y).toBeLessThanOrEqual(1 + 1e-6);
    expect(b.min.y).toBeGreaterThanOrEqual(-1 - 1e-6);
  });

  it("weld makes adjacent Box faces share edges — an interior vertex has a full ring, not two isolated corners", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const before = box.geometry.attributes.position.count; // 24: unwelded, 4 per face × 6 faces

    const res = SUBDIVIDE_NODE.evaluate({ geometry: box }, { mode: "simple", levels: 0 }, CTX);
    const mesh = res.geometry as THREE.Mesh;

    // Welded, a cube has 8 corners + 12 edge midpoints... but at 0 levels
    // there's no subdivision yet, so this should simply be the welded
    // vertex count: 8 corners, each now a single shared vertex.
    expect(mesh.geometry.attributes.position.count).toBeLessThan(before);
    expect(mesh.geometry.attributes.position.count).toBe(8);
  });
});
