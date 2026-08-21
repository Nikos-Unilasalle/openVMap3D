import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { DELETE_GEOMETRY_NODE, EXTRUDE_MESH_NODE, selectFaces } from "./meshEdit";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "mesh-edit-test" };

function faceCountOf(mesh: THREE.Mesh): number {
  const geom = mesh.geometry;
  return (geom.index ? geom.index.count : geom.attributes.position.count) / 3;
}

describe("selectFaces", () => {
  it("'all' selects every triangle", () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const positions = box.attributes.position.array as Float32Array;
    const indices = box.index!.array;
    const faceCount = indices.length / 3;

    const sel = selectFaces(positions, indices, faceCount, { mode: "all", axis: "y", threshold: 0, invert: false });
    expect(sel.every(Boolean)).toBe(true);
  });

  it("'normal' selects only the top-facing triangles of a box", () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const positions = box.attributes.position.array as Float32Array;
    const indices = box.index!.array;
    const faceCount = indices.length / 3;

    const sel = selectFaces(positions, indices, faceCount, { mode: "normal", axis: "y", threshold: 0.9, invert: false });
    const selectedCount = sel.filter(Boolean).length;
    // A unit box's +Y face is 2 triangles out of 12 total.
    expect(selectedCount).toBe(2);
  });

  it("invert flips the selection", () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const positions = box.attributes.position.array as Float32Array;
    const indices = box.index!.array;
    const faceCount = indices.length / 3;

    const normal = selectFaces(positions, indices, faceCount, { mode: "normal", axis: "y", threshold: 0.9, invert: false });
    const inverted = selectFaces(positions, indices, faceCount, { mode: "normal", axis: "y", threshold: 0.9, invert: true });
    for (let i = 0; i < normal.length; i++) expect(inverted[i]).toBe(!normal[i]);
  });

  it("'height' selects faces whose average position along the axis clears the threshold", () => {
    const box = new THREE.BoxGeometry(1, 1, 1); // spans -0.5..0.5
    const positions = box.attributes.position.array as Float32Array;
    const indices = box.index!.array;
    const faceCount = indices.length / 3;

    const above = selectFaces(positions, indices, faceCount, { mode: "height", axis: "y", threshold: 0, invert: false });
    const below = selectFaces(positions, indices, faceCount, { mode: "height", axis: "y", threshold: 0, invert: true });
    // Every face's centroid is strictly above or below y=0 on a symmetric
    // box (none straddle exactly), so the two selections partition all faces.
    for (let i = 0; i < above.length; i++) expect(above[i]).toBe(!below[i]);
  });
});

describe("EXTRUDE_MESH_NODE", () => {
  it("extruding the top faces of a box adds a wall and raises the cap without moving the rest", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const originalTris = faceCountOf(box);

    const res = EXTRUDE_MESH_NODE.evaluate(
      { geometry: box, distance: 0.5 },
      { ...EXTRUDE_MESH_NODE.defaultParams, selectMode: "normal", axis: "y", threshold: 0.9 },
      CTX,
    );
    const mesh = res.geometry as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(faceCountOf(mesh)).toBeGreaterThan(originalTris);

    mesh.geometry.computeBoundingBox();
    const box3 = mesh.geometry.boundingBox!;
    // The box spans -0.5..0.5; extruding the top by 0.5 should push the
    // ceiling to ~1.0 while the floor stays at -0.5.
    expect(box3.max.y).toBeCloseTo(1.0, 4);
    expect(box3.min.y).toBeCloseTo(-0.5, 4);
  });

  it("'all' mode extrudes every face outward along its own normal (a flat plane just moves along its normal)", () => {
    // A plane (unlike a box) has one normal shared by every vertex, so the
    // expected offset is unambiguous — a box's corner vertices average 3
    // different face normals together, which is real correct behavior but
    // not a clean number to assert against by hand.
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    const res = EXTRUDE_MESH_NODE.evaluate({ geometry: plane, distance: 0.25 }, EXTRUDE_MESH_NODE.defaultParams, CTX);
    const mesh = res.geometry as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    const box3 = mesh.geometry.boundingBox!;
    expect(box3.max.z).toBeCloseTo(0.25, 4);
    expect(box3.min.z).toBeCloseTo(0, 4);
  });

  it("distance 0 passes the geometry through unchanged", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const originalTris = faceCountOf(box);
    const res = EXTRUDE_MESH_NODE.evaluate({ geometry: box, distance: 0 }, EXTRUDE_MESH_NODE.defaultParams, CTX);
    expect(faceCountOf(res.geometry as THREE.Mesh)).toBe(originalTris);
  });

  it("an empty selection passes the geometry through unchanged", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const originalTris = faceCountOf(box);
    const res = EXTRUDE_MESH_NODE.evaluate(
      { geometry: box, distance: 1 },
      { ...EXTRUDE_MESH_NODE.defaultParams, selectMode: "normal", axis: "y", threshold: 10 }, // impossible dot product
      CTX,
    );
    expect(faceCountOf(res.geometry as THREE.Mesh)).toBe(originalTris);
  });

  it("returns null when nothing is wired in", () => {
    const res = EXTRUDE_MESH_NODE.evaluate({}, EXTRUDE_MESH_NODE.defaultParams, CTX);
    expect(res.geometry).toBeNull();
  });
});

