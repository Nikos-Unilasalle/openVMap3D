import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SPAWN_NODE } from "./spawn";
import { PARTICLE_RENDER_INSTANCES_NODE } from "./particleInstances";
import { PARTICLE_EMITTER_NODE } from "./particles";
import { EmitterConfig } from "../particleRuntime";
import { EvalContext } from "../types";

const CTX = (nodeId: string): EvalContext => ({ time: 0, step: 0, nodeId });

const item = () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());

describe("Spawner accepts explicit point positions (the point-cloud → scatter bridge)", () => {
  it("places one copy per point, with no Support surface wired at all", () => {
    const res = SPAWN_NODE.evaluate(
      { items: item(), xValues: [0, 5, 10], yValues: [0, 1, 2], zValues: [0, 0, 0] },
      SPAWN_NODE.defaultParams,
      CTX("sp-a"),
    );
    const group = res.geometry as THREE.Group;
    expect(group.children.length).toBe(3);
  });

  it("puts the copies at the given coordinates", () => {
    const res = SPAWN_NODE.evaluate(
      { items: item(), xValues: [7], yValues: [3], zValues: [-2] },
      { ...SPAWN_NODE.defaultParams, scaleMin: 1, scaleMax: 1, rotYVar: 0, dispersion: 0 },
      CTX("sp-b"),
    );
    const copy = (res.geometry as THREE.Group).children[0];
    const pos = new THREE.Vector3().setFromMatrixPosition(copy.matrix);
    expect(pos.x).toBeCloseTo(7, 4);
    expect(pos.y).toBeCloseTo(3, 4);
    expect(pos.z).toBeCloseTo(-2, 4);
  });

  it("truncates to the shortest list rather than reading past its end", () => {
    const res = SPAWN_NODE.evaluate(
      { items: item(), xValues: [0, 1, 2, 3], yValues: [0, 1], zValues: [0, 1, 2] },
      SPAWN_NODE.defaultParams,
      CTX("sp-c"),
    );
    expect((res.geometry as THREE.Group).children.length).toBe(2);
  });

  it("still samples the surface when no lists are wired", () => {
    const support = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial());
    const res = SPAWN_NODE.evaluate(
      { items: item(), support },
      { ...SPAWN_NODE.defaultParams, count: 12 },
      CTX("sp-d"),
    );
    expect((res.geometry as THREE.Group).children.length).toBe(12);
  });

  it("spawns nothing when given neither positions nor a surface", () => {
    const res = SPAWN_NODE.evaluate({ items: item() }, SPAWN_NODE.defaultParams, CTX("sp-e"));
    expect((res.geometry as THREE.Group).children.length).toBe(0);
  });
});

describe("Particle Emitter Emit gate", () => {
  it("emits by default, so an unwired Emit input never silences the emitter", () => {
    const res = PARTICLE_EMITTER_NODE.evaluate({}, PARTICLE_EMITTER_NODE.defaultParams, CTX("em-a"));
    expect((res.emitter as EmitterConfig).emit).toBe(true);
  });

  it("stops emitting when a wired value goes low — what a Trigger/Toggle/Oscillator drives", () => {
    const res = PARTICLE_EMITTER_NODE.evaluate({ emit: 0 }, PARTICLE_EMITTER_NODE.defaultParams, CTX("em-b"));
    expect((res.emitter as EmitterConfig).emit).toBe(false);
  });

  it("resumes when the wired value goes high again", () => {
    const res = PARTICLE_EMITTER_NODE.evaluate({ emit: 1 }, PARTICLE_EMITTER_NODE.defaultParams, CTX("em-c"));
    expect((res.emitter as EmitterConfig).emit).toBe(true);
  });

  it("honours the param when nothing is wired", () => {
    const res = PARTICLE_EMITTER_NODE.evaluate({}, { ...PARTICLE_EMITTER_NODE.defaultParams, emit: 0 }, CTX("em-d"));
    expect((res.emitter as EmitterConfig).emit).toBe(false);
  });
});

describe("Particle Render (Instances) Freeze", () => {
  it("does not rebuild the mesh while frozen, so the baked instances survive", () => {
    const nodeId = "fz-a";
    const shapeA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const live = PARTICLE_RENDER_INSTANCES_NODE.evaluate(
      { shape: shapeA, count: 8 },
      PARTICLE_RENDER_INSTANCES_NODE.defaultParams,
      CTX(nodeId),
    );
    const meshBefore = live.geometry as THREE.InstancedMesh;

    // Freeze on, and the Shape swapped underneath — a rebuild here would
    // throw away exactly the matrices freezing exists to preserve.
    const shapeB = new THREE.Mesh(new THREE.ConeGeometry(1, 2, 8), new THREE.MeshStandardMaterial());
    const frozen = PARTICLE_RENDER_INSTANCES_NODE.evaluate(
      { shape: shapeB, count: 64 },
      { ...PARTICLE_RENDER_INSTANCES_NODE.defaultParams, freeze: true },
      CTX(nodeId),
    );
    expect(frozen.geometry).toBe(meshBefore);
  });

  it("still builds a mesh if freeze is on before one ever existed", () => {
    const res = PARTICLE_RENDER_INSTANCES_NODE.evaluate(
      {},
      { ...PARTICLE_RENDER_INSTANCES_NODE.defaultParams, freeze: true },
      CTX("fz-b"),
    );
    expect(res.geometry).toBeInstanceOf(THREE.InstancedMesh);
  });
});
