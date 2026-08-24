import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { EDIT_MESH_POINTS_NODE } from "./editMeshPoints";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "edit-points-test" };

describe("EDIT_MESH_POINTS_NODE", () => {
  it("passes the basis through unedited before pointsList is seeded", () => {
    const basis = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = EDIT_MESH_POINTS_NODE.evaluate({ basis }, { pointsList: [] }, CTX);
    expect(res.geometry).toBe(basis);
  });

  it("rebuilds the mesh from an edited pointsList once seeded", () => {
    const basis = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const posAttr = basis.geometry.attributes.position;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < posAttr.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(posAttr, i));
    // Move just the first vertex.
    points[0] = points[0].clone().add(new THREE.Vector3(5, 0, 0));

    const res = EDIT_MESH_POINTS_NODE.evaluate({ basis }, { pointsList: points }, CTX);
    const outMesh = res.geometry as THREE.Mesh;
    const outPos = outMesh.geometry.attributes.position;
    expect(outPos.getX(0)).toBeCloseTo(points[0].x);
    expect(outPos.getX(1)).toBeCloseTo(posAttr.getX(1));
  });

  it("passes through unchanged (with a warning, not a crash) when pointsList no longer matches the basis's vertex count", () => {
    const basis = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); // 24 verts
    const stalePoints = [new THREE.Vector3(0, 0, 0)]; // seeded from some other mesh

    const res = EDIT_MESH_POINTS_NODE.evaluate({ basis }, { pointsList: stalePoints }, CTX);
    expect(res.geometry).toBe(basis);
  });

  it("returns null with nothing wired into Basis", () => {
    const res = EDIT_MESH_POINTS_NODE.evaluate({}, { pointsList: [] }, CTX);
    expect(res.geometry).toBeNull();
  });
});