describe("DELETE_GEOMETRY_NODE", () => {
  it("default params delete exactly the faces whose own centroid clears the threshold", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const originalTris = faceCountOf(box);

    const res = DELETE_GEOMETRY_NODE.evaluate({ geometry: box }, DELETE_GEOMETRY_NODE.defaultParams, CTX);
    const mesh = res.geometry as THREE.Mesh;
    // A unit box's 12 triangles: the top cap (2) sit fully above y=0, and of
    // each side wall's 2 triangles exactly one has a centroid above y=0 (the
    // wall is split corner-to-corner) — 6 of 12 have centroid y >= 0 and get
    // deleted. Deliberately not asserting the bounding box here: a *kept*
    // side-wall triangle still touches y=+0.5 at one of its own corners even
    // though its centroid is below 0, so the box stays full-height — that's
    // correct face-centroid selection, not a bug, just not what a naive
    // bounding-box check would expect.
    expect(faceCountOf(mesh)).toBe(6);
    expect(faceCountOf(mesh)).toBeLessThan(originalTris);
  });

  it("preserves UVs and normals on the surviving faces (pure subtraction, no new topology)", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = DELETE_GEOMETRY_NODE.evaluate({ geometry: box }, DELETE_GEOMETRY_NODE.defaultParams, CTX);
    const mesh = res.geometry as THREE.Mesh;
    expect(mesh.geometry.attributes.uv).toBeDefined();
    expect(mesh.geometry.attributes.normal).toBeDefined();
  });

  it("invert deletes the complementary set of faces", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const normal = DELETE_GEOMETRY_NODE.evaluate({ geometry: box }, DELETE_GEOMETRY_NODE.defaultParams, CTX);
    const inverted = DELETE_GEOMETRY_NODE.evaluate(
      { geometry: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)) },
      { ...DELETE_GEOMETRY_NODE.defaultParams, invert: true },
      { ...CTX, nodeId: "mesh-edit-test-inverted" },
    );
    // Same box, complementary selection — together they should account for
    // every triangle (12), and inverting should not land on the same count
    // by coincidence unless the split happens to be even (it is: 6/6 here,
    // asserted directly instead of just "not equal" to keep this precise).
    expect(faceCountOf(normal.geometry as THREE.Mesh) + faceCountOf(inverted.geometry as THREE.Mesh)).toBe(12);
    expect(faceCountOf(inverted.geometry as THREE.Mesh)).toBe(6);
  });

  it("returns null when nothing is wired in", () => {
    const res = DELETE_GEOMETRY_NODE.evaluate({}, DELETE_GEOMETRY_NODE.defaultParams, CTX);
    expect(res.geometry).toBeNull();
  });
});
