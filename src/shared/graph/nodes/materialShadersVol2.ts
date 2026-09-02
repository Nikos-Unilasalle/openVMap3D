import * as THREE from "three";
import { createNodeCache } from "../nodeCaches";
import { NodeDefinition } from "../types";
import { asColor, numberInput } from "./object";
import {
  createThermalMaterial,
  createXRayMaterial,
  createEnergyShieldMaterial,
} from "../../three/shaders/creativeShadersVol2";

const thermalCache = createNodeCache<THREE.ShaderMaterial>((m) => m.dispose());
const xrayCache = createNodeCache<THREE.ShaderMaterial>((m) => m.dispose());
const shieldCache = createNodeCache<THREE.ShaderMaterial>((m) => m.dispose());

/** 1. Thermal / Infrared Camera Material Node */
export const MATERIAL_THERMAL_NODE: NodeDefinition = {
  type: "material/thermal",
  label: "Thermal Vision (FLIR)",
  category: "texture",
  inputs: [
    { id: "heatScale", label: "Heat Scale", type: "value" },
    { id: "minTemp", label: "Min Temp", type: "value" },
    { id: "maxTemp", label: "Max Temp", type: "value" },
    { id: "distortion", label: "Heat Shimmer", type: "value" },
    { id: "invert", label: "Invert (White Hot)", type: "value" },
  ],
  outputs: [{ id: "material", label: "Material", type: "material" }],
  defaultParams: {
    heatScale: 1.5,
    minTemp: 0.1,
    maxTemp: 0.9,
    distortion: 0.2,
    invert: false,
  },
  paramFields: [
    { id: "heatScale", label: "Heat Scale", kind: "number", step: 0.1 },
    { id: "minTemp", label: "Min Temp", kind: "number", step: 0.05 },
    { id: "maxTemp", label: "Max Temp", kind: "number", step: 0.05 },
    { id: "distortion", label: "Heat Shimmer", kind: "number", step: 0.05 },
    { id: "invert", label: "Invert (White Hot)", kind: "boolean" },
  ],
  evaluate: (inputs, params, ctx) => {
    let mat = thermalCache.get(ctx.nodeId);
    if (!mat) {
      mat = createThermalMaterial();
      (mat as any).__isSharedCustom = true;
      thermalCache.set(ctx.nodeId, mat);
    }

    mat.uniforms.heatScale.value = numberInput(inputs.heatScale, params.heatScale, 1.5);
    mat.uniforms.minTemp.value = numberInput(inputs.minTemp, params.minTemp, 0.1);
    mat.uniforms.maxTemp.value = numberInput(inputs.maxTemp, params.maxTemp, 0.9);
    mat.uniforms.distortion.value = numberInput(inputs.distortion, params.distortion, 0.2);
    mat.uniforms.invert.value = (inputs.invert !== undefined ? inputs.invert : params.invert) ? 1.0 : 0.0;
    mat.uniforms.time.value = ctx.time ?? 0;

    return {
      material: {
        customMaterial: mat,
      },
    };
  },
};

/** 2. X-Ray & Radiology Scanner Material Node */
export const MATERIAL_XRAY_NODE: NodeDefinition = {
  type: "material/xray",
  label: "X-Ray / Radiology",
  category: "texture",
  inputs: [
    { id: "color", label: "Tint Color", type: "color" },
    { id: "edgeIntensity", label: "Edge Intensity", type: "value" },
    { id: "interiorOpacity", label: "Interior Opacity", type: "value" },
    { id: "rimPower", label: "Rim Power", type: "value" },
  ],
  outputs: [{ id: "material", label: "Material", type: "material" }],
  defaultParams: {
    color: new THREE.Color(0x38bdf8),
    edgeIntensity: 2.0,
    interiorOpacity: 0.15,
    rimPower: 2.0,
  },
  paramFields: [
    { id: "color", label: "Tint Color", kind: "color" },
    { id: "edgeIntensity", label: "Edge Intensity", kind: "number", step: 0.2 },
    { id: "interiorOpacity", label: "Interior Opacity", kind: "number", step: 0.05 },
    { id: "rimPower", label: "Rim Power", kind: "number", step: 0.2 },
  ],
  evaluate: (inputs, params) => {
    let mat = xrayCache.get(params.nodeId as string || "default-xray");
    if (!mat) {
      mat = createXRayMaterial();
      (mat as any).__isSharedCustom = true;
      xrayCache.set(params.nodeId as string || "default-xray", mat);
    }

    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0x38bdf8)));
    mat.uniforms.color.value.copy(color);
    mat.uniforms.edgeIntensity.value = numberInput(inputs.edgeIntensity, params.edgeIntensity, 2.0);
    mat.uniforms.interiorOpacity.value = numberInput(inputs.interiorOpacity, params.interiorOpacity, 0.15);
    mat.uniforms.rimPower.value = numberInput(inputs.rimPower, params.rimPower, 2.0);

    return {
      material: {
        customMaterial: mat,
        color,
      },
    };
  },
};

/** 3. Hexagonal Energy Shield Material Node */
export const MATERIAL_ENERGY_SHIELD_NODE: NodeDefinition = {
  type: "material/energy-shield",
  label: "Energy Shield (Hex)",
  category: "texture",
  inputs: [
    { id: "shieldColor", label: "Shield Color", type: "color" },
    { id: "gridColor", label: "Hex Grid Color", type: "color" },
    { id: "hexScale", label: "Hex Scale", type: "value" },
    { id: "pulseSpeed", label: "Pulse Speed", type: "value" },
    { id: "pulseIntensity", label: "Pulse Intensity", type: "value" },
  ],
  outputs: [{ id: "material", label: "Material", type: "material" }],
  defaultParams: {
    shieldColor: new THREE.Color(0x00f3ff),
    gridColor: new THREE.Color(0xec4899),
    hexScale: 12.0,
    pulseSpeed: 2.5,
    pulseIntensity: 1.5,
  },
  paramFields: [
    { id: "shieldColor", label: "Shield Color", kind: "color" },
    { id: "gridColor", label: "Hex Grid Color", kind: "color" },
    { id: "hexScale", label: "Hex Scale", kind: "number", step: 1.0 },
    { id: "pulseSpeed", label: "Pulse Speed", kind: "number", step: 0.2 },
    { id: "pulseIntensity", label: "Pulse Intensity", kind: "number", step: 0.2 },
  ],
  evaluate: (inputs, params, ctx) => {
    let mat = shieldCache.get(ctx.nodeId);
    if (!mat) {
      mat = createEnergyShieldMaterial();
      (mat as any).__isSharedCustom = true;
      shieldCache.set(ctx.nodeId, mat);
    }

    const shieldColor = asColor(inputs.shieldColor, asColor(params.shieldColor, new THREE.Color(0x00f3ff)));
    const gridColor = asColor(inputs.gridColor, asColor(params.gridColor, new THREE.Color(0xec4899)));

    mat.uniforms.shieldColor.value.copy(shieldColor);
    mat.uniforms.gridColor.value.copy(gridColor);
    mat.uniforms.hexScale.value = numberInput(inputs.hexScale, params.hexScale, 12.0);
    mat.uniforms.pulseSpeed.value = numberInput(inputs.pulseSpeed, params.pulseSpeed, 2.5);
    mat.uniforms.pulseIntensity.value = numberInput(inputs.pulseIntensity, params.pulseIntensity, 1.5);
    mat.uniforms.time.value = ctx.time ?? 0;

    return {
      material: {
        customMaterial: mat,
        color: shieldColor,
      },
    };
  },
};
