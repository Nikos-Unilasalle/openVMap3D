import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PARTICLES_TO_POINTS_NODE } from "./particlesToPoints";
import { PARTICLE_RENDER_INSTANCES_NODE } from "./particleInstances";
import { EvalContext } from "../types";

const CTX = (nodeId: string): EvalContext => ({ time: 0, step: 0, nodeId });

describe("PARTICLES_TO_POINTS_NODE", () => {
  it("returns empty lists with nothing wired", () => {
    const res = PARTICLES_TO_POINTS_NODE.evaluate({}, PARTICLES_TO_POINTS_NODE.defaultParams, CTX("p2p-a"));
    expect(res.xValues).toEqual([]);
    expect(res.yValues).toEqual([]);
    expect(res.zValues).toEqual([]);
    expect(res.points).toEqual([]);
    expect(res.count).toBe(0);
  });

  it("returns empty rather than throwing when a texture is wired but no renderer exists", () => {
    // Headless evaluation (tests, a renderer-less pass) must degrade, not crash.
    const res = PARTICLES_TO_POINTS_NODE.evaluate(
      { positions: new THREE.Texture(), count: 64 },
      PARTICLES_TO_POINTS_NODE.defaultParams,
      CTX("p2p-b"),
    );
    expect(res.count).toBe(0);
  });

  it("declares both list shapes its consumers need", () => {
    const ids = PARTICLES_TO_POINTS_NODE.outputs.map((o) => o.id);
    // x/y/z for Point Cloud and Emitter (From Points); points for Curve from Points.
    expect(ids).toEqual(expect.arrayContaining(["xValues", "yValues", "zValues", "points", "count"]));
  });
});

describe("PARTICLE_RENDER_INSTANCES_NODE", () => {
  it("builds an InstancedMesh even before a Shape is wired", () => {
    const res = PARTICLE_RENDER_INSTANCES_NODE.evaluate({}, PARTICLE_RENDER_INSTANCES_NODE.defaultParams, CTX("pri-a"));
    const mesh = res.geometry as THREE.InstancedMesh;
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
  });

  it("draws nothing when no particle texture is wired", () => {
    const res = PARTICLE_RENDER_INSTANCES_NODE.evaluate({}, PARTICLE_RENDER_INSTANCES_NODE.defaultParams, CTX("pri-b"));
    expect((res.geometry as THREE.InstancedMesh).count).toBe(0);
  });

  it("takes its geometry from the wired Shape mesh", () => {
    const shape = new THREE.Mesh(new THREE.ConeGeometry(1, 2, 8), new THREE.MeshStandardMaterial());
    const res = PARTICLE_RENDER_INSTANCES_NODE.evaluate(
      { shape, count: 16 },
      PARTICLE_RENDER_INSTANCES_NODE.defaultParams,
      CTX("pri-c"),
    );
    const mesh = res.geometry as THREE.InstancedMesh;
    // Cloned, not shared — the Shape node still owns and draws the original.
    expect(mesh.geometry).not.toBe(shape.geometry);
    expect(mesh.geometry.attributes.position.count).toBe(shape.geometry.attributes.position.count);
  });

  it("ignores a fat line wired into Shape rather than instancing its quad template", () => {
    // findFirstMesh refuses fat lines, so the node falls back to its default
    // box instead of instancing an 8-vertex template (see meshRequired.ts).
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const notALine = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    const res = PARTICLE_RENDER_INSTANCES_NODE.evaluate(
      { shape: notALine },
      PARTICLE_RENDER_INSTANCES_NODE.defaultParams,
      CTX("pri-d"),
    );
    expect(res.geometry).toBeInstanceOf(THREE.InstancedMesh);
  });

  it("applies a wired material like every other primitive node", () => {
    const res = PARTICLE_RENDER_INSTANCES_NODE.evaluate(
      { material: { color: new THREE.Color(0xff0000), roughness: 0.8 } },
      PARTICLE_RENDER_INSTANCES_NODE.defaultParams,
      CTX("pri-e"),
    );
    const mat = (res.geometry as THREE.InstancedMesh).material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0xff0000);
    expect(mat.roughness).toBeCloseTo(0.8);
  });
});
