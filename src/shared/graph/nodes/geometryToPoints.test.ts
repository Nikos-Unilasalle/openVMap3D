import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { GEOMETRY_TO_POINTS_NODE } from "./geometryToPoints";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "geom-to-points-test" };

describe("GEOMETRY_TO_POINTS_NODE", () => {
  it("returns empty lists with nothing wired", () => {
    const res = GEOMETRY_TO_POINTS_NODE.evaluate({}, GEOMETRY_TO_POINTS_NODE.defaultParams, CTX);
    expect(res.xValues).toEqual([]);
    expect(res.yValues).toEqual([]);
    expect(res.zValues).toEqual([]);
    expect(res.count).toBe(0);
  });

  it("extracts every vertex of a simple mesh under Max Points", () => {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1); // 4 vertices
    const mesh = new THREE.Mesh(geometry);
    const res = GEOMETRY_TO_POINTS_NODE.evaluate({ geometry: mesh }, { maxPoints: 2000 }, CTX);
    expect(res.count).toBe(4);
    expect((res.xValues as number[]).length).toBe(4);
    expect((res.yValues as number[]).length).toBe(4);
    expect((res.zValues as number[]).length).toBe(4);
  });

  it("applies the mesh's world transform, not local coordinates", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1); // centered at local origin
    const mesh = new THREE.Mesh(geometry);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.makeTranslation(10, 0, 0);
    const res = GEOMETRY_TO_POINTS_NODE.evaluate({ geometry: mesh }, { maxPoints: 2000 }, CTX);
    const xValues = res.xValues as number[];
    // Every extracted x should sit around 10 (box half-size 0.5), not 0.
    for (const x of xValues) expect(Math.abs(x - 10)).toBeLessThanOrEqual(0.5 + 1e-6);
  });

  it("downsamples by even stride, not a truncated prefix, past Max Points", () => {
    const geometry = new THREE.SphereGeometry(1, 32, 32); // many vertices
    const mesh = new THREE.Mesh(geometry);
    const fullCount = geometry.attributes.position.count;
    expect(fullCount).toBeGreaterThan(50);

    const res = GEOMETRY_TO_POINTS_NODE.evaluate({ geometry: mesh }, { maxPoints: 50 }, CTX);
    expect(res.count).toBe(50);
    // A pure prefix-truncation would only ever sample the geometry's first
    // "ring" of vertices, all clustered near one pole — an even stride
    // instead spans a wide range of y (latitude) values across the sphere.
    const yValues = res.yValues as number[];
    const spread = Math.max(...yValues) - Math.min(...yValues);
    expect(spread).toBeGreaterThan(1);
  });

  it("skips objects with no mesh children rather than throwing", () => {
    const empty = new THREE.Group();
    const res = GEOMETRY_TO_POINTS_NODE.evaluate({ geometry: empty }, { maxPoints: 2000 }, CTX);
    expect(res.count).toBe(0);
  });

  it("extracts vertices from a THREE.Points source (a Point Cloud/PLY import) — the actual bridge into particles", () => {
    // Regression test: a PLY/Point Cloud import hands the graph a
    // THREE.Points, not a THREE.Mesh — the ONLY node that turns geometry
    // into the x/y/z-list world Particle Emitter (From Points) reads was
    // silently returning zero points for exactly this source, with nothing
    // to say why. This is the one path a point cloud has into particles.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 2, 3, 4, 5, 6]), 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial());

    const res = GEOMETRY_TO_POINTS_NODE.evaluate({ geometry: points }, { maxPoints: 2000 }, CTX);
    expect(res.count).toBe(3);
    expect(res.xValues).toEqual([0, 1, 4]);
    expect(res.yValues).toEqual([0, 2, 5]);
    expect(res.zValues).toEqual([0, 3, 6]);
  });

  it("applies a Points object's own world transform too", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial());
    points.matrixAutoUpdate = false;
    points.matrix.makeTranslation(10, 20, 30);

    const res = GEOMETRY_TO_POINTS_NODE.evaluate({ geometry: points }, { maxPoints: 2000 }, CTX);
    expect(res.xValues).toEqual([10]);
    expect(res.yValues).toEqual([20]);
    expect(res.zValues).toEqual([30]);
  });
});
