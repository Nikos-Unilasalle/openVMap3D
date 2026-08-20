import { describe, expect, it } from "vitest";
import { CAPTURE_TRAILS_NODE, bucketFor, bucketOpacity, effectiveHistoryLength, isAlive } from "./particleTrails";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "trails-test" };

describe("bucketFor / bucketOpacity — tail fades to transparent, not black", () => {
  it("puts the tail (t=0) in the most transparent bucket", () => {
    const index = bucketFor(0, 6);
    expect(index).toBe(0);
    expect(bucketOpacity(0.8, index, 6)).toBeCloseTo(0.8 / 6);
  });

  it("puts the head (t=1) in the last, full-opacity bucket", () => {
    const index = bucketFor(1, 6);
    expect(index).toBe(5);
    expect(bucketOpacity(0.8, index, 6)).toBeCloseTo(0.8);
  });

  it("never returns an out-of-range bucket for any t in [0, 1]", () => {
    for (let i = 0; i <= 10; i++) {
      const index = bucketFor(i / 10, 6);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(6);
    }
  });

  it("opacity strictly increases from tail to head — no bucket is ever fully opaque except the last", () => {
    const opacities = Array.from({ length: 6 }, (_, i) => bucketOpacity(1, i, 6));
    for (let i = 1; i < opacities.length; i++) expect(opacities[i]).toBeGreaterThan(opacities[i - 1]);
    expect(opacities[opacities.length - 1]).toBeCloseTo(1);
  });
});

describe("isAlive", () => {
  it("excludes a texel still in its staggered pre-spawn delay", () => {
    // The bug this guards: recording this texel's position (still the
    // texture's zeroed default, world origin — not a real particle location
    // yet) into the trail history produced one huge fast segment the moment
    // the texel took its real first spawn, staggered across roughly the
    // first lifetime of playback.
    expect(isAlive(-0.001)).toBe(false);
    expect(isAlive(-3)).toBe(false);
  });

  it("excludes the genuinely dead sentinel", () => {
    expect(isAlive(-1.0e6)).toBe(false);
  });

  it("includes a real, just-spawned or long-lived particle", () => {
    expect(isAlive(0)).toBe(true);
    expect(isAlive(0.001)).toBe(true);
    expect(isAlive(5)).toBe(true);
  });
});

describe("effectiveHistoryLength", () => {
  it("grants the full requested history for a handful of particles", () => {
    expect(effectiveHistoryLength(600, 8)).toBe(600);
  });

  it("no longer floors History Length to ~10 for the default emitter's population", () => {
    // The regression this guards: Particle Emitter's default spawnRate (200)
    // with a modest 10s lifetime is 2000 active particles — routine, not an
    // edge case — and the old 20000 segment cap floored every trail to 10
    // samples regardless of what History Length said. "Raising Lifetime for
    // a longer-lived trail also raises the population" is inherent to the
    // sim (activeParticleCount = spawnRate x lifetime); this node's cap
    // shouldn't compound that into looking like a broken slider.
    expect(effectiveHistoryLength(600, 2000)).toBeGreaterThan(100);
  });

  it("still protects against a genuinely enormous population", () => {
    expect(effectiveHistoryLength(5000, 500000)).toBeLessThan(50);
  });

  it("never returns less than 2 (the minimum needed to draw a segment)", () => {
    expect(effectiveHistoryLength(5000, 10_000_000)).toBeGreaterThanOrEqual(2);
  });
});

describe("CAPTURE_TRAILS_NODE", () => {
  it("hands back an empty list of lists with nothing wired", () => {
    const res = CAPTURE_TRAILS_NODE.evaluate({}, CAPTURE_TRAILS_NODE.defaultParams, CTX);
    expect(res.trails).toEqual([]);
    expect(res.geometry).toBeDefined();
    expect(res.segmentCount).toBe(0);
  });

  it("declares a single dynamic list-of-lists output, not one per particle", () => {
    const ids = CAPTURE_TRAILS_NODE.outputs.map((o) => o.id);
    expect(ids).toContain("trails");
    expect(ids).not.toContain("trail0");
  });
});
