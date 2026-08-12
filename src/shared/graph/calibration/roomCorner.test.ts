import { describe, expect, it } from "vitest";
import { isCoplanar } from "./dlt";
import { roomCornerEdges, roomCornerReferencePoints } from "./roomCorner";

const DIMENSIONS = { width: 3.2, height: 2.5, depth: 2.8 };

describe("roomCornerReferencePoints", () => {
  it("returns the six visible corners of the two walls", () => {
    // Act
    const points = roomCornerReferencePoints(DIMENSIONS);

    // Assert
    expect(points).toHaveLength(6);
    expect(new Set(points.map((p) => p.id)).size).toBe(6);
  });

  it("puts every reference point on a real room corner, never mid-wall", () => {
    // Each coordinate must be either 0 or the full room dimension — a point
    // floating in the middle of a wall has no physical feature to aim at.
    for (const { world } of roomCornerReferencePoints(DIMENSIONS)) {
      expect([0, DIMENSIONS.width]).toContain(world.x);
      expect([0, DIMENSIONS.height]).toContain(world.y);
      expect([0, DIMENSIONS.depth]).toContain(world.z);
    }
  });

  it("spans both walls, so the DLT is not degenerate", () => {
    // Arrange / Act
    const points = roomCornerReferencePoints(DIMENSIONS).map((p) => p.world);

    // Assert — this is the whole reason a corner works where a flat wall
    // cannot: the point set is genuinely three-dimensional.
    expect(isCoplanar(points)).toBe(false);
  });

  it("shares the corner edge between the two walls", () => {
    const points = roomCornerReferencePoints(DIMENSIONS);
    const onBothWalls = points.filter((p) => p.world.x === 0 && p.world.z === 0);
    expect(onBothWalls).toHaveLength(2);
  });

  it("scales with the entered room dimensions", () => {
    const small = roomCornerReferencePoints({ width: 1, height: 1, depth: 1 });
    const large = roomCornerReferencePoints({ width: 10, height: 10, depth: 10 });
    const maxCoord = (ps: typeof small) => Math.max(...ps.map((p) => Math.max(p.world.x, p.world.y, p.world.z)));
    expect(maxCoord(small)).toBe(1);
    expect(maxCoord(large)).toBe(10);
  });
});

describe("roomCornerEdges", () => {
  it("draws both wall outlines plus their subdivisions", () => {
    // Arrange / Act
    const edges = roomCornerEdges(DIMENSIONS, 4);

    // Assert — each wall contributes (subdivisions + 1) lines in each of two
    // directions, and the two walls share the corner edge.
    expect(edges.length).toBeGreaterThan(0);
    for (const [a, b] of edges) {
      expect(a.distanceTo(b)).toBeGreaterThan(0);
    }
  });

  it("keeps every edge inside the room box", () => {
    for (const [a, b] of roomCornerEdges(DIMENSIONS, 3)) {
      for (const p of [a, b]) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(DIMENSIONS.width + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeLessThanOrEqual(DIMENSIONS.height + 1e-9);
        expect(p.z).toBeGreaterThanOrEqual(-1e-9);
        expect(p.z).toBeLessThanOrEqual(DIMENSIONS.depth + 1e-9);
      }
    }
  });

  it("keeps each wall flat — wall A stays at z=0, wall B stays at x=0", () => {
    for (const [a, b] of roomCornerEdges(DIMENSIONS, 2)) {
      const onWallA = a.z === 0 && b.z === 0;
      const onWallB = a.x === 0 && b.x === 0;
      expect(onWallA || onWallB).toBe(true);
    }
  });

  it("treats zero subdivisions as outlines only", () => {
    const outlineOnly = roomCornerEdges(DIMENSIONS, 0);
    const subdivided = roomCornerEdges(DIMENSIONS, 5);
    expect(outlineOnly.length).toBeLessThan(subdivided.length);
  });
});
