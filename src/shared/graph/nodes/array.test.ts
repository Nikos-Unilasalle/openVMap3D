import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { ARRAY_NODE } from "./array";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "arr-1" };

function getChildPosition(wrapper: THREE.Object3D): THREE.Vector3 {
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  wrapper.matrix.decompose(pos, rot, scale);
  return pos;
}

describe("ARRAY_NODE", () => {
  it("duplicates geometry in linear mode along X axis", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = ARRAY_NODE.evaluate(
      { geometry: box },
      { count: 4, mode: "linear", axis: "X", spacing: 2.0 },
      CTX
    );

    const group = res.geometry as THREE.Group;
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(4);

    expect(getChildPosition(group.children[0]).x).toBeCloseTo(0);
    expect(getChildPosition(group.children[1]).x).toBeCloseTo(2.0);
    expect(getChildPosition(group.children[2]).x).toBeCloseTo(4.0);
    expect(getChildPosition(group.children[3]).x).toBeCloseTo(6.0);
  });

  it("duplicates geometry in circular mode on XZ plane", () => {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5));
    const res = ARRAY_NODE.evaluate(
      { geometry: sphere },
      { count: 4, mode: "circular", radius: 5.0, plane: "XZ", totalAngle: 360, orient: true },
      CTX
    );

    const group = res.geometry as THREE.Group;
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(4);

    // Instance 0 (angle = 0): cos(0)*5 = 5, sin(0)*5 = 0
    expect(getChildPosition(group.children[0]).x).toBeCloseTo(5.0);
    expect(getChildPosition(group.children[0]).z).toBeCloseTo(0.0);

    // Instance 1 (angle = PI/2 = 90 deg): cos(PI/2)*5 = 0, sin(PI/2)*5 = 5
    expect(getChildPosition(group.children[1]).x).toBeCloseTo(0.0);
    expect(getChildPosition(group.children[1]).z).toBeCloseTo(5.0);
  });

  it("duplicates geometry in 2D grid mode", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = ARRAY_NODE.evaluate(
      { geometry: box },
      { mode: "grid", gridCols: 3, gridRows: 2, spacingX: 2.0, spacingY: 3.0, plane: "XZ", centerGrid: true },
      CTX
    );

    const group = res.geometry as THREE.Group;
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(6); // 3 * 2 = 6

    // Col 0, Row 0 -> (c=0, r=0) -> x = (0 - 1)*2 = -2, z = (0 - 0.5)*3 = -1.5
    expect(getChildPosition(group.children[0]).x).toBeCloseTo(-2.0);
    expect(getChildPosition(group.children[0]).z).toBeCloseTo(-1.5);
  });

  it("duplicates geometry in 3D grid volume mode", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = ARRAY_NODE.evaluate(
      { geometry: box },
      { mode: "grid3d", countX: 2, countY: 2, countZ: 2, spacingX: 2.0, spacingY: 2.0, spacingZ: 2.0, centerGrid: true },
      CTX
    );

    const group = res.geometry as THREE.Group;
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(8); // 2 * 2 * 2 = 8
  });

  it("returns empty group if no geometry is input", () => {
    const res = ARRAY_NODE.evaluate({}, { count: 5 }, CTX);
    const group = res.geometry as THREE.Group;
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(0);
  });
});

describe("ARRAY_NODE source ownership", () => {
  it("clones its source rather than reparenting it, leaving the source parentless", () => {
    // This is why the viewport needs a parking scene for gizmo targets:
    // TransformControls requires its attached object to be in a scene graph
    // (it calls object.parent.updateMatrixWorld() unguarded), but a node
    // feeding an Array is drawn only through these clones — its own object
    // belongs to no scene at all. See gizmoAnchorScene in Viewport.tsx.
    const source = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());

    const res = ARRAY_NODE.evaluate({ geometry: source }, { mode: "linear", count: 3 }, CTX);
    const group = res.geometry as THREE.Group;

    expect(group.children.length).toBe(3);
    expect(source.parent).toBeNull();
    for (const wrapper of group.children) {
      expect(wrapper.children[0]).not.toBe(source);
    }
  });
});

