import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { CURVE_SHAPE_KEY_NODE, MESH_SHAPE_KEY_NODE } from "./shapeKey";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "shapekey-test" };

describe("CURVE_SHAPE_KEY_NODE", () => {
  it("with no targets wired, passes the basis shape straight through", () => {
    const basis = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)]);
    const res = CURVE_SHAPE_KEY_NODE.evaluate({ basis }, { resolution: 8 }, CTX);
    const curve = res.curve as THREE.Curve<THREE.Vector3>;

    const basisPts = basis.getPoints(8);
    const outPts = curve.getPoints(8);
    outPts.forEach((p, i) => expect(p.distanceTo(basisPts[i])).toBeLessThan(1e-6));
  });

  it("blends toward a target curve at weight 1", () => {
    const basis = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)]);
    const target0 = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 10, 0), new THREE.Vector3(10, 10, 0)]);

    const res = CURVE_SHAPE_KEY_NODE.evaluate(
      { basis, target0, weight0: 1 },
      { resolution: 8 },
      CTX,
    );
    const curve = res.curve as THREE.Curve<THREE.Vector3>;
    const outPts = curve.getPoints(8);
    const targetPts = target0.getPoints(8);
    outPts.forEach((p, i) => expect(p.distanceTo(targetPts[i])).toBeLessThan(1e-6));
  });

  it("blends halfway at weight 0.5", () => {
    const basis = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)]);
    const target0 = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 10, 0), new THREE.Vector3(10, 10, 0)]);

    const res = CURVE_SHAPE_KEY_NODE.evaluate(
      { basis, target0, weight0: 0.5 },
      { resolution: 4 },
      CTX,
    );
    const curve = res.curve as THREE.Curve<THREE.Vector3>;
    const startPoint = curve.getPoint(0);
    expect(startPoint.y).toBeCloseTo(5);
  });

  it("returns nothing when no basis is wired", () => {
    const res = CURVE_SHAPE_KEY_NODE.evaluate({}, {}, CTX);
    expect(res.curve).toBeNull();
  });
});

describe("MESH_SHAPE_KEY_NODE", () => {
  it("with no targets wired, passes the basis geometry's vertex positions straight through", () => {
    const basis = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const res = MESH_SHAPE_KEY_NODE.evaluate({ basis }, {}, CTX);
    const outMesh = res.geometry as THREE.Mesh;

    const basisPos = basis.geometry.attributes.position;
    const outPos = outMesh.geometry.attributes.position;
    expect(outPos.count).toBe(basisPos.count);
    for (let i = 0; i < outPos.count; i++) {
      expect(outPos.getX(i)).toBeCloseTo(basisPos.getX(i));
      expect(outPos.getY(i)).toBeCloseTo(basisPos.getY(i));
      expect(outPos.getZ(i)).toBeCloseTo(basisPos.getZ(i));
    }
  });

  it("blends per-vertex toward a same-topology target at weight 1", () => {
    const basis = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const target0 = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4));

    const res = MESH_SHAPE_KEY_NODE.evaluate({ basis, target0, weight0: 1 }, {}, CTX);
    const outMesh = res.geometry as THREE.Mesh;

    const targetPos = target0.geometry.attributes.position;
    const outPos = outMesh.geometry.attributes.position;
    for (let i = 0; i < outPos.count; i++) {
      expect(outPos.getX(i)).toBeCloseTo(targetPos.getX(i));
    }
  });

  it("ignores a target whose vertex count doesn't match the basis", () => {
    const basis = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)); // 24 verts
    const target0 = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8)); // different count

    const res = MESH_SHAPE_KEY_NODE.evaluate({ basis, target0, weight0: 1 }, {}, CTX);
    const outMesh = res.geometry as THREE.Mesh;
    const basisPos = basis.geometry.attributes.position;
    const outPos = outMesh.geometry.attributes.position;
    for (let i = 0; i < outPos.count; i++) {
      expect(outPos.getX(i)).toBeCloseTo(basisPos.getX(i));
    }
  });

  it("returns null when nothing is wired", () => {
    const res = MESH_SHAPE_KEY_NODE.evaluate({}, {}, CTX);
    expect(res.geometry).toBeNull();
  });
});
