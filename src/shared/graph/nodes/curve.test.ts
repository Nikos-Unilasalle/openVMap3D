import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import {
  createVariableThicknessTubeGeometry,
  CURVE_DEFORM_NODE,
  CURVE_FROM_POINTS_NODE,
  CURVE_PRIMITIVE_NODE,
  CURVE_TO_MESH_NODE,
  SAMPLE_CURVE_NODE,
} from "./curve";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "curve-test-1" };

describe("CURVE NODES", () => {
  it("CURVE_FROM_POINTS_NODE creates a valid THREE.Curve", () => {
    const res = CURVE_FROM_POINTS_NODE.evaluate(
      {
        points: [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(1, 2, 0),
          new THREE.Vector3(2, 0, 0),
        ],
      },
      CURVE_FROM_POINTS_NODE.defaultParams,
      CTX
    );

    const curve = res.curve as THREE.Curve<THREE.Vector3>;
    expect(curve).toBeInstanceOf(THREE.Curve);
    const pt = curve.getPointAt(0.5);
    expect(pt).toBeInstanceOf(THREE.Vector3);
  });

  it("CURVE_PRIMITIVE_NODE generates helix and circle curves", () => {
    const resHelix = CURVE_PRIMITIVE_NODE.evaluate(
      {},
      { primitiveType: "helix", radius: 2, height: 4, turns: 2 },
      CTX
    );
    expect(resHelix.curve).toBeInstanceOf(THREE.Curve);

    const resCircle = CURVE_PRIMITIVE_NODE.evaluate(
      {},
      { primitiveType: "circle", radius: 3, height: 0, turns: 1 },
      CTX
    );
    expect(resCircle.curve).toBeInstanceOf(THREE.Curve);
  });

  it("createVariableThicknessTubeGeometry builds buffer geometry with positions and normals", () => {
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const geom = createVariableThicknessTubeGeometry(curve, 16, 8, 0.2);

    expect(geom).toBeInstanceOf(THREE.BufferGeometry);
    expect(geom.attributes.position.count).toBeGreaterThan(0);
    expect(geom.attributes.normal.count).toBe(geom.attributes.position.count);
  });

  it("CURVE_TO_MESH_NODE generates a 3D Mesh object with variable thickness", () => {
    const pts = [
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(1, 0, 0),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);

    const res = CURVE_TO_MESH_NODE.evaluate(
      { curve, thickness: 0.3 },
      CURVE_TO_MESH_NODE.defaultParams,
      CTX
    );

    const mesh = res.geometry as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.geometry).toBeInstanceOf(THREE.BufferGeometry);
  });

  it("CURVE_TO_MESH_NODE trims curve from startProgress to endProgress", () => {
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);

    const full = CURVE_TO_MESH_NODE.evaluate(
      { curve, startProgress: 0, endProgress: 1 },
      CURVE_TO_MESH_NODE.defaultParams,
      { time: 0, step: 0, nodeId: "curve-full" }
    );
    const fullMesh = full.geometry as THREE.Mesh;
    fullMesh.geometry.computeBoundingBox();
    const fullMaxX = fullMesh.geometry.boundingBox!.max.x;
    expect(fullMaxX).toBeCloseTo(10, 0);

    const trimmed = CURVE_TO_MESH_NODE.evaluate(
      { curve, startProgress: 0.2, endProgress: 0.7 },
      CURVE_TO_MESH_NODE.defaultParams,
      { time: 0, step: 0, nodeId: "curve-trimmed" }
    );
    const trimmedMesh = trimmed.geometry as THREE.Mesh;
    trimmedMesh.geometry.computeBoundingBox();
    expect(trimmedMesh.geometry.boundingBox!.min.x).toBeGreaterThan(1.5);
    expect(trimmedMesh.geometry.boundingBox!.max.x).toBeLessThan(7.5);
  });

  it("SAMPLE_CURVE_NODE computes position, tangent, and orientation matrix at progress t", () => {
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);

    const res = SAMPLE_CURVE_NODE.evaluate(
      { curve, progress: 0.5 },
      SAMPLE_CURVE_NODE.defaultParams,
      CTX
    );

    expect(res.position).toBeInstanceOf(THREE.Vector3);
    expect(res.tangent).toBeInstanceOf(THREE.Vector3);
    expect(res.matrix).toBeInstanceOf(THREE.Matrix4);
    expect(res.rotation).toBeInstanceOf(THREE.Vector3);
  });

  it("CURVE_DEFORM_NODE bends 3D mesh geometry along a curve", () => {
    const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 4), new THREE.MeshStandardMaterial());
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 3, 5),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);

    const res = CURVE_DEFORM_NODE.evaluate(
      { geometry: boxMesh, curve, progress: 0.1 },
      CURVE_DEFORM_NODE.defaultParams,
      CTX
    );

    const deformedMesh = res.geometry as THREE.Mesh;
    expect(deformedMesh).toBeInstanceOf(THREE.Mesh);
    expect(deformedMesh.geometry).not.toBe(boxMesh.geometry);
  });
});

