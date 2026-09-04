import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import {
  MATERIAL_THERMAL_NODE,
  MATERIAL_XRAY_NODE,
  MATERIAL_ENERGY_SHIELD_NODE,
  MATERIAL_STYLIZED_FIRE_NODE,
  MATERIAL_MIYAZAKI_CLOUD_NODE,
} from "./materialShadersVol2";
import { OBJECT_PLANE_NODE, OBJECT_SPHERE_NODE } from "./object";

const CTX: EvalContext = { time: 2.0, step: 0.016, nodeId: "vol2-test" };

describe("MATERIAL_THERMAL_NODE", () => {
  it("evaluates thermal shader with custom temperature range and new controls", () => {
    const res = MATERIAL_THERMAL_NODE.evaluate(
      {
        heatScale: 2.0,
        minTemp: 0.2,
        maxTemp: 0.8,
        coldColor: new THREE.Color(0x000033),
        hotColor: new THREE.Color(0xffffcc),
        shimmerSpeed: 2.5,
        enableDistortion: false,
      },
      MATERIAL_THERMAL_NODE.defaultParams,
      CTX,
    ) as any;
    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    expect(res.material.customMaterial.uniforms.heatScale.value).toBe(2.0);
    expect(res.material.customMaterial.uniforms.minTemp.value).toBe(0.2);
    expect(res.material.customMaterial.uniforms.maxTemp.value).toBe(0.8);
    expect(res.material.customMaterial.uniforms.coldColor.value.getHex()).toBe(0x000033);
    expect(res.material.customMaterial.uniforms.hotColor.value.getHex()).toBe(0xffffcc);
    expect(res.material.customMaterial.uniforms.shimmerSpeed.value).toBe(2.5);
    expect(res.material.customMaterial.uniforms.enableDistortion.value).toBe(0.0);
    expect(res.material.customMaterial.uniforms.time.value).toBe(2.0);
  });
});

describe("MATERIAL_XRAY_NODE", () => {
  it("evaluates X-Ray shader with custom tint, core color, rim power, and film grain", () => {
    const res = MATERIAL_XRAY_NODE.evaluate(
      {
        color: new THREE.Color(0x00ffcc),
        coreColor: new THREE.Color(0x001122),
        rimPower: 3.5,
        interiorOpacity: 0.2,
        noiseIntensity: 0.25,
        enableGrain: false,
      },
      MATERIAL_XRAY_NODE.defaultParams,
      CTX,
    ) as any;
    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    expect(res.material.customMaterial.uniforms.color.value.getHex()).toBe(0x00ffcc);
    expect(res.material.customMaterial.uniforms.coreColor.value.getHex()).toBe(0x001122);
    expect(res.material.customMaterial.uniforms.rimPower.value).toBe(3.5);
    expect(res.material.customMaterial.uniforms.interiorOpacity.value).toBe(0.2);
    expect(res.material.customMaterial.uniforms.noiseIntensity.value).toBe(0.25);
    expect(res.material.customMaterial.uniforms.enableGrain.value).toBe(0.0);
  });
});

describe("MATERIAL_ENERGY_SHIELD_NODE", () => {
  it("evaluates hexagonal shield shader and attaches to OBJECT_SPHERE_NODE", () => {
    const res = MATERIAL_ENERGY_SHIELD_NODE.evaluate(
      {
        hexScale: 16.0,
        edgeSharpness: 0.92,
        fresnelPower: 3.2,
        enableGrid: false,
        enablePulse: false,
      },
      MATERIAL_ENERGY_SHIELD_NODE.defaultParams,
      CTX,
    ) as any;
    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    expect(res.material.customMaterial.uniforms.hexScale.value).toBe(16.0);
    expect(res.material.customMaterial.uniforms.edgeSharpness.value).toBe(0.92);
    expect(res.material.customMaterial.uniforms.fresnelPower.value).toBe(3.2);
    expect(res.material.customMaterial.uniforms.enableGrid.value).toBe(0.0);
    expect(res.material.customMaterial.uniforms.enablePulse.value).toBe(0.0);

    const sphere = OBJECT_SPHERE_NODE.evaluate(
      { material: res.material },
      OBJECT_SPHERE_NODE.defaultParams,
      { ...CTX, nodeId: "shield-sphere" },
    );
    expect((sphere.geometry as THREE.Mesh).material).toBe(res.material.customMaterial);
  });
});

