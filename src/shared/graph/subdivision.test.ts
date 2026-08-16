import { describe, expect, test } from "vitest";
import { catmullClarkSubdivide, IndexedMesh, simpleSubdivide, subdivide } from "./subdivision";

/** Regular tetrahedron: 4 vertices, 4 triangular faces, 6 edges — the simplest closed manifold. */
function tetrahedron(): IndexedMesh {
  return {
    positions: new Float32Array([
      1, 1, 1,
      -1, -1, 1,
      -1, 1, -1,
      1, -1, -1,
    ]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]),
  };
}

describe("simpleSubdivide", () => {
  test("splits each triangle into 4, adding one vertex per edge (V+E, 4F faces)", () => {
    const result = simpleSubdivide(tetrahedron());
    // V=4, E=6, F=4 for a tetrahedron.
    expect(result.positions.length / 3).toBe(4 + 6);
    expect(result.indices.length / 3).toBe(4 * 4);
  });

  test("never moves an original vertex — it's a pure densifier, not a smoother", () => {
    const source = tetrahedron();
    const result = simpleSubdivide(source);
    for (let i = 0; i < source.positions.length; i++) {
      expect(result.positions[i]).toBeCloseTo(source.positions[i]);
    }
  });

  test("shares edge midpoints between the two triangles either side — no cracks", () => {
    const result = simpleSubdivide(tetrahedron());
    // 16 triangles referencing only 10 unique vertices means midpoints were
    // reused, not duplicated per triangle (which would need 4*4*3=48 distinct
    // vertex slots if every triangle owned its own copies).
    const usedIndices = new Set(result.indices);
    expect(usedIndices.size).toBe(10);
  });

  test("two levels compounds correctly (4x triangles, 4x again)", () => {
    const once = simpleSubdivide(tetrahedron());
    const twice = simpleSubdivide(once);
    expect(twice.indices.length / 3).toBe(4 * 4 * 4);
  });
});

describe("catmullClarkSubdivide", () => {
  test("produces V+F+E vertices and 2 triangles per quad, 3 quads per original face", () => {
    const result = catmullClarkSubdivide(tetrahedron());
    // V=4, F=4, E=6 -> 14 vertices; 4 faces * 3 corners * 2 tris = 24 triangles.
    expect(result.positions.length / 3).toBe(4 + 4 + 6);
    expect(result.indices.length / 3).toBe(4 * 3 * 2);
  });

  test("rounds the shape off — vertex points move toward the surface's interior, unlike simpleSubdivide", () => {
    const source = tetrahedron();
    const result = catmullClarkSubdivide(source);
    // The new point for original vertex 0 must have actually moved off (1,1,1).
    const moved =
      Math.abs(result.positions[0] - source.positions[0]) > 1e-6 ||
      Math.abs(result.positions[1] - source.positions[1]) > 1e-6 ||
      Math.abs(result.positions[2] - source.positions[2]) > 1e-6;
    expect(moved).toBe(true);
  });

  test("produces a watertight mesh — every edge of the output is shared by exactly two triangles", () => {
    const result = catmullClarkSubdivide(tetrahedron());
    const edgeCount = new Map<string, number>();
    for (let i = 0; i < result.indices.length; i += 3) {
      const tri = [result.indices[i], result.indices[i + 1], result.indices[i + 2]];
      for (let e = 0; e < 3; e++) {
        const a = tri[e];
        const b = tri[(e + 1) % 3];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      }
    }
    for (const count of edgeCount.values()) expect(count).toBe(2);
  });
});

describe("subdivide", () => {
  test("0 levels returns the mesh unchanged", () => {
    const source = tetrahedron();
    const result = subdivide(source, "simple", 0);
    expect(result.indices.length).toBe(source.indices.length);
  });

  test("applies the chosen algorithm the given number of times", () => {
    const result = subdivide(tetrahedron(), "catmull-clark", 2);
    const once = catmullClarkSubdivide(tetrahedron());
    const twice = catmullClarkSubdivide(once);
    expect(result.indices.length).toBe(twice.indices.length);
  });
});
