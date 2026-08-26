import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  PARTICLE_EMITTER_FROM_POINTS_NODE,
  PARTICLE_EMITTER_FROM_SURFACE_NODE,
  PARTICLE_EMITTER_NODE,
  PARTICLE_RENDER_NODE,
  POINTS_TO_PARTICLES_NODE,
  clampParticleCapacity,
} from "./particles";
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

  it("turns Random Spawn Point off from the panel-stored 0", () => {
    // The param panel stores booleans as 1/0 numbers, so a strict `!== false`
    // check could never turn random spawning off once the user unchecked it.
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const res = PARTICLE_EMITTER_FROM_SURFACE_NODE.evaluate(
      { geometry: mesh },
      { ...PARTICLE_EMITTER_FROM_SURFACE_NODE.defaultParams, randomSpawnPick: 0 },
      CTX("surf-f"),
    );
    expect((res.emitter as EmitterConfig).randomSpawnPick).toBe(false);
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

  it("resolves Random Spawn Point from the panel-stored 1", () => {
    const res = PARTICLE_EMITTER_FROM_POINTS_NODE.evaluate(
      { xValues: [0, 1], yValues: [0, 1], zValues: [0, 1] },
      { ...PARTICLE_EMITTER_FROM_POINTS_NODE.defaultParams, randomSpawnPick: 1 },
      CTX("seed-g"),
    );
    expect((res.emitter as EmitterConfig).randomSpawnPick).toBe(true);
  });
});

describe("PARTICLE_RENDER_NODE", () => {
  it("applies the Fade Size / Fade Opacity toggles stored as panel 1/0", () => {
    const res = PARTICLE_RENDER_NODE.evaluate(
      { count: 4 },
      { ...PARTICLE_RENDER_NODE.defaultParams, sprite: "none", fadeSize: 1, fadeOpacity: 1 },
      CTX("render-fade"),
    );
    const material = (res.geometry as THREE.Points).material as THREE.ShaderMaterial;
    expect(material.uniforms.fadeSize.value).toBe(1);
    expect(material.uniforms.fadeOpacity.value).toBe(1);
  });

  it("keeps the fades off when the toggles are unchecked (panel-stored 0)", () => {
    const res = PARTICLE_RENDER_NODE.evaluate(
      { count: 4 },
      { ...PARTICLE_RENDER_NODE.defaultParams, sprite: "none", fadeSize: 0, fadeOpacity: 0 },
      CTX("render-nofade"),
    );
    const material = (res.geometry as THREE.Points).material as THREE.ShaderMaterial;
    expect(material.uniforms.fadeSize.value).toBe(0);
    expect(material.uniforms.fadeOpacity.value).toBe(0);
  });
});

