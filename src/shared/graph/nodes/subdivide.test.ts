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
    // Non-indexed now that UVs are carried through per-corner (see
    // toBufferGeometryWithUV) — BoxGeometry ships UVs, so this is the path
    // taken; triangle count is position count / 3 rather than index / 3.
    expect(mesh.geometry.attributes.position.count / 3).toBeGreaterThan(originalTris);
    expect(mesh.geometry.attributes.normal).toBeDefined();
    expect(mesh.geometry.attributes.uv).toBeDefined();
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

    expect(mesh.geometry.attributes.position.count / 3).toBe(originalTris);
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

describe("SUBDIVIDE_NODE preserves UVs", () => {
  it("carries the Box's UV seams through instead of dropping them", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const srcUV = box.geometry.attributes.uv;

    // 0 levels: no vertex-point smoothing to move corners off their exact
    // source coordinates, so the box-corner lookup below finds them.
    const res = SUBDIVIDE_NODE.evaluate({ geometry: box }, { mode: "catmull-clark", levels: 0 }, CTX);
    const mesh = res.geometry as THREE.Mesh;
    const uvAttr = mesh.geometry.attributes.uv;

    expect(uvAttr).toBeDefined();
    // UV range should stay within the source's own range (0..1 for a stock
    // BoxGeometry) — a broken UV pass (e.g. accidentally zipping position-
    // welded indices against UV-welded ones) tends to produce garbage/NaN
    // values or wildly out-of-range coordinates, not just "wrong" ones.
    for (let i = 0; i < uvAttr.count; i++) {
      expect(uvAttr.getX(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(uvAttr.getX(i)).toBeLessThanOrEqual(1 + 1e-6);
      expect(uvAttr.getY(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(uvAttr.getY(i)).toBeLessThanOrEqual(1 + 1e-6);
    }

    // The seam itself: two corners at the exact same 3D position but on
    // different faces (different UV islands) must keep *different* UVs —
    // that's the whole point of welding UVs separately from position.
    const posAttr = mesh.geometry.attributes.position;
    const cornersAtVertex: number[] = [];
    for (let i = 0; i < posAttr.count; i++) {
      if (posAttr.getX(i) > 0 && posAttr.getY(i) > 0 && posAttr.getZ(i) > 0) cornersAtVertex.push(i);
    }
    expect(cornersAtVertex.length).toBeGreaterThanOrEqual(2);
    const uv0 = [uvAttr.getX(cornersAtVertex[0]), uvAttr.getY(cornersAtVertex[0])];
    const uv1 = [uvAttr.getX(cornersAtVertex[1]), uvAttr.getY(cornersAtVertex[1])];
    expect(uv0[0] !== uv1[0] || uv0[1] !== uv1[1]).toBe(true);

    expect(srcUV).toBeDefined(); // sanity: BoxGeometry does ship UVs to begin with
  });

  it("falls back to no UVs (old behavior) when the source geometry has none", () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    const mesh = new THREE.Mesh(geom);

    const res = SUBDIVIDE_NODE.evaluate({ geometry: mesh }, { mode: "simple", levels: 1 }, CTX);
    const outMesh = res.geometry as THREE.Mesh;

    expect(outMesh.geometry.attributes.uv).toBeUndefined();
    expect(outMesh.geometry.index).not.toBeNull();
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

  it("weld makes adjacent Box faces share edges — normals come out smoothed/shared, not each face's own flat normal", () => {
    // The output is intentionally non-indexed now (see toBufferGeometryWithUV
    // — UVs need each triangle corner free to differ, so the final geometry
    // can't share one index across corners with different UVs the way the
    // *internal* position weld does). So this can no longer assert on output
    // vertex *count* the way it used to; instead it asserts on the thing the
    // weld actually exists to produce: two corners that used to be
    // "different vertices, same position" (BoxGeometry gives every corner
    // its own per-face normal) come out with the *same* smoothed normal,
    // proving computeVertexNormals() ran on the welded/shared topology
    // rather than each disconnected face island.
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));

    const res = SUBDIVIDE_NODE.evaluate({ geometry: box }, { mode: "simple", levels: 0 }, CTX);
    const mesh = res.geometry as THREE.Mesh;
    const posAttr = mesh.geometry.attributes.position;
    const normalAttr = mesh.geometry.attributes.normal;

    // Find two output corners that land on the same box corner (0.5,0.5,0.5)
    // — three faces meet there, each contributing its own unwelded corner.
    const cornersAtVertex: number[] = [];
    for (let i = 0; i < posAttr.count; i++) {
      if (posAttr.getX(i) > 0 && posAttr.getY(i) > 0 && posAttr.getZ(i) > 0) cornersAtVertex.push(i);
    }
    expect(cornersAtVertex.length).toBeGreaterThanOrEqual(2);

    const n0 = new THREE.Vector3().fromBufferAttribute(normalAttr, cornersAtVertex[0]);
    const n1 = new THREE.Vector3().fromBufferAttribute(normalAttr, cornersAtVertex[1]);
    expect(n0.x).toBeCloseTo(n1.x);
    expect(n0.y).toBeCloseTo(n1.y);
    expect(n0.z).toBeCloseTo(n1.z);
    // A single face's own flat normal is axis-aligned (e.g. (1,0,0)) — the
    // welded/averaged one at a corner where 3 faces meet is not.
    expect(Math.abs(n0.x)).toBeLessThan(0.99);
  });
});
