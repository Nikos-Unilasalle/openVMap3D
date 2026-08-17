import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { MaterialValue } from "../sockets";
import { MATERIAL_NODE } from "./material";
import { extractMaterialParams, OBJECT_BOX_NODE } from "./object";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "test" };

describe("MATERIAL_NODE", () => {
  it("outputs a material descriptor from defaultParams when nothing is wired", () => {
    const res = MATERIAL_NODE.evaluate({}, MATERIAL_NODE.defaultParams, CTX) as { material: MaterialValue };
    expect(res.material.color.getHex()).toBe(0xffffff);
    expect(res.material.emissive.getHex()).toBe(0x000000);
    expect(res.material.roughness).toBeCloseTo(0.4);
    expect(res.material.metalness).toBeCloseTo(0.1);
    expect(res.material.opacity).toBeCloseTo(1);
    expect(res.material.shadeless).toBe(false);
    expect(res.material.wireframe).toBe(false);
  });

  it("reflects wired inputs over defaultParams", () => {
    const res = MATERIAL_NODE.evaluate(
      { color: new THREE.Color(0xff0000), roughness: 0.9, opacity: 0.5 },
      MATERIAL_NODE.defaultParams,
      CTX,
    ) as { material: MaterialValue };
    expect(res.material.color.getHex()).toBe(0xff0000);
    expect(res.material.roughness).toBeCloseTo(0.9);
    expect(res.material.opacity).toBeCloseTo(0.5);
  });
});

describe("material input priority", () => {
  it("extractMaterialParams prefers the connected material over internal params", () => {
    const connected: MaterialValue = {
      color: new THREE.Color(0x00ff00),
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 1,
      shadeless: false,
      roughness: 0.9,
      metalness: 0.2,
      wireframe: false,
      opacity: 0.5,
    };
    const res = extractMaterialParams(
      { material: connected, color: new THREE.Color(0x0000ff), roughness: 0.1 },
      { color: new THREE.Color(0xff0000), roughness: 0.2, opacity: 1 },
    );
    expect(res.color.getHex()).toBe(0x00ff00);
    expect(res.roughness).toBeCloseTo(0.9);
    expect(res.opacity).toBeCloseTo(0.5);
  });

  it("a box uses the connected material over its own color/roughness params", () => {
    const out = OBJECT_BOX_NODE.evaluate(
      { material: { color: new THREE.Color(0x00ff00), roughness: 0.7 } },
      { ...OBJECT_BOX_NODE.defaultParams, color: new THREE.Color(0xff0000), roughness: 0.1 },
      CTX,
    );
    const mat = (out.geometry as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0x00ff00);
    expect(mat.roughness).toBeCloseTo(0.7);
  });
});