describe("MATERIAL_STYLIZED_FIRE_NODE", () => {
  it("evaluates stylized fire shader with parametric k and custom dynamics", () => {
    const res = MATERIAL_STYLIZED_FIRE_NODE.evaluate(
      {
        smoothness: 0.25, // k factor
        waveSpeed: 3.5,
        flameWidth: 0.45,
        flameHeight: 0.95,
        bubbleScale: 0.28,
        internalHoles: 0.8,
        bodyColor: new THREE.Color(0xff4400),
      },
      MATERIAL_STYLIZED_FIRE_NODE.defaultParams,
      CTX,
    ) as any;

    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    const uniforms = res.material.customMaterial.uniforms;
    expect(uniforms.smoothness.value).toBe(0.25);
    expect(uniforms.waveSpeed.value).toBe(3.5);
    expect(uniforms.flameWidth.value).toBe(0.45);
    expect(uniforms.flameHeight.value).toBe(0.95);
    expect(uniforms.bubbleScale.value).toBe(0.28);
    expect(uniforms.internalHoles.value).toBe(0.8);
    expect(uniforms.bodyColor.value.getHex()).toBe(0xff4400);
    expect(uniforms.time.value).toBe(2.0);
  });

  it("attaches stylized fire material onto an OBJECT_PLANE_NODE", () => {
    const res = MATERIAL_STYLIZED_FIRE_NODE.evaluate(
      {},
      MATERIAL_STYLIZED_FIRE_NODE.defaultParams,
      CTX,
    ) as any;

    const plane = OBJECT_PLANE_NODE.evaluate(
      { material: res.material },
      OBJECT_PLANE_NODE.defaultParams,
      { ...CTX, nodeId: "fire-plane" },
    );

    expect((plane.geometry as THREE.Mesh).material).toBe(res.material.customMaterial);
  });

  it("supports color component checkboxes and color softness parameter", () => {
    const res = MATERIAL_STYLIZED_FIRE_NODE.evaluate(
      {
        colorSoftness: 0.15,
        enableCore: false,
        enableInner: true,
        enableDark: false,
        enableOutline: false,
      },
      MATERIAL_STYLIZED_FIRE_NODE.defaultParams,
      CTX,
    ) as any;

    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    const uniforms = res.material.customMaterial.uniforms;
    expect(uniforms.colorSoftness.value).toBe(0.15);
    expect(uniforms.enableCore.value).toBe(0.0);
    expect(uniforms.enableInner.value).toBe(1.0);
    expect(uniforms.enableDark.value).toBe(0.0);
    expect(uniforms.enableOutline.value).toBe(0.0);
  });

  it("supports coreOffsetY, coreBaseMask and baseCurvature parameters", () => {
    const res = MATERIAL_STYLIZED_FIRE_NODE.evaluate(
      {
        coreOffsetY: -0.08,
        coreBaseMask: 1.2,
        baseCurvature: 1.6,
      },
      MATERIAL_STYLIZED_FIRE_NODE.defaultParams,
      CTX,
    ) as any;

    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    const uniforms = res.material.customMaterial.uniforms;
    expect(uniforms.coreOffsetY.value).toBe(-0.08);
    expect(uniforms.coreBaseMask.value).toBe(1.2);
    expect(uniforms.baseCurvature.value).toBe(1.6);
  });
});

describe("MATERIAL_MIYAZAKI_CLOUD_NODE", () => {
  it("evaluates Miyazaki cloud material with default and custom uniforms", () => {
    const res = MATERIAL_MIYAZAKI_CLOUD_NODE.evaluate(
      {
        seed: 42.0,
        cumulusHeight: 1.25,
        cloudWidth: 0.9,
        baseFlatness: 0.85,
        puffiness: 1.5,
        sunAngle: 45.0,
        sunElevation: 0.8,
        shadowIntensity: 0.9,
        bandSoftness: 0.05,
        highlightColor: new THREE.Color(0xfff5ea),
        bodyColor: new THREE.Color(0xf5efe0),
        shadowColor: new THREE.Color(0xb5c5c0),
        deepShadowColor: new THREE.Color(0x708098),
      },
      MATERIAL_MIYAZAKI_CLOUD_NODE.defaultParams,
      CTX,
    ) as any;

    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    const uniforms = res.material.customMaterial.uniforms;
    expect(uniforms.seed.value).toBe(42.0);
    expect(uniforms.cumulusHeight.value).toBe(1.25);
    expect(uniforms.cloudWidth.value).toBe(0.9);
    expect(uniforms.baseFlatness.value).toBe(0.85);
    expect(uniforms.puffiness.value).toBe(1.5);
    expect(uniforms.sunAngle.value).toBe(45.0);
    expect(uniforms.sunElevation.value).toBe(0.8);
    expect(uniforms.shadowIntensity.value).toBe(0.9);
    expect(uniforms.bandSoftness.value).toBe(0.05);
    expect(uniforms.highlightColor.value.getHex()).toBe(0xfff5ea);
    expect(uniforms.bodyColor.value.getHex()).toBe(0xf5efe0);
    expect(uniforms.shadowColor.value.getHex()).toBe(0xb5c5c0);
    expect(uniforms.deepShadowColor.value.getHex()).toBe(0x708098);
  });

  it("configures transparent background and attaches to OBJECT_PLANE_NODE", () => {
    const res = MATERIAL_MIYAZAKI_CLOUD_NODE.evaluate(
      {},
      MATERIAL_MIYAZAKI_CLOUD_NODE.defaultParams,
      CTX,
    ) as any;

    const mat = res.material.customMaterial as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.side).toBe(THREE.DoubleSide);

    const plane = OBJECT_PLANE_NODE.evaluate(
      { material: res.material },
      OBJECT_PLANE_NODE.defaultParams,
      { ...CTX, nodeId: "cloud-plane" },
    );

    expect((plane.geometry as THREE.Mesh).material).toBe(mat);
  });

  it("handles toggles for highlights, deep shadow, outline and micro-puffs", () => {
    const res = MATERIAL_MIYAZAKI_CLOUD_NODE.evaluate(
      {
        enableHighlight: false,
        enableDeepShadow: false,
        enableOutline: true,
        enablePuffs: false,
        outlineWidth: 0.02,
      },
      MATERIAL_MIYAZAKI_CLOUD_NODE.defaultParams,
      CTX,
    ) as any;

    const uniforms = res.material.customMaterial.uniforms;
    expect(uniforms.enableHighlight.value).toBe(0.0);
    expect(uniforms.enableDeepShadow.value).toBe(0.0);
    expect(uniforms.enableOutline.value).toBe(1.0);
    expect(uniforms.enablePuffs.value).toBe(0.0);
    expect(uniforms.outlineWidth.value).toBe(0.02);
  });
});

