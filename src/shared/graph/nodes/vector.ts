import * as THREE from "three";
import { NodeDefinition } from "../types";

/** Three Values -> one Vector. What lets a single scalar (Time's seconds, a sensor reading) drive one axis of a Transform. */
export const VECTOR_COMPOSE_NODE: NodeDefinition = {
  type: "vector/compose",
  label: "Compose Vector",
  category: "math",
  inputs: [
    { id: "x", label: "X", type: "value" },
    { id: "y", label: "Y", type: "value" },
    { id: "z", label: "Z", type: "value" },
  ],
  outputs: [{ id: "out", label: "Out", type: "vector" }],
  defaultParams: { x: 0, y: 0, z: 0 },
  paramFields: [
    { id: "x", label: "X (fallback)", kind: "number" },
    { id: "y", label: "Y (fallback)", kind: "number" },
    { id: "z", label: "Z (fallback)", kind: "number" },
  ],
  evaluate: (inputs) => ({
    out: new THREE.Vector3(Number(inputs.x) || 0, Number(inputs.y) || 0, Number(inputs.z) || 0),
  }),
};

/** Inverse of Compose — a Vector's own axes as three separate Values. */
export const VECTOR_DECOMPOSE_NODE: NodeDefinition = {
  type: "vector/decompose",
  label: "Decompose Vector",
  category: "math",
  inputs: [{ id: "vector", label: "Vector", type: "vector" }],
  outputs: [
    { id: "x", label: "X", type: "value" },
    { id: "y", label: "Y", type: "value" },
    { id: "z", label: "Z", type: "value" },
  ],
  defaultParams: {},
  evaluate: (inputs) => {
    const v = inputs.vector instanceof THREE.Vector3 ? inputs.vector : new THREE.Vector3();
    return { x: v.x, y: v.y, z: v.z };
  },
};
