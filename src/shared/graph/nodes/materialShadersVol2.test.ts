import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import {
  MATERIAL_THERMAL_NODE,
  MATERIAL_XRAY_NODE,
  MATERIAL_ENERGY_SHIELD_NODE,
} from "./materialShadersVol2";
import { OBJECT_SPHERE_NODE } from "./object";

const CTX: EvalContext = { time: 2.0, step: 0.016, nodeId: "vol2-test" };

describe("MATERIAL_THERMAL_NODE", () => {
  it("evaluates thermal shader with custom temperature range", () => {
    const res = MATERIAL_THERMAL_NODE.evaluate(
      { heatScale: 2.0, minTemp: 0.2, maxTemp: 0.8 },
      MATERIAL_THERMAL_NODE.defaultParams,
      CTX,
    ) as any;
    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    expect(res.material.customMaterial.uniforms.heatScale.value).toBe(2.0);
    expect(res.material.customMaterial.uniforms.minTemp.value).toBe(0.2);
    expect(res.material.customMaterial.uniforms.maxTemp.value).toBe(0.8);
    expect(res.material.customMaterial.uniforms.time.value).toBe(2.0);
  });
});

describe("MATERIAL_XRAY_NODE", () => {
  it("evaluates X-Ray shader with custom tint and rim power", () => {
    const res = MATERIAL_XRAY_NODE.evaluate(
      { color: new THREE.Color(0x00ffcc), rimPower: 3.5, interiorOpacity: 0.2 },
      MATERIAL_XRAY_NODE.defaultParams,
      CTX,
    ) as any;
    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    expect(res.material.customMaterial.uniforms.color.value.getHex()).toBe(0x00ffcc);
    expect(res.material.customMaterial.uniforms.rimPower.value).toBe(3.5);
    expect(res.material.customMaterial.uniforms.interiorOpacity.value).toBe(0.2);
  });
});

describe("MATERIAL_ENERGY_SHIELD_NODE", () => {
  it("evaluates hexagonal shield shader and attaches to OBJECT_SPHERE_NODE", () => {
    const res = MATERIAL_ENERGY_SHIELD_NODE.evaluate(
      { hexScale: 16.0 },
      MATERIAL_ENERGY_SHIELD_NODE.defaultParams,
      CTX,
    ) as any;
    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    expect(res.material.customMaterial.uniforms.hexScale.value).toBe(16.0);

    const sphere = OBJECT_SPHERE_NODE.evaluate(
      { material: res.material },
      OBJECT_SPHERE_NODE.defaultParams,
      { ...CTX, nodeId: "shield-sphere" },
    );
    expect((sphere.geometry as THREE.Mesh).material).toBe(res.material.customMaterial);
  });
});
