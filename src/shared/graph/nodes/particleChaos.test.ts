import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { PARTICLE_CURL_NOISE_NODE, PARTICLE_STRANGE_ATTRACTOR_NODE } from "./particleChaos";
import { CURVE_FROM_POINTS_NODE } from "./curve";
import { CURVE_TO_LINE_NODE } from "./line";

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

  it("supports all built-in attractor presets", () => {
    const types = ["aizawa", "thomas", "rossler", "halvorsen", "chen", "chua", "sprott", "four-wing"];
    for (const t of types) {
      const res = PARTICLE_STRANGE_ATTRACTOR_NODE.evaluate(
        {},
        { ...PARTICLE_STRANGE_ATTRACTOR_NODE.defaultParams, attractorType: t, steps: 150 },
        { ...CTX, nodeId: `attractor-${t}` },
      ) as any;
      expect(res.geometry).toBeDefined();
      expect(res.points.length).toBeGreaterThan(0);
    }
  });

  it("supports custom user-defined formula mode", () => {
    const res = PARTICLE_STRANGE_ATTRACTOR_NODE.evaluate(
      { paramA: 12.0 },
      {
        ...PARTICLE_STRANGE_ATTRACTOR_NODE.defaultParams,
        attractorType: "custom",
        customDx: "a * (y - x)",
        customDy: "x * (b - z) - y",
        customDz: "x * y - c * z",
        paramA: 12.0,
        paramB: 28.0,
        paramC: 2.666,
        steps: 300,
      },
      { ...CTX, nodeId: "attractor-custom" },
    ) as any;
    expect(res.geometry).toBeInstanceOf(THREE.Points);
    const pts = res.geometry as THREE.Points;
    expect(pts.geometry.attributes.position.count).toBe(300);
    expect(res.points.length).toBeGreaterThan(0);
  });

  it("gracefully falls back on malformed custom expressions without crashing", () => {
    const res = PARTICLE_STRANGE_ATTRACTOR_NODE.evaluate(
      {},
      {
        ...PARTICLE_STRANGE_ATTRACTOR_NODE.defaultParams,
        attractorType: "custom",
        customDx: "syntax error ((",
        steps: 100,
      },
      { ...CTX, nodeId: "attractor-error" },
    ) as any;
    expect(res.geometry).toBeDefined();
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

  it("attractor -> curve from points -> curve to line renders full trajectory", () => {
    // 1. Initial evaluate of Curve from Points (4 points) -> Curve to Line
    const crv1 = CURVE_FROM_POINTS_NODE.evaluate(
      {},
      CURVE_FROM_POINTS_NODE.defaultParams,
      { ...CTX, nodeId: "crv-test" },
    ) as any;
    const line1 = CURVE_TO_LINE_NODE.evaluate(
      { curve: crv1.curve },
      CURVE_TO_LINE_NODE.defaultParams,
      { ...CTX, nodeId: "line-test" },
    ) as any;
    const geom1 = line1.geometry.geometry;
    expect(geom1.instanceCount).toBe(256);
    // Simulate ThreeJS WebGLBindingStates after rendering geom1:
    geom1._maxInstanceCount = geom1.attributes.instanceStart.count;

    // 2. Now user connects Strange Attractor to Curve from Points
    const att = PARTICLE_STRANGE_ATTRACTOR_NODE.evaluate(
      {},
      PARTICLE_STRANGE_ATTRACTOR_NODE.defaultParams,
      { ...CTX, nodeId: "att-test" },
    ) as any;
    expect(att.points.length).toBe(2500);

    const crv2 = CURVE_FROM_POINTS_NODE.evaluate(
      { points: att.points },
      CURVE_FROM_POINTS_NODE.defaultParams,
      { ...CTX, nodeId: "crv-test" },
    ) as any;
    expect(crv2.curve.points.length).toBe(2500);

    const line2 = CURVE_TO_LINE_NODE.evaluate(
      { curve: crv2.curve },
      CURVE_TO_LINE_NODE.defaultParams,
      { ...CTX, nodeId: "line-test" },
    ) as any;
    const geom2 = line2.geometry.geometry;
    expect(geom2).not.toBe(geom1);
    expect(geom2.instanceCount).toBe(2500);
    expect(geom2._maxInstanceCount).toBeUndefined();
  });
});
