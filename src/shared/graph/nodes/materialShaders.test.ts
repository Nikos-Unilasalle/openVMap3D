import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import {
  MATERIAL_HOLOGRAM_NODE,
  MATERIAL_LIQUID_METAL_NODE,
  MATERIAL_CEL_SHADE_NODE,
  MATERIAL_IRIDESCENT_NODE,
  MATERIAL_WIREFRAME_PULSE_NODE,
} from "./materialShaders";
import { OBJECT_BOX_NODE, OBJECT_SPHERE_NODE } from "./object";

const CTX: EvalContext = { time: 1.5, step: 0.016, nodeId: "test-node" };

describe("MATERIAL_HOLOGRAM_NODE", () => {
  it("outputs a custom hologram material descriptor with updated uniforms", () => {
    const res = MATERIAL_HOLOGRAM_NODE.evaluate(
      { color: new THREE.Color(0xff00ff), scanlinesFrequency: 40.0, glitchStrength: 0.1 },
      MATERIAL_HOLOGRAM_NODE.defaultParams,
      CTX,
    ) as { material: { customMaterial: THREE.ShaderMaterial } };

    expect(res.material).toBeDefined();
    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    expect(res.material.customMaterial.uniforms.color.value.getHex()).toBe(0xff00ff);
    expect(res.material.customMaterial.uniforms.scanlinesFrequency.value).toBe(40.0);
    expect(res.material.customMaterial.uniforms.glitchStrength.value).toBe(0.1);
    expect(res.material.customMaterial.uniforms.time.value).toBe(1.5);
  });

  it("applies the hologram ShaderMaterial onto an OBJECT_BOX_NODE", () => {
    const holo = MATERIAL_HOLOGRAM_NODE.evaluate({}, MATERIAL_HOLOGRAM_NODE.defaultParams, CTX) as any;
    const box = OBJECT_BOX_NODE.evaluate(
      { material: holo.material },
      OBJECT_BOX_NODE.defaultParams,
      { ...CTX, nodeId: "box1" },
    );
    const mesh = box.geometry as THREE.Mesh;
    expect(mesh.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mesh.material).toBe(holo.material.customMaterial);
  });
});

describe("MATERIAL_LIQUID_METAL_NODE", () => {
  it("outputs liquid metal shader and configures fluid warp parameters", () => {
    const res = MATERIAL_LIQUID_METAL_NODE.evaluate(
      { baseColor: new THREE.Color(0x112233), speed: 2.0, warpScale: 5.0 },
      MATERIAL_LIQUID_METAL_NODE.defaultParams,
      CTX,
    ) as { material: { customMaterial: THREE.ShaderMaterial } };

    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    expect(res.material.customMaterial.uniforms.baseColor.value.getHex()).toBe(0x112233);
    expect(res.material.customMaterial.uniforms.speed.value).toBe(2.0);
    expect(res.material.customMaterial.uniforms.warpScale.value).toBe(5.0);
    expect(res.material.customMaterial.uniforms.time.value).toBe(1.5);
  });

  it("attaches cleanly to an OBJECT_SPHERE_NODE", () => {
    const liquid = MATERIAL_LIQUID_METAL_NODE.evaluate({}, MATERIAL_LIQUID_METAL_NODE.defaultParams, CTX) as any;
    const sphere = OBJECT_SPHERE_NODE.evaluate(
      { material: liquid.material },
      OBJECT_SPHERE_NODE.defaultParams,
      { ...CTX, nodeId: "sphere1" },
    );
    const mesh = sphere.geometry as THREE.Mesh;
    expect(mesh.material).toBe(liquid.material.customMaterial);
  });
});

describe("MATERIAL_CEL_SHADE_NODE", () => {
  it("outputs toon/cel-shading shader with halftone toggle and stepped bands", () => {
    const res = MATERIAL_CEL_SHADE_NODE.evaluate(
      { color: new THREE.Color(0x00ff88), bands: 4.0, halftone: 0 },
      MATERIAL_CEL_SHADE_NODE.defaultParams,
      CTX,
    ) as { material: { customMaterial: THREE.ShaderMaterial } };

    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    expect(res.material.customMaterial.uniforms.color.value.getHex()).toBe(0x00ff88);
    expect(res.material.customMaterial.uniforms.bands.value).toBe(4.0);
    expect(res.material.customMaterial.uniforms.halftone.value).toBe(0.0);
  });
});

describe("MATERIAL_IRIDESCENT_NODE", () => {
  it("outputs thin-film optical interference shader", () => {
    const res = MATERIAL_IRIDESCENT_NODE.evaluate(
      { filmThickness: 600.0, refractiveIndex: 1.6, boost: 2.0 },
      MATERIAL_IRIDESCENT_NODE.defaultParams,
      CTX,
    ) as { material: { customMaterial: THREE.ShaderMaterial } };

    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    expect(res.material.customMaterial.uniforms.filmThickness.value).toBe(600.0);
    expect(res.material.customMaterial.uniforms.refractiveIndex.value).toBe(1.6);
    expect(res.material.customMaterial.uniforms.boost.value).toBe(2.0);
  });
});

describe("MATERIAL_WIREFRAME_PULSE_NODE", () => {
  it("outputs barycentric pulse shader with traveling wave velocity", () => {
    const res = MATERIAL_WIREFRAME_PULSE_NODE.evaluate(
      { edgeColor: new THREE.Color(0xffaa00), pulseSpeed: 5.0, pulseLength: 2.5 },
      MATERIAL_WIREFRAME_PULSE_NODE.defaultParams,
      CTX,
    ) as { material: { customMaterial: THREE.ShaderMaterial } };

    expect(res.material.customMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    expect(res.material.customMaterial.uniforms.edgeColor.value.getHex()).toBe(0xffaa00);
    expect(res.material.customMaterial.uniforms.pulseSpeed.value).toBe(5.0);
    expect(res.material.customMaterial.uniforms.pulseLength.value).toBe(2.5);
    expect(res.material.customMaterial.uniforms.time.value).toBe(1.5);
  });
});
