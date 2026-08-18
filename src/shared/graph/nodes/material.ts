import * as THREE from "three";
import { NodeDefinition } from "../types";
import { COMMON_MATERIAL_PARAM_FIELDS, extractMaterialParams } from "./object";

/** Standard Material node — a reusable surface description wired into an object's `material` input. */
export const MATERIAL_NODE: NodeDefinition = {
  type: "material/standard",
  label: "Material",
  category: "texture",
  inputs: [
    { id: "color", label: "Color", type: "color" },
    { id: "emissive", label: "Emissive Color", type: "color" },
    { id: "emissiveIntensity", label: "Emissive Intensity", type: "value" },
    { id: "shadeless", label: "Shadeless", type: "value" },
    { id: "roughness", label: "Roughness", type: "value" },
    { id: "metalness", label: "Metalness", type: "value" },
    { id: "wireframe", label: "Wireframe", type: "value" },
    { id: "opacity", label: "Opacity", type: "value" },
    { id: "transmission", label: "Transmission (Glass)", type: "value" },
    { id: "thickness", label: "Glass Thickness", type: "value" },
  ],
  outputs: [{ id: "material", label: "Material", type: "material" }],
  defaultParams: {
    color: new THREE.Color(0xffffff),
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 1.0,
    shadeless: 0,
    roughness: 0.4,
    metalness: 0.1,
    wireframe: 0,
    opacity: 1.0,
    transmission: 0,
    thickness: 0.5,
  },
  paramFields: [...COMMON_MATERIAL_PARAM_FIELDS],
  evaluate: (inputs, params) => ({ material: extractMaterialParams(inputs, params) }),
};
