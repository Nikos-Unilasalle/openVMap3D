import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SPAWN_NODE } from "./spawn";
import { PARTICLE_RENDER_INSTANCES_NODE, bakeInstances } from "./particleInstances";
import { PARTICLE_EMITTER_NODE, resolveEmit } from "./particles";
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

describe("resolveEmit — 'only when driven' stops production when the wire is pulled", () => {
  const always = { emit: 1, emitMode: "always" };
  const driven = { emit: 1, emitMode: "only when driven" };

  it("always-mode keeps emitting with nothing wired (no existing graph regresses)", () => {
    expect(resolveEmit({}, always, new Set())).toBe(true);
  });

  it("driven-mode stops with nothing wired — disconnecting the trigger halts production", () => {
    expect(resolveEmit({}, driven, new Set())).toBe(false);
  });

  it("driven-mode follows the wire while it is connected", () => {
    expect(resolveEmit({ emit: 1 }, driven, new Set(["emit"]))).toBe(true);
    expect(resolveEmit({ emit: 0 }, driven, new Set(["emit"]))).toBe(false);
  });

  it("a connected wire carrying 0 stops emission in either mode", () => {
    expect(resolveEmit({ emit: 0 }, always, new Set(["emit"]))).toBe(false);
  });

  it("falls back to the presence of a value when the engine gives no connection set", () => {
    expect(resolveEmit({ emit: 1 }, driven, undefined)).toBe(true);
    expect(resolveEmit({}, driven, undefined)).toBe(false);
  });
});

describe("Particle Render (Instances) Bake to Mesh", () => {
  it("hands back a real, vertex-addressable Mesh — not an InstancedMesh", () => {
    const nodeId = "bk-a";
    const shape = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    PARTICLE_RENDER_INSTANCES_NODE.evaluate(
      { shape, count: 4 },
      PARTICLE_RENDER_INSTANCES_NODE.defaultParams,
      CTX(nodeId),
    );
    const baked = PARTICLE_RENDER_INSTANCES_NODE.evaluate(
      { shape, count: 4 },
      { ...PARTICLE_RENDER_INSTANCES_NODE.defaultParams, bake: true },
      CTX(nodeId),
    ).geometry as THREE.Mesh;

    expect(baked).toBeInstanceOf(THREE.Mesh);
    expect(baked).not.toBeInstanceOf(THREE.InstancedMesh);
  });

  it("flattens live instances into one merged, vertex-addressable geometry", () => {
    // bakeInstances directly: the node path needs a live GPU readback to have
    // any instances at all, so with no renderer it would bake an empty mesh —
    // correct, but it would not exercise the merge.
    const source = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
      3,
    );
    source.count = 3;
    const m = new THREE.Matrix4();
    for (let i = 0; i < 3; i++) source.setMatrixAt(i, m.makeTranslation(i * 10, 0, 0));

    const baked = bakeInstances(source, "bake-unit");
    const boxVerts = new THREE.BoxGeometry(1, 1, 1).attributes.position.count;

    expect(baked).not.toBeInstanceOf(THREE.InstancedMesh);
    // The point of baking: Boolean/Subdivide/Lattice can act on this.
    expect(baked.geometry.attributes.position.count).toBe(boxVerts * 3);

    // Each instance's own matrix is baked into the vertices, so the merged
    // geometry actually spans the three placements.
    baked.geometry.computeBoundingBox();
    expect(baked.geometry.boundingBox!.max.x).toBeCloseTo(20.5, 3);
  });

  it("holds the same baked object across frames rather than re-baking", () => {
    const nodeId = "bk-b";
    const params = { ...PARTICLE_RENDER_INSTANCES_NODE.defaultParams, bake: true };
    const first = PARTICLE_RENDER_INSTANCES_NODE.evaluate({ count: 4 }, params, CTX(nodeId)).geometry;
    const second = PARTICLE_RENDER_INSTANCES_NODE.evaluate({ count: 4 }, params, CTX(nodeId)).geometry;
    expect(second).toBe(first);
  });

  it("drops the snapshot when Bake is switched off, so re-enabling takes a fresh one", () => {
    const nodeId = "bk-c";
    const on = { ...PARTICLE_RENDER_INSTANCES_NODE.defaultParams, bake: true };
    const off = { ...PARTICLE_RENDER_INSTANCES_NODE.defaultParams, bake: false };
    const first = PARTICLE_RENDER_INSTANCES_NODE.evaluate({ count: 4 }, on, CTX(nodeId)).geometry;
    PARTICLE_RENDER_INSTANCES_NODE.evaluate({ count: 4 }, off, CTX(nodeId));
    const second = PARTICLE_RENDER_INSTANCES_NODE.evaluate({ count: 4 }, on, CTX(nodeId)).geometry;
    expect(second).not.toBe(first);
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
