import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { MESH_TO_POINTS_NODE, POINTS_TO_MESH_NODE } from "./pointsGeometry";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "p2g-test" };

describe("MESH_TO_POINTS_NODE", () => {
  it("extracts one point per raw vertex-buffer entry, in local space", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(5, 0, 0); // world offset — should NOT leak into local points

    const res = MESH_TO_POINTS_NODE.evaluate({ geometry: mesh }, {}, CTX);
    const points = res.points as THREE.Vector3[];

    expect(points.length).toBe(mesh.geometry.attributes.position.count);
    // local space: box corners stay within [-0.5, 0.5], not shifted by +5
    expect(Math.max(...points.map((p) => Math.abs(p.x)))).toBeLessThanOrEqual(0.5001);
  });

  it("passes the original geometry through unchanged, for Points to Mesh to rebuild from", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = MESH_TO_POINTS_NODE.evaluate({ geometry: mesh }, {}, CTX);
    expect(res.geometry).toBe(mesh);
  });

  it("returns empty output rather than throwing when nothing is wired", () => {
    const res = MESH_TO_POINTS_NODE.evaluate({}, {}, CTX);
    expect(res.points).toEqual([]);
    expect(res.count).toBe(0);
  });
});

describe("POINTS_TO_MESH_NODE", () => {
  it("round-trips: Mesh to Points -> move one point -> Points to Mesh reflects it", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const extracted = MESH_TO_POINTS_NODE.evaluate({ geometry: mesh }, {}, CTX);
    const points = (extracted.points as THREE.Vector3[]).map((p) => p.clone());
    points[0].y += 10; // displace one vertex far away

    const res = POINTS_TO_MESH_NODE.evaluate(
      { geometry: extracted.geometry, points },
      {},
      { ...CTX, nodeId: "p2g-test-2" },
    );
    const outMesh = res.geometry as THREE.Mesh;
    const newPos = outMesh.geometry.attributes.position;
    expect(newPos.getY(0)).toBeCloseTo(points[0].y, 4);
  });

  it("does not mutate the original mesh's geometry", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const originalY0 = mesh.geometry.attributes.position.getY(0);
    const extracted = MESH_TO_POINTS_NODE.evaluate({ geometry: mesh }, {}, CTX);
    const points = (extracted.points as THREE.Vector3[]).map((p) => p.clone());
    points[0].y += 10;

    POINTS_TO_MESH_NODE.evaluate({ geometry: extracted.geometry, points }, {}, { ...CTX, nodeId: "p2g-test-3" });
    expect(mesh.geometry.attributes.position.getY(0)).toBe(originalY0);
  });

  it("falls back to the unmodified input, with no crash, on a vertex-count mismatch", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const tooFewPoints = [new THREE.Vector3(0, 0, 0)];

    const res = POINTS_TO_MESH_NODE.evaluate({ geometry: mesh, points: tooFewPoints }, {}, { ...CTX, nodeId: "p2g-test-4" });
    expect(res.geometry).toBe(mesh);
  });

  it("returns null rather than throwing when nothing is wired", () => {
    const res = POINTS_TO_MESH_NODE.evaluate({}, {}, { ...CTX, nodeId: "p2g-test-5" });
    expect(res.geometry).toBeNull();
  });
});
