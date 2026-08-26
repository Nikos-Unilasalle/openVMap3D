import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { EmitterConfig, activeParticleCount, buildEmitterConfig, initialAge, initialPosition, textureSizeFor } from "./particleRuntime";

describe("textureSizeFor", () => {
  test("returns the smallest square covering the requested capacity", () => {
    expect(textureSizeFor(4096)).toBe(64);
    expect(textureSizeFor(100)).toBe(10);
  });

  test("rounds up when capacity isn't a perfect square", () => {
    expect(textureSizeFor(101)).toBe(11);
  });

  test("never returns less than 1", () => {
    expect(textureSizeFor(0)).toBe(1);
    expect(textureSizeFor(-5)).toBe(1);
  });
});

describe("buildEmitterConfig", () => {
  test("bundles position, velocity and spawn rate as-is", () => {
    const position = new THREE.Vector3(1, 2, 3);
    const velocity = new THREE.Vector3(0, 5, 0);

    const config = buildEmitterConfig(position, velocity, 200);

    expect(config).toEqual({ position, velocity, spawnRate: 200, seedPositions: undefined, diameter: 0.25, randomSpawnPick: false, emit: true });
  });

  test("defaults diameter to 0.25 — the jitter magnitude every emitter used before this param existed", () => {
    const config = buildEmitterConfig(new THREE.Vector3(), new THREE.Vector3(), 200);
    expect(config.diameter).toBe(0.25);
  });

  test("accepts an explicit diameter", () => {
    const config = buildEmitterConfig(new THREE.Vector3(), new THREE.Vector3(), 200, undefined, 3);
    expect(config.diameter).toBe(3);
  });

  test("defaults to sequential spawn picking — the behavior that predates the flag", () => {
    expect(buildEmitterConfig(new THREE.Vector3(), new THREE.Vector3(), 200).randomSpawnPick).toBe(false);
  });

  test("emits by default — an unwired Emit input must not silence the emitter", () => {
    expect(buildEmitterConfig(new THREE.Vector3(), new THREE.Vector3(), 200).emit).toBe(true);
  });

  test("accepts random spawn picking", () => {
    const config = buildEmitterConfig(new THREE.Vector3(), new THREE.Vector3(), 200, undefined, undefined, true);
    expect(config.randomSpawnPick).toBe(true);
  });
});

describe("activeParticleCount", () => {
  test("follows the steady-state population = rate × lifetime relation", () => {
    expect(activeParticleCount(200, 3, 10_000)).toBe(600);
  });

  test("caps at the texture's capacity", () => {
    expect(activeParticleCount(1000, 10, 500)).toBe(500);
  });

  test("is zero for a non-positive lifetime", () => {
    expect(activeParticleCount(200, 0, 10_000)).toBe(0);
    expect(activeParticleCount(200, -1, 10_000)).toBe(0);
  });

  test("is never negative", () => {
    expect(activeParticleCount(-50, 3, 10_000)).toBe(0);
  });
});

describe("initialAge", () => {
  test("staggers the default (non-burst) start across one Lifetime — first texel at 0, last texel a full Lifetime in the past", () => {
    const capacity = 100;
    expect(initialAge(0, capacity, 3, false)).toBe(-0);
    expect(initialAge(50, capacity, 3, false)).toBeCloseTo(-1.5);
    expect(initialAge(99, capacity, 3, false)).toBeCloseTo(-2.97);
  });

  test("burstSpawn starts every texel at age 0 regardless of index — the whole population already alive on frame 0", () => {
    const capacity = 100;
    expect(initialAge(0, capacity, 3, true)).toBe(0);
    expect(initialAge(50, capacity, 3, true)).toBe(0);
    expect(initialAge(99, capacity, 3, true)).toBe(0);
  });
});

describe("initialPosition", () => {
  test("places burst-spawned particles at their seed points (Point Emitter From Points' cloud shape), not the origin", () => {
    // Regression test: without this, burstSpawn only set age=0 and left
    // position at the DataTexture's default (0,0,0) — every particle sat
    // glued to the origin until its FIRST respawn, which needs up to a full
    // Lifetime of simulated time to fire (POSITION_SHADER's `age >
    // myLifetime` branch is the only place a real spawn position is ever
    // assigned). Paired with "set Lifetime longer than the animation" (the
    // exact advice for "spawn once, then fall"), that respawn never
    // happened at all inside the visible window — every particle stayed
    // stacked at (0,0,0) forever, reading as "no particles".
    const seedPositions = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]); // 3 seed points
    const emitter: EmitterConfig = {
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(),
      spawnRate: 200,
      seedPositions,
      diameter: 0.25,
      randomSpawnPick: false,
      emit: true,
    };

    expect(initialPosition(0, emitter)).toEqual([1, 2, 3]);
    expect(initialPosition(1, emitter)).toEqual([4, 5, 6]);
    expect(initialPosition(2, emitter)).toEqual([7, 8, 9]);
    // Wraps sequentially past the seed count, same as the shader's own `mod(idx, seedCount)`.
    expect(initialPosition(3, emitter)).toEqual([1, 2, 3]);
  });

  test("falls back to the emitter's own position when there's no seed set (a plain point emitter, not From Points)", () => {
    const emitter: EmitterConfig = {
      position: new THREE.Vector3(10, 20, 30),
      velocity: new THREE.Vector3(),
      spawnRate: 200,
      diameter: 0.25,
      randomSpawnPick: false,
      emit: true,
    };
    expect(initialPosition(0, emitter)).toEqual([10, 20, 30]);
  });
});
