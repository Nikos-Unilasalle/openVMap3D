import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { writePointsToMesh } from "./pointsGeometry";
import { SHADE_NODE } from "./shade";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "shading-test" };

function wrap(mesh: THREE.Mesh): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

/**
 * Every vertex moved by the same offset. A pure translation doesn't change
 * the surface at all, so correctly recomputed normals must come back
 * *identical* to the source's — which makes this a direct, mode-agnostic
 * assertion that the shading survived, with no need to characterize what
 * "smooth" or "flat" should look like numerically.
 */
function translatedPoints(geom: THREE.BufferGeometry, dx: number): THREE.Vector3[] {
  const pos = geom.attributes.position;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    pts.push(new THREE.Vector3(pos.getX(i) + dx, pos.getY(i), pos.getZ(i)));
  }
  return pts;
}

/** Largest angular disagreement between two normal buffers, in degrees. */
function maxNormalDeviationDeg(a: THREE.BufferGeometry, b: THREE.BufferGeometry): number {
  const na = a.attributes.normal;
  const nb = b.attributes.normal;
  expect(na.count).toBe(nb.count);
  let worst = 0;
  for (let i = 0; i < na.count; i++) {
    const dot = na.getX(i) * nb.getX(i) + na.getY(i) * nb.getY(i) + na.getZ(i) * nb.getZ(i);
    worst = Math.max(worst, THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.max(-1, dot)))));
  }
  return worst;
}

function shade(mode: string, geometry: THREE.Object3D, nodeId: string): THREE.Mesh {
  const res = SHADE_NODE.evaluate({ geometry }, { ...SHADE_NODE.defaultParams, mode }, { ...CTX, nodeId });
  return res.geometry as THREE.Mesh;
}

describe("writePointsToMesh — shading survives a deform", () => {
  for (const mode of ["smooth", "flat", "auto"]) {
    it(`${mode} shading is preserved (a translated mesh keeps exactly its own normals)`, () => {
      const src = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 20));
      const shaded = shade(mode, wrap(src), `sh-${mode}`);

      const out = writePointsToMesh(`w-${mode}`, wrap(shaded), translatedPoints(shaded.geometry, 3), "test") as THREE.Mesh;

      expect(maxNormalDeviationDeg(shaded.geometry, out.geometry)).toBeLessThan(1);
    });
  }

  it("the three modes really do produce different normals — the checks above aren't vacuous", () => {
    const make = () => new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 20));
    const smooth = shade("smooth", wrap(make()), "cmp-smooth");
    const flat = shade("flat", wrap(make()), "cmp-flat");

    // Same vertex count (Shade splits per mode), so if these two agreed the
    // preservation assertions would prove nothing.
    if (smooth.geometry.attributes.normal.count === flat.geometry.attributes.normal.count) {
      expect(maxNormalDeviationDeg(smooth.geometry, flat.geometry)).toBeGreaterThan(5);
    } else {
      expect(smooth.geometry.attributes.normal.count).not.toBe(flat.geometry.attributes.normal.count);
    }
  });

  it("a smooth mesh does NOT come back flat — the actual reported bug", () => {
    // A smooth-shaded sphere's coincident corners share one averaged normal.
    // computeVertexNormals() on this (non-indexed after Shade) geometry gives
    // every triangle its own face normal instead, which is the flat look the
    // user saw. Adjacent corners of one triangle must therefore still differ
    // from each other's face normal.
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12));
    const shaded = shade("smooth", wrap(sphere), "bug-smooth");
    const out = writePointsToMesh("w-bug", wrap(shaded), translatedPoints(shaded.geometry, 2), "test") as THREE.Mesh;

    const n = out.geometry.attributes.normal;
    const p = out.geometry.attributes.position;
    // On a sphere, a vertex's smooth normal points away from the centre.
    // (Centre is at x=2 after the translation.)
    let worst = 0;
    for (let i = 0; i < n.count; i++) {
      const rx = p.getX(i) - 2, ry = p.getY(i), rz = p.getZ(i);
      const len = Math.hypot(rx, ry, rz);
      if (len < 1e-6) continue;
      const dot = (n.getX(i) * rx + n.getY(i) * ry + n.getZ(i) * rz) / len;
      worst = Math.max(worst, THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.max(-1, dot)))));
    }
    // Smooth normals are radial. Flat (per-face) normals on a 16x12 sphere
    // deviate from radial by well over 10 degrees at the poles.
    expect(worst).toBeLessThan(10);
  });

  it("normals still follow a genuine shape change rather than being copied over", () => {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 2, 2));
    plane.geometry.computeVertexNormals();

    // Push the middle vertex up into a tent: the surface is no longer flat.
    const pos = plane.geometry.attributes.position;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pts.push(new THREE.Vector3(x, y, Math.abs(x) < 0.01 && Math.abs(y) < 0.01 ? 1 : 0));
    }
    const out = writePointsToMesh("w-shape", wrap(plane), pts, "test") as THREE.Mesh;
    const n = out.geometry.attributes.normal;

    let tilted = false;
    for (let i = 0; i < n.count; i++) {
      if (Math.abs(n.getX(i)) > 0.1 || Math.abs(n.getY(i)) > 0.1) tilted = true;
    }
    expect(tilted).toBe(true);
  });

  it("geometry with no normals at all still gets sensible ones", () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    const mesh = new THREE.Mesh(geom);
    const out = writePointsToMesh("w-nonorm", wrap(mesh), translatedPoints(geom, 0), "test") as THREE.Mesh;

    expect(out.geometry.attributes.normal).toBeDefined();
    expect(Math.abs(out.geometry.attributes.normal.getZ(0))).toBeCloseTo(1, 3);
  });
});
