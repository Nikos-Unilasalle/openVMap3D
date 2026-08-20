import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PARTICLE_EMITTER_FROM_POINTS_NODE, PARTICLE_EMITTER_FROM_SURFACE_NODE, PARTICLE_EMITTER_NODE, clampParticleCapacity } from "./particles";
import { EmitterConfig } from "../particleRuntime";
import { EvalContext } from "../types";

const CTX = (nodeId: string): EvalContext => ({ time: 0, step: 0, nodeId });

describe("PARTICLE_EMITTER_NODE", () => {
  it("defaults diameter to 0.25", () => {
    const res = PARTICLE_EMITTER_NODE.evaluate({}, PARTICLE_EMITTER_NODE.defaultParams, CTX("emit-a"));
    expect((res.emitter as EmitterConfig).diameter).toBe(0.25);
  });

  it("passes a param diameter through", () => {
    const res = PARTICLE_EMITTER_NODE.evaluate({}, { ...PARTICLE_EMITTER_NODE.defaultParams, diameter: 2 }, CTX("emit-b"));
    expect((res.emitter as EmitterConfig).diameter).toBe(2);
  });

  it("prefers a wired diameter input over the param", () => {
    const res = PARTICLE_EMITTER_NODE.evaluate({ diameter: 5 }, { ...PARTICLE_EMITTER_NODE.defaultParams, diameter: 2 }, CTX("emit-c"));
    expect((res.emitter as EmitterConfig).diameter).toBe(5);
  });

  it("clamps a negative diameter to 0 rather than passing it through", () => {
    const res = PARTICLE_EMITTER_NODE.evaluate({}, { ...PARTICLE_EMITTER_NODE.defaultParams, diameter: -3 }, CTX("emit-d"));
    expect((res.emitter as EmitterConfig).diameter).toBe(0);
  });

  it("has no seedPositions — the plain emitter never seeds from a point list", () => {
    const res = PARTICLE_EMITTER_NODE.evaluate({}, PARTICLE_EMITTER_NODE.defaultParams, CTX("emit-e"));
    expect((res.emitter as EmitterConfig).seedPositions).toBeUndefined();
  });
});

describe("PARTICLE_EMITTER_FROM_SURFACE_NODE", () => {
  it("has no seedPositions with nothing wired", () => {
    const res = PARTICLE_EMITTER_FROM_SURFACE_NODE.evaluate({}, PARTICLE_EMITTER_FROM_SURFACE_NODE.defaultParams, CTX("surf-a"));
    const emitter = res.emitter as EmitterConfig;
    expect(emitter.seedPositions).toBeUndefined();
  });

  it("samples the requested number of surface points", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const res = PARTICLE_EMITTER_FROM_SURFACE_NODE.evaluate(
      { geometry: mesh },
      { ...PARTICLE_EMITTER_FROM_SURFACE_NODE.defaultParams, points: 30, seed: 1 },
      CTX("surf-b"),
    );
    const emitter = res.emitter as EmitterConfig;
    expect(emitter.seedPositions!.length).toBe(30 * 3);
  });

  it("samples points that actually sit on the box's surface", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)); // extent -1..1 on every axis
    const res = PARTICLE_EMITTER_FROM_SURFACE_NODE.evaluate(
      { geometry: mesh },
      { ...PARTICLE_EMITTER_FROM_SURFACE_NODE.defaultParams, points: 50, seed: 2 },
      CTX("surf-c"),
    );
    const seed = (res.emitter as EmitterConfig).seedPositions!;
    for (let i = 0; i < seed.length; i += 3) {
      const [x, y, z] = [seed[i], seed[i + 1], seed[i + 2]];
      // On the surface of a 2x2x2 box centered at origin: every point has at
      // least one coordinate at +/-1, and none exceed it.
      expect(Math.max(Math.abs(x), Math.abs(y), Math.abs(z))).toBeCloseTo(1, 5);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const params = { ...PARTICLE_EMITTER_FROM_SURFACE_NODE.defaultParams, points: 10, seed: 7 };
    const a = PARTICLE_EMITTER_FROM_SURFACE_NODE.evaluate({ geometry: mesh }, params, CTX("surf-e1"));
    const b = PARTICLE_EMITTER_FROM_SURFACE_NODE.evaluate({ geometry: mesh }, params, CTX("surf-e2"));
    expect(Array.from((a.emitter as EmitterConfig).seedPositions!)).toEqual(Array.from((b.emitter as EmitterConfig).seedPositions!));
  });
});

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
