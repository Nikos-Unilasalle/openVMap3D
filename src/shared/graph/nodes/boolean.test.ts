import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { BOOLEAN_NODE } from "./boolean";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "boolean-test" };

/** A box at a world position, driven the same way an object node drives its mesh (matrixAutoUpdate off). */
function boxAt(x: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeTranslation(x, 0, 0);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe("BOOLEAN_NODE", () => {
  it("subtracts the second shape from the first", () => {
    const a = boxAt(0);
    const b = boxAt(0.5);
    const res = BOOLEAN_NODE.evaluate(
      { geometry: a, boolean: b, operation: "subtract" },
      BOOLEAN_NODE.defaultParams,
      CTX,
    );
    const mesh = res.geometry as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it("unions two shapes", () => {
    const a = boxAt(0);
    const b = boxAt(0.5);
    const res = BOOLEAN_NODE.evaluate(
      { geometry: a, boolean: b, operation: "add" },
      BOOLEAN_NODE.defaultParams,
      CTX,
    );
    expect((res.geometry as THREE.Mesh).geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it("intersects two shapes", () => {
    const a = boxAt(0);
    const b = boxAt(0.5);
    const res = BOOLEAN_NODE.evaluate(
      { geometry: a, boolean: b, operation: "intersect" },
      BOOLEAN_NODE.defaultParams,
      CTX,
    );
    const mesh = res.geometry as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    // The two boxes overlap in a smaller volume — a real result, not empty.
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    expect(bb.max.x - bb.min.x).toBeLessThan(1.5);
  });

  it("re-runs CSG when a source's pose (matrix) changes, even with a stale matrixWorld", () => {
    const a = boxAt(0);
    const b = boxAt(0.5);
    const r1 = BOOLEAN_NODE.evaluate(
      { geometry: a, boolean: b, operation: "intersect" },
      BOOLEAN_NODE.defaultParams,
      CTX,
    );
    const g1 = (r1.geometry as THREE.Mesh).geometry;

    // Animate b's pose the way a graph-driven mesh is driven: matrix set via
    // matrix.copy() (matrixAutoUpdate off), leaving matrixWorld *stale*. The
    // boolean must force the recompute to see the new pose.
    b.matrix.makeTranslation(4, 0, 0);

    const r2 = BOOLEAN_NODE.evaluate(
      { geometry: a, boolean: b, operation: "intersect" },
      BOOLEAN_NODE.defaultParams,
      CTX,
    );
    // The result must be recomputed, not a stale cache hit.
    expect((r2.geometry as THREE.Mesh).geometry).not.toBe(g1);
  });

  it("re-runs CSG when a source's vertices change in place (vertex animation)", () => {
    const a = boxAt(0);
    const b = boxAt(0.5);
    const r1 = BOOLEAN_NODE.evaluate(
      { geometry: a, boolean: b, operation: "intersect" },
      BOOLEAN_NODE.defaultParams,
      CTX,
    );
    const g1 = (r1.geometry as THREE.Mesh).geometry;

    // Mutate b's vertices in place — same geometry uuid, as a deforming source.
    const pos = b.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + 5);
    pos.needsUpdate = true;

    const r2 = BOOLEAN_NODE.evaluate(
      { geometry: a, boolean: b, operation: "intersect" },
      BOOLEAN_NODE.defaultParams,
      CTX,
    );
    // The result must be recomputed, not a stale cache hit.
    expect((r2.geometry as THREE.Mesh).geometry).not.toBe(g1);
  });
});