describe("ARRAY_NODE curve mode", () => {
  it("distributes instances evenly along an open curve, first and last landing exactly on its ends", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0));
    const res = ARRAY_NODE.evaluate({ geometry: box, curve }, { mode: "curve", count: 5 }, CTX);

    const group = res.geometry as THREE.Group;
    expect(group.children.length).toBe(5);
    expect(getChildPosition(group.children[0]).x).toBeCloseTo(0);
    expect(getChildPosition(group.children[1]).x).toBeCloseTo(2.5);
    expect(getChildPosition(group.children[4]).x).toBeCloseTo(10);
  });

  it("wraps around a closed curve without duplicating an instance at the seam", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0), new THREE.Vector3(10, 0, 10), new THREE.Vector3(0, 0, 10)];
    const curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0);
    const res = ARRAY_NODE.evaluate({ geometry: box, curve }, { mode: "curve", count: 4 }, CTX);

    const group = res.geometry as THREE.Group;
    expect(group.children.length).toBe(4);
    // Distinct positions — a naive `count` division of a closed curve would
    // put the first and last instance on top of each other (t=0 and t=1
    // being the same point on a closed curve).
    const positions = group.children.map((c) => getChildPosition(c));
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(positions[i].distanceTo(positions[j])).toBeGreaterThan(0.5);
      }
    }
  });

  it("leaves rotation untouched when Orient to Curve is off (the default)", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 5, 0));
    const res = ARRAY_NODE.evaluate({ geometry: box, curve }, { mode: "curve", count: 2, curveOrient: false }, CTX);

    const group = res.geometry as THREE.Group;
    const rot = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    group.children[1].matrix.decompose(pos, rot, scale);
    expect(rot.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 5);
  });

  it("aligns each instance's local +Z to the curve's tangent when Orient to Curve is on", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 10));
    const res = ARRAY_NODE.evaluate({ geometry: box, curve }, { mode: "curve", count: 2, curveOrient: true }, CTX);

    const group = res.geometry as THREE.Group;
    const rot = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    group.children[0].matrix.decompose(pos, rot, scale);
    // A curve running along +Z needs no rotation to align local +Z to it.
    expect(rot.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 4);
  });
});

describe("ARRAY_NODE linear spacing variance", () => {
  it("keeps every gap exactly Spacing when variance is 0 (default)", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = ARRAY_NODE.evaluate({ geometry: box }, { mode: "linear", count: 4, axis: "X", spacing: 3, spacingVariance: 0 }, CTX);
    const xs = (res.geometry as THREE.Group).children.map((c) => getChildPosition(c).x);
    expect(xs).toEqual([0, 3, 6, 9]);
  });

  it("jitters each gap, not just each instance — consecutive distances differ, and it's reproducible", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const params = { mode: "linear", count: 6, axis: "X", spacing: 3, spacingVariance: 50 };
    const res1 = ARRAY_NODE.evaluate({ geometry: box }, params, CTX);
    const xs1 = (res1.geometry as THREE.Group).children.map((c) => getChildPosition(c).x);

    const gaps = xs1.slice(1).map((x, i) => x - xs1[i]);
    // 50% variance means each gap is spacing * [0.5, 1.5] — not all identical.
    expect(new Set(gaps.map((g) => g.toFixed(4))).size).toBeGreaterThan(1);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(3 * 0.5 - 1e-6);
      expect(gap).toBeLessThanOrEqual(3 * 1.5 + 1e-6);
    }

    // Same inputs, same layout — the jitter is a pure function of index, not
    // of anything time- or call-order-dependent.
    const res2 = ARRAY_NODE.evaluate({ geometry: box }, params, CTX);
    const xs2 = (res2.geometry as THREE.Group).children.map((c) => getChildPosition(c).x);
    expect(xs2).toEqual(xs1);
  });

  it("leaves the first instance at the origin regardless of variance", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = ARRAY_NODE.evaluate({ geometry: box }, { mode: "linear", count: 5, axis: "X", spacing: 2, spacingVariance: 80 }, CTX);
    expect(getChildPosition((res.geometry as THREE.Group).children[0]).x).toBeCloseTo(0);
  });
});

