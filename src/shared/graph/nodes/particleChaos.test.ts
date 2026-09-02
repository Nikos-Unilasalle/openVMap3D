import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { PARTICLE_CURL_NOISE_NODE, PARTICLE_STRANGE_ATTRACTOR_NODE } from "./particleChaos";

const CTX: EvalContext = { time: 0.5, step: 0.016, nodeId: "chaos-test" };

describe("PARTICLE_CURL_NOISE_NODE", () => {
  it("outputs a valid turbulence force field descriptor", () => {
    const res = PARTICLE_CURL_NOISE_NODE.evaluate(
      { strength: 4.5, scale: 1.2, speed: 0.3 },
      PARTICLE_CURL_NOISE_NODE.defaultParams,
      CTX,
    ) as any;
    expect(res.field).toBeDefined();
    expect(res.field.type).toBe("turbulence");
    expect(res.field.strength).toBe(4.5);
    expect(res.field.scale).toBe(1.2);
    expect(res.field.speed).toBe(0.3);
  });
});

describe("PARTICLE_STRANGE_ATTRACTOR_NODE", () => {
  it("generates Lorenz attractor points and point list", () => {
    const res = PARTICLE_STRANGE_ATTRACTOR_NODE.evaluate(
      { steps: 500 },
      { ...PARTICLE_STRANGE_ATTRACTOR_NODE.defaultParams, attractorType: "lorenz", steps: 500 },
      CTX,
    ) as any;
    expect(res.geometry).toBeInstanceOf(THREE.Points);
    const pts = res.geometry as THREE.Points;
    expect(pts.geometry.attributes.position.count).toBe(500);
    expect(res.points).toBeDefined();
    expect(Array.isArray(res.points)).toBe(true);
    expect(res.points.length).toBeGreaterThan(0);
    expect(res.matrix).toBeInstanceOf(THREE.Matrix4);
    expect(pts.visible).toBe(true);
  });

  it("can render as continuous 3D line", () => {
    const res = PARTICLE_STRANGE_ATTRACTOR_NODE.evaluate(
      {},
      { ...PARTICLE_STRANGE_ATTRACTOR_NODE.defaultParams, renderMode: "line", steps: 200 },
      CTX,
    ) as any;
    expect(res.geometry).toBeInstanceOf(THREE.Line);
  });

  it("supports Aizawa and Thomas attractors", () => {
    const aizawa = PARTICLE_STRANGE_ATTRACTOR_NODE.evaluate(
      {},
      { ...PARTICLE_STRANGE_ATTRACTOR_NODE.defaultParams, attractorType: "aizawa", steps: 200 },
      CTX,
    ) as any;
    expect(aizawa.geometry).toBeDefined();

    const thomas = PARTICLE_STRANGE_ATTRACTOR_NODE.evaluate(
      {},
      { ...PARTICLE_STRANGE_ATTRACTOR_NODE.defaultParams, attractorType: "thomas", steps: 200 },
      CTX,
    ) as any;
    expect(thomas.geometry).toBeDefined();
  });

  it("applies transform location and visibility", () => {
    const res = PARTICLE_STRANGE_ATTRACTOR_NODE.evaluate(
      { visible: 0, location: new THREE.Vector3(5, 10, 15) },
      { ...PARTICLE_STRANGE_ATTRACTOR_NODE.defaultParams, steps: 100 },
      { ...CTX, nodeId: "attractor-trans" },
    ) as any;
    const obj = res.geometry as THREE.Object3D;
    expect(obj.visible).toBe(false);
    expect(obj.position.x).toBe(5);
    expect(obj.position.y).toBe(10);
    expect(obj.position.z).toBe(15);
  });
});