describe("CURVE_FROM_POINTS_NODE bezier mode", () => {
  const points = (count: number) =>
    Array.from({ length: count }, (_, i) => new THREE.Vector3(i, i % 2, 0));

  function pathOf(count: number, closed = false): THREE.CurvePath<THREE.Vector3> {
    const res = CURVE_FROM_POINTS_NODE.evaluate(
      { points: points(count) },
      { ...CURVE_FROM_POINTS_NODE.defaultParams, type: "bezier", closed },
      CTX
    );
    return res.curve as THREE.CurvePath<THREE.Vector3>;
  }

  it("builds one cubic segment per group of three points past the first", () => {
    expect(pathOf(4).curves).toHaveLength(1);
    expect(pathOf(7).curves).toHaveLength(2);
  });

  it("ends a 3n+2 list on a quadratic instead of dropping its tail", () => {
    const curves = pathOf(6).curves;

    expect(curves).toHaveLength(2);
    expect(curves[1]).toBeInstanceOf(THREE.QuadraticBezierCurve3);
  });

  it("ends a 3n+3 list on a straight segment instead of dropping its tail", () => {
    const curves = pathOf(5).curves;

    expect(curves).toHaveLength(2);
    expect(curves[1]).toBeInstanceOf(THREE.LineCurve3);
  });

  it("every point reaches the curve — the last one is on it", () => {
    const pts = points(6);
    const path = pathOf(6);

    expect(path.getPoint(1).distanceTo(pts[5])).toBeLessThan(1e-6);
  });

  it("closes back to the first point when Closed is set", () => {
    const path = pathOf(4, true);

    expect(path.curves).toHaveLength(2);
    expect(path.getPoint(1).distanceTo(points(4)[0])).toBeLessThan(1e-6);
  });
});

describe("SAMPLE_CURVE_NODE progress", () => {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)]);

  function positionAt(progress: number): THREE.Vector3 {
    const res = SAMPLE_CURVE_NODE.evaluate({ curve, progress }, SAMPLE_CURVE_NODE.defaultParams, CTX);
    return res.position as THREE.Vector3;
  }

  it("reaches the end of the curve at progress 1 rather than snapping back to the start", () => {
    expect(positionAt(1).x).toBeCloseTo(10, 5);
  });

  it("still wraps past 1 so an ever-increasing driver loops the path", () => {
    expect(positionAt(1.25).x).toBeCloseTo(positionAt(0.25).x, 5);
    // 1 is the one exception — every other whole number is another lap.
    expect(positionAt(2).x).toBeCloseTo(0, 5);
  });
});

