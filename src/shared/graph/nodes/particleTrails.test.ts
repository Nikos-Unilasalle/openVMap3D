import { describe, expect, it } from "vitest";
import { CAPTURE_TRAILS_NODE, effectiveHistoryLength } from "./particleTrails";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "trails-test" };

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