describe("POINTS_TO_PARTICLES_NODE", () => {
  it("carries every point as a seed position, with pointCount matching exactly", () => {
    const res = POINTS_TO_PARTICLES_NODE.evaluate(
      { xValues: [0, 1, 2], yValues: [10, 11, 12], zValues: [20, 21, 22] },
      POINTS_TO_PARTICLES_NODE.defaultParams,
      CTX("pts-a"),
    );
    const emitter = res.emitter as EmitterConfig;
    expect(emitter.pointCount).toBe(3);
    expect(Array.from(emitter.seedPositions!)).toEqual([0, 10, 20, 1, 11, 21, 2, 12, 22]);
  });

  it("always spawns (emit is unconditionally true — no gate, no Emit input at all)", () => {
    const res = POINTS_TO_PARTICLES_NODE.evaluate(
      { xValues: [0], yValues: [0], zValues: [0] },
      POINTS_TO_PARTICLES_NODE.defaultParams,
      CTX("pts-b"),
    );
    expect((res.emitter as EmitterConfig).emit).toBe(true);
  });

  it("pointCount is 0 with nothing wired in — no particles, not a crash", () => {
    const res = POINTS_TO_PARTICLES_NODE.evaluate({}, POINTS_TO_PARTICLES_NODE.defaultParams, CTX("pts-c"));
    const emitter = res.emitter as EmitterConfig;
    expect(emitter.pointCount).toBe(0);
    expect(emitter.seedPositions).toBeUndefined();
  });

  it("reuses the same seedPositions array when the input lists are reference-identical, same caching rule as Point Emitter", () => {
    const nodeId = "pts-d";
    const xValues = [1, 2];
    const yValues = [3, 4];
    const zValues = [5, 6];
    const first = POINTS_TO_PARTICLES_NODE.evaluate({ xValues, yValues, zValues }, POINTS_TO_PARTICLES_NODE.defaultParams, CTX(nodeId));
    const second = POINTS_TO_PARTICLES_NODE.evaluate({ xValues, yValues, zValues }, POINTS_TO_PARTICLES_NODE.defaultParams, CTX(nodeId));
    expect((first.emitter as EmitterConfig).seedPositions).toBe((second.emitter as EmitterConfig).seedPositions);
  });

  it("takes an initial velocity from the fallback param", () => {
    const res = POINTS_TO_PARTICLES_NODE.evaluate(
      { xValues: [0], yValues: [0], zValues: [0] },
      { ...POINTS_TO_PARTICLES_NODE.defaultParams, velocity: new THREE.Vector3(1, 2, 3) },
      CTX("pts-e"),
    );
    const velocity = (res.emitter as EmitterConfig).velocity;
    expect([velocity.x, velocity.y, velocity.z]).toEqual([1, 2, 3]);
  });

  describe("Spawn Frame", () => {
    const inputs = { xValues: [0], yValues: [0], zValues: [0] };
    const paramsAt = (spawnFrame: number) => ({ ...POINTS_TO_PARTICLES_NODE.defaultParams, spawnFrame });

    it("gate is closed before Spawn Frame", () => {
      const res = POINTS_TO_PARTICLES_NODE.evaluate(inputs, paramsAt(30), { time: 1, step: 30, nodeId: "pts-f", currentFrame: 10 });
      expect((res.emitter as EmitterConfig).emit).toBe(false);
    });

    it("gate opens exactly on Spawn Frame", () => {
      const res = POINTS_TO_PARTICLES_NODE.evaluate(inputs, paramsAt(30), { time: 1, step: 30, nodeId: "pts-g", currentFrame: 30 });
      expect((res.emitter as EmitterConfig).emit).toBe(true);
    });

    it("is a level, not a pulse — stays open on every frame after Spawn Frame, not just the one it opened on", () => {
      // The exact bug this param exists to avoid: a one-shot Trigger wired
      // into a plain Emitter's Emit socket fires once and drops back to
      // false — any particle that later dies (age > Lifetime) then finds
      // the gate already closed again and never respawns. Spawn Frame reads
      // as "has the timeline reached this frame yet", which never closes
      // again once true.
      const res = POINTS_TO_PARTICLES_NODE.evaluate(inputs, paramsAt(30), { time: 5, step: 150, nodeId: "pts-h", currentFrame: 150 });
      expect((res.emitter as EmitterConfig).emit).toBe(true);
    });

    it("defaults to always-open (spawnFrame 0) when there's no currentFrame in context at all (headless evaluate, no timeline driving it)", () => {
      const res = POINTS_TO_PARTICLES_NODE.evaluate(inputs, POINTS_TO_PARTICLES_NODE.defaultParams, CTX("pts-i"));
      expect((res.emitter as EmitterConfig).emit).toBe(true);
    });

    it("closing the gate again on rewind (scrubbing back before Spawn Frame) is exactly what re-arms a fresh burst on the next pass", () => {
      const before = POINTS_TO_PARTICLES_NODE.evaluate(inputs, paramsAt(30), { time: 2, step: 60, nodeId: "pts-j", currentFrame: 5 });
      expect((before.emitter as EmitterConfig).emit).toBe(false);
    });
  });
});
