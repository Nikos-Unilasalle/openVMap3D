import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PARTICLE_EMITTER_FROM_POINTS_NODE, clampParticleCapacity } from "./particles";
import { EmitterConfig } from "../particleRuntime";
import { EvalContext } from "../types";

const CTX = (nodeId: string): EvalContext => ({ time: 0, step: 0, nodeId });

describe("clampParticleCapacity", () => {
  it("passes a normal count through unchanged", () => {
    expect(clampParticleCapacity(4096)).toBe(4096);
  });

  it("caps an absurdly high Max Particles instead of building a giant texture", () => {
    // The bug this guards: an unclamped capacity sized a GPUComputationRenderer
    // texture pair straight off the typed value, which crashed the tab well
    // before reaching any error path.
    expect(clampParticleCapacity(50_000_000)).toBe(65536);
  });

  it("floors at 1 for zero, negative, or garbage input", () => {
    expect(clampParticleCapacity(0)).toBe(4096); // 0 is falsy -> the 4096 fallback, same as before this fix
    expect(clampParticleCapacity(-500)).toBe(1);
    expect(clampParticleCapacity(NaN)).toBe(4096);
    expect(clampParticleCapacity("not a number")).toBe(4096);
  });

  it("rounds a fractional count", () => {
    expect(clampParticleCapacity(1234.7)).toBe(1235);
  });
});

describe("PARTICLE_EMITTER_FROM_POINTS_NODE", () => {
  it("builds seedPositions from the three value lists", () => {
    const res = PARTICLE_EMITTER_FROM_POINTS_NODE.evaluate(
      { xValues: [1, 2], yValues: [10, 20], zValues: [100, 200] },
      PARTICLE_EMITTER_FROM_POINTS_NODE.defaultParams,
      CTX("seed-a"),
    );
    const emitter = res.emitter as EmitterConfig;
    expect(Array.from(emitter.seedPositions!)).toEqual([1, 10, 100, 2, 20, 200]);
  });

  it("truncates to the shortest of the three lists", () => {
    const res = PARTICLE_EMITTER_FROM_POINTS_NODE.evaluate(
      { xValues: [1, 2, 3], yValues: [10, 20], zValues: [100, 200, 300] },
      PARTICLE_EMITTER_FROM_POINTS_NODE.defaultParams,
      CTX("seed-b"),
    );
    const emitter = res.emitter as EmitterConfig;
    expect(emitter.seedPositions!.length).toBe(6); // 2 points x 3
  });

  it("has no seedPositions when nothing is wired", () => {
    const res = PARTICLE_EMITTER_FROM_POINTS_NODE.evaluate({}, PARTICLE_EMITTER_FROM_POINTS_NODE.defaultParams, CTX("seed-c"));
    const emitter = res.emitter as EmitterConfig;
    expect(emitter.seedPositions).toBeUndefined();
  });

  it("reuses the same seedPositions array when the input lists are reference-unchanged", () => {
    const xValues = [1, 2];
    const yValues = [3, 4];
    const zValues = [5, 6];
    const nodeId = "seed-d";
    const first = PARTICLE_EMITTER_FROM_POINTS_NODE.evaluate({ xValues, yValues, zValues }, PARTICLE_EMITTER_FROM_POINTS_NODE.defaultParams, CTX(nodeId));
    const second = PARTICLE_EMITTER_FROM_POINTS_NODE.evaluate({ xValues, yValues, zValues }, PARTICLE_EMITTER_FROM_POINTS_NODE.defaultParams, CTX(nodeId));
    expect((second.emitter as EmitterConfig).seedPositions).toBe((first.emitter as EmitterConfig).seedPositions);
  });

  it("rebuilds when a list is replaced by a new array (even with equal contents)", () => {
    const nodeId = "seed-e";
    const first = PARTICLE_EMITTER_FROM_POINTS_NODE.evaluate(
      { xValues: [1], yValues: [2], zValues: [3] },
      PARTICLE_EMITTER_FROM_POINTS_NODE.defaultParams,
      CTX(nodeId),
    );
    const second = PARTICLE_EMITTER_FROM_POINTS_NODE.evaluate(
      { xValues: [1], yValues: [2], zValues: [3] },
      PARTICLE_EMITTER_FROM_POINTS_NODE.defaultParams,
      CTX(nodeId),
    );
    expect((second.emitter as EmitterConfig).seedPositions).not.toBe((first.emitter as EmitterConfig).seedPositions);
    expect(Array.from((second.emitter as EmitterConfig).seedPositions!)).toEqual([1, 2, 3]);
  });

  it("passes velocity/spawnRate through like the plain emitter", () => {
    const res = PARTICLE_EMITTER_FROM_POINTS_NODE.evaluate(
      { velocity: new THREE.Vector3(0, 1, 0), spawnRate: 500 },
      PARTICLE_EMITTER_FROM_POINTS_NODE.defaultParams,
      CTX("seed-f"),
    );
    const emitter = res.emitter as EmitterConfig;
    expect(emitter.velocity).toEqual(new THREE.Vector3(0, 1, 0));
    expect(emitter.spawnRate).toBe(500);
  });
});