describe("ARRAY_NODE spacing variance for every mode", () => {
  it("circular: jitters the angular step, first instance still at angle 0", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = ARRAY_NODE.evaluate(
      { geometry: box },
      { mode: "circular", count: 6, radius: 5, plane: "XZ", totalAngle: 360, orient: false, spacingVariance: 50 },
      CTX,
    );
    const positions = (res.geometry as THREE.Group).children.map((c) => getChildPosition(c));
    expect(positions[0].x).toBeCloseTo(5);
    expect(positions[0].z).toBeCloseTo(0);
    // Radii stay exact (only the angle jitters) — every point still on the circle.
    for (const p of positions) expect(Math.hypot(p.x, p.z)).toBeCloseTo(5, 4);
  });

  it("grid: jitters column/row spacing, still centered on the row/column's own span", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = ARRAY_NODE.evaluate(
      { geometry: box },
      { mode: "grid", gridCols: 5, gridRows: 1, spacingX: 2, spacingY: 2, plane: "XZ", centerGrid: true, spacingVariance: 50 },
      CTX,
    );
    const xs = (res.geometry as THREE.Group).children.map((c) => getChildPosition(c).x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    expect(new Set(gaps.map((g) => g.toFixed(4))).size).toBeGreaterThan(1);
    // Centered: the span sits symmetrically around 0.
    expect(xs[0] + xs[xs.length - 1]).toBeCloseTo(0, 4);
  });

  it("grid3d: jitters spacing independently per axis", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = ARRAY_NODE.evaluate(
      { geometry: box },
      { mode: "grid3d", countX: 4, countY: 1, countZ: 1, spacingX: 2, spacingY: 2, spacingZ: 2, centerGrid: false, spacingVariance: 50 },
      CTX,
    );
    const xs = (res.geometry as THREE.Group).children.map((c) => getChildPosition(c).x);
    expect(xs[0]).toBeCloseTo(0);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    expect(new Set(gaps.map((g) => g.toFixed(4))).size).toBeGreaterThan(1);
  });

  it("curve: jitters arc-length spacing, first and last instances still land exactly on the curve's own ends", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 0, 0));
    const res = ARRAY_NODE.evaluate(
      { geometry: box, curve },
      { mode: "curve", count: 6, spacingVariance: 60 },
      CTX,
    );
    const xs = (res.geometry as THREE.Group).children.map((c) => getChildPosition(c).x);
    expect(xs[0]).toBeCloseTo(0);
    expect(xs[xs.length - 1]).toBeCloseTo(20);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    expect(new Set(gaps.map((g) => g.toFixed(4))).size).toBeGreaterThan(1);
  });

  it("curve: still wraps a closed curve without a duplicate at the seam, even with variance on", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0), new THREE.Vector3(10, 0, 10), new THREE.Vector3(0, 0, 10)];
    const curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0);
    const res = ARRAY_NODE.evaluate({ geometry: box, curve }, { mode: "curve", count: 5, spacingVariance: 40 }, CTX);
    const positions = (res.geometry as THREE.Group).children.map((c) => getChildPosition(c));
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(positions[i].distanceTo(positions[j])).toBeGreaterThan(0.5);
      }
    }
  });

  it("picks a random geometry per instance when a Geometries list is wired", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.name = "box";
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1));
    sphere.name = "sphere";
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1));
    cone.name = "cone";

    const res = ARRAY_NODE.evaluate(
      { geometries: [box, sphere, cone], count: 12 },
      { count: 12, mode: "linear", spacing: 2.0, seed: 1 },
      CTX,
    );

    const group = res.geometry as THREE.Group;
    expect(group.children.length).toBe(12);
    const names = group.children.map((wrapper) => (wrapper.children[0] as THREE.Mesh).name);
    // Picks from the pool, not the same item every time.
    expect(new Set(names).size).toBeGreaterThan(1);
    for (const n of names) expect(["box", "sphere", "cone"]).toContain(n);
  });

  it("random pick is deterministic — same seed reproduces the same sequence", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.name = "box";
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1));
    sphere.name = "sphere";

    const evalOnce = () => {
      const res = ARRAY_NODE.evaluate(
        { geometries: [box, sphere] },
        { count: 8, mode: "linear", seed: 42 },
        CTX,
      );
      return (res.geometry as THREE.Group).children.map((w) => (w.children[0] as THREE.Mesh).name);
    };

    expect(evalOnce()).toEqual(evalOnce());
  });

  it("falls back to the single Geometry input when no list is wired", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, mode: "linear" }, CTX);
    const group = res.geometry as THREE.Group;
    expect(group.children.length).toBe(3);
  });
});
