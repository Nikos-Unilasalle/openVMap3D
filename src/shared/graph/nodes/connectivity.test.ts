import { describe, expect, test } from "vitest";
import { Candidate, findConnections, isAliveParticle } from "./connectivity";

function pt(index: number, x: number, y: number, z = 0): Candidate {
  return { index, x, y, z };
}

describe("isAliveParticle", () => {
  test("excludes a texel still in its staggered pre-spawn delay", () => {
    // Same bug particleTrails.ts's isAlive guards: connecting this texel's
    // position (still world origin, not a real spot yet) drew lines to a
    // cluster of not-really-there particles during the first lifetime of
    // playback.
    expect(isAliveParticle(-0.001)).toBe(false);
    expect(isAliveParticle(-3)).toBe(false);
  });

  test("excludes the genuinely dead sentinel", () => {
    expect(isAliveParticle(-1.0e6)).toBe(false);
  });

  test("includes a real particle", () => {
    expect(isAliveParticle(0)).toBe(true);
    expect(isAliveParticle(5)).toBe(true);
  });
});

describe("findConnections", () => {
  test("connects two points within range", () => {
    const points = [pt(0, 0, 0), pt(1, 1, 0)];
    const edges = findConnections(points, 1.5, 6);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ a: 0, b: 1 });
  });

  test("does not connect points outside range", () => {
    const points = [pt(0, 0, 0), pt(1, 10, 0)];
    expect(findConnections(points, 1.5, 6)).toHaveLength(0);
  });

  test("every edge is within maxDistance", () => {
    const points = Array.from({ length: 40 }, (_, i) => pt(i, (i * 37) % 11, (i * 53) % 7, (i * 19) % 5));
    const maxDistance = 3;
    const edges = findConnections(points, maxDistance, 64);
    for (const e of edges) {
      expect(e.distanceSq).toBeLessThanOrEqual(maxDistance * maxDistance + 1e-9);
    }
  });

  test("never reports a self-connection or a duplicate pair", () => {
    // A tight cluster where every point is within range of every other —
    // exactly the case that would surface a self-edge or a double-counted
    // pair if the dedup key or the self-check were off by one.
    const points = [pt(0, 0, 0), pt(1, 0.1, 0), pt(2, 0.2, 0), pt(3, 0.1, 0.1)];
    const edges = findConnections(points, 5, 64);
    for (const e of edges) expect(e.a).not.toBe(e.b);

    const keys = edges.map((e) => (e.a < e.b ? `${e.a}:${e.b}` : `${e.b}:${e.a}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("caps each point at maxPerPoint, keeping the closest", () => {
    // One point at the origin, 5 others at increasing distance — with a cap
    // of 2, the origin's edges must be to its 2 nearest, not an arbitrary 2.
    const points = [
      pt(0, 0, 0),
      pt(1, 1, 0),
      pt(2, 2, 0),
      pt(3, 3, 0),
      pt(4, 4, 0),
      pt(5, 5, 0),
    ];
    const edges = findConnections(points, 10, 2);
    const fromOrigin = edges.filter((e) => e.a === 0 || e.b === 0);
    expect(fromOrigin).toHaveLength(2);
    const partners = fromOrigin.map((e) => (e.a === 0 ? e.b : e.a)).sort();
    expect(partners).toEqual([1, 2]);
  });

  test("union rule: an edge survives if either endpoint's cap includes it", () => {
    // b is a's single nearest neighbor, but b has many closer neighbors than
    // a (c, d, e) and a plain top-1 mutual intersection would drop a-b. The
    // union rule keeps it because a still ranks b first.
    const points = [
      pt(0, 0, 0), // a
      pt(1, 1, 0), // b — a's only, and nearest, neighbor
      pt(2, 1.1, 0), // c — closer to b than a is
      pt(3, 1.2, 0), // d — closer to b than a is
    ];
    const edges = findConnections(points, 5, 1);
    const hasAB = edges.some((e) => (e.a === 0 && e.b === 1) || (e.a === 1 && e.b === 0));
    expect(hasAB).toBe(true);
  });

  test("empty input produces no edges", () => {
    expect(findConnections([], 1, 6)).toHaveLength(0);
  });
});