describe("CURVE_TO_MESH_NODE geometry caching", () => {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)]);
  const ctx: EvalContext = { time: 0, step: 0, nodeId: "curve-cache-1" };

  it("keeps the same geometry when nothing it depends on changed", () => {
    const first = CURVE_TO_MESH_NODE.evaluate({ curve }, CURVE_TO_MESH_NODE.defaultParams, ctx);
    const firstGeometry = (first.geometry as THREE.Mesh).geometry;
    // A fresh Curve instance with the same definition, as the upstream node
    // hands back every frame — identity must not be what triggers a rebuild.
    const sameCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)]);
    const second = CURVE_TO_MESH_NODE.evaluate({ curve: sameCurve }, CURVE_TO_MESH_NODE.defaultParams, ctx);

    expect((second.geometry as THREE.Mesh).geometry).toBe(firstGeometry);
  });

  it("rebuilds when a shape parameter changes", () => {
    // The mesh instance is reused, so the geometry it held has to be captured
    // before the second evaluate swaps it out.
    const before = CURVE_TO_MESH_NODE.evaluate({ curve }, CURVE_TO_MESH_NODE.defaultParams, ctx);
    const beforeGeometry = (before.geometry as THREE.Mesh).geometry;

    const after = CURVE_TO_MESH_NODE.evaluate(
      { curve },
      { ...CURVE_TO_MESH_NODE.defaultParams, radialSegments: 5 },
      ctx
    );

    expect((after.geometry as THREE.Mesh).geometry).not.toBe(beforeGeometry);
  });

  it("rebuilds when the curve itself moves", () => {
    const before = CURVE_TO_MESH_NODE.evaluate({ curve }, CURVE_TO_MESH_NODE.defaultParams, ctx);
    const beforeGeometry = (before.geometry as THREE.Mesh).geometry;

    const moved = new THREE.CatmullRomCurve3([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 4, 0)]);
    const after = CURVE_TO_MESH_NODE.evaluate({ curve: moved }, CURVE_TO_MESH_NODE.defaultParams, ctx);

    expect((after.geometry as THREE.Mesh).geometry).not.toBe(beforeGeometry);
  });
});

describe("CURVE_DEFORM_NODE placement", () => {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 10)]);

  function boxAt(offsetY: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 4), new THREE.MeshStandardMaterial());
    mesh.matrixAutoUpdate = false;
    mesh.matrix.makeTranslation(0, offsetY, 0);
    return mesh;
  }

  function centroid(mesh: THREE.Mesh): THREE.Vector3 {
    const position = mesh.geometry.attributes.position;
    const sum = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) sum.add(v.fromBufferAttribute(position, i));
    return sum.divideScalar(position.count);
  }

  it("honours the source object's own transform instead of deforming it as if at the origin", () => {
    const low = CURVE_DEFORM_NODE.evaluate(
      { geometry: boxAt(0), curve },
      CURVE_DEFORM_NODE.defaultParams,
      { time: 0, step: 0, nodeId: "deform-low" }
    );
    const high = CURVE_DEFORM_NODE.evaluate(
      { geometry: boxAt(5), curve },
      CURVE_DEFORM_NODE.defaultParams,
      { time: 0, step: 0, nodeId: "deform-high" }
    );

    // The offset survives into the deformed result — which axis it lands on
    // depends on the curve's Frenet frame, so distance is what is asserted.
    const moved = centroid(high.geometry as THREE.Mesh).distanceTo(centroid(low.geometry as THREE.Mesh));
    expect(moved).toBeCloseTo(5, 4);
  });

  it("applies its own pose to the result, so the gizmo has something to drag", () => {
    const res = CURVE_DEFORM_NODE.evaluate(
      { geometry: boxAt(0), curve },
      { ...CURVE_DEFORM_NODE.defaultParams, location: new THREE.Vector3(3, 0, 0) },
      { time: 0, step: 0, nodeId: "deform-posed" }
    );

    const offset = new THREE.Vector3().setFromMatrixPosition((res.geometry as THREE.Mesh).matrix);
    expect(offset.x).toBeCloseTo(3, 5);
  });

  it("reuses one mesh across frames rather than leaking a copy per evaluate", () => {
    const ctx: EvalContext = { time: 0, step: 0, nodeId: "deform-reuse" };
    const box = boxAt(0);

    const first = CURVE_DEFORM_NODE.evaluate({ geometry: box, curve }, CURVE_DEFORM_NODE.defaultParams, ctx);
    const second = CURVE_DEFORM_NODE.evaluate({ geometry: box, curve }, CURVE_DEFORM_NODE.defaultParams, ctx);

    expect(second.geometry).toBe(first.geometry);
  });
});
