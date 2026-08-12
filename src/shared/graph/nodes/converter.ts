import * as THREE from "three";
import { NodeDefinition } from "../types";

/** Value to Vector converter — broadcasts a scalar value into all 3 vector axes X, Y, Z. */
export const VALUE_TO_VECTOR_NODE: NodeDefinition = {
  type: "converter/value-to-vector",
  label: "Value to Vector",
  category: "converter",
  inputs: [{ id: "value", label: "Value", type: "value" }],
  outputs: [{ id: "vector", label: "Vector", type: "vector" }],
  defaultParams: { value: 0 },
  paramFields: [{ id: "value", label: "Value (fallback)", kind: "number" }],
  evaluate: (inputs, params) => {
    const v = inputs.value !== undefined ? Number(inputs.value) || 0 : Number(params.value) || 0;
    return { vector: new THREE.Vector3(v, v, v) };
  },
};

/** Color to Vector converter — maps Color R, G, B channels directly to Vector X, Y, Z coordinates. */
export const COLOR_TO_VECTOR_NODE: NodeDefinition = {
  type: "converter/color-to-vector",
  label: "Color to Vector",
  category: "converter",
  inputs: [{ id: "color", label: "Color", type: "color" }],
  outputs: [{ id: "vector", label: "Vector", type: "vector" }],
  defaultParams: {},
  evaluate: (inputs) => {
    const c = inputs.color instanceof THREE.Color ? inputs.color : new THREE.Color(0xffffff);
    return { vector: new THREE.Vector3(c.r, c.g, c.b) };
  },
};

/** Vector to Color converter — maps Vector X, Y, Z coordinates directly to Color R, G, B channels. */
export const VECTOR_TO_COLOR_NODE: NodeDefinition = {
  type: "converter/vector-to-color",
  label: "Vector to Color",
  category: "converter",
  inputs: [{ id: "vector", label: "Vector", type: "vector" }],
  outputs: [{ id: "color", label: "Color", type: "color" }],
  defaultParams: {},
  evaluate: (inputs) => {
    const v = inputs.vector instanceof THREE.Vector3 ? inputs.vector : new THREE.Vector3();
    const color = new THREE.Color(
      Math.min(1, Math.max(0, v.x)),
      Math.min(1, Math.max(0, v.y)),
      Math.min(1, Math.max(0, v.z)),
    );
    return { color };
  },
};

/** Value to Color converter — converts a scalar value (0..1) into a grayscale THREE.Color. */
export const VALUE_TO_COLOR_NODE: NodeDefinition = {
  type: "converter/value-to-color",
  label: "Value to Color",
  category: "converter",
  inputs: [{ id: "value", label: "Value", type: "value" }],
  outputs: [{ id: "color", label: "Color", type: "color" }],
  defaultParams: { value: 1 },
  paramFields: [{ id: "value", label: "Value (0..1)", kind: "number" }],
  evaluate: (inputs, params) => {
    const v = Math.min(
      1,
      Math.max(0, inputs.value !== undefined ? Number(inputs.value) || 0 : Number(params.value) || 1),
    );
    return { color: new THREE.Color(v, v, v) };
  },
};
