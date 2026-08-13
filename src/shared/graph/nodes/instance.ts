import * as THREE from "three";
import { NodeDefinition } from "../types";

const groupCache = new Map<string, THREE.Group>();

function getGroup(nodeId: string): THREE.Group {
  const existing = groupCache.get(nodeId);
  if (existing) return existing;
  const group = new THREE.Group();
  groupCache.set(nodeId, group);
  return group;
}

function asColor(v: unknown, fallback: THREE.Color): THREE.Color {
  if (v instanceof THREE.Color) return v;
  if (typeof v === "object" && v !== null && "r" in v && "g" in v && "b" in v) {
    const { r, g, b } = v as { r: number; g: number; b: number };
    return new THREE.Color(r, g, b);
  }
  if (typeof v === "string" || typeof v === "number") {
    try {
      return new THREE.Color(v as any);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function asVector(v: unknown, fallback: THREE.Vector3): THREE.Vector3 {
  if (v instanceof THREE.Vector3) return v;
  if (typeof v === "number") return new THREE.Vector3(v, v, v);
  return fallback;
}

/** Helper to get top-level instance elements from a geometry (or children if it's a Group) */
function getInstances(source: THREE.Object3D): THREE.Object3D[] {
  if (source instanceof THREE.Group && source.children.length > 0) {
    return source.children;
  }
  return [source];
}

/**
 * Set Instance Color node — applies individual colors to each object/instance in a geometry pack.
 * Colors are driven by a List of colors (e.g. from Color Palette or Random List).
 */
export const SET_INSTANCE_COLOR_NODE: NodeDefinition = {
  type: "structure/instance-color",
  label: "Set Instance Color",
  category: "structure",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "colors", label: "Colors", type: "list" },
    { id: "color", label: "Default Color", type: "color" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { color: new THREE.Color(0xffffff) },
  paramFields: [{ id: "color", label: "Default Color", kind: "color" }],
  evaluate: (inputs, params, ctx) => {
    const group = getGroup(ctx.nodeId);
    group.clear();

    const source = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!source) return { geometry: group };

    const instances = getInstances(source);
    const colorsList = Array.isArray(inputs.colors) ? inputs.colors : [];
    const defaultColor = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffffff)));

    instances.forEach((instance, i) => {
      const clone = instance.clone(true);

      const targetColor = colorsList.length > 0
        ? asColor(colorsList[i % colorsList.length], defaultColor)
        : defaultColor;

      // Apply color to all meshes and lights inside this instance
      clone.traverse((child) => {
        if (child instanceof THREE.Light) {
          child.color.copy(targetColor);
        }
        if (child instanceof THREE.Mesh && child.material) {
          child.material = (child.material as THREE.Material).clone();
          if ("color" in child.material) {
            (child.material as THREE.MeshStandardMaterial).color.copy(targetColor);
          }
        }
      });

      group.add(clone);
    });

    return { geometry: group };
  },
};

/**
 * Set Instance Transform node — applies per-instance position, rotation, scale or matrix transformations
 * to each object/instance in a geometry pack (driven by Lists).
 */
export const SET_INSTANCE_TRANSFORM_NODE: NodeDefinition = {
  type: "structure/instance-transform",
  label: "Set Instance Transform",
  category: "structure",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "positions", label: "Positions", type: "list" },
    { id: "rotations", label: "Rotations", type: "list" },
    { id: "scales", label: "Scales", type: "list" },
    { id: "matrices", label: "Matrices", type: "list" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { mode: "relative" },
  paramFields: [
    { id: "mode", label: "Transform Mode", kind: "select", options: ["relative", "absolute"] },
  ],
  evaluate: (inputs, params, ctx) => {
    const group = getGroup(ctx.nodeId);
    group.clear();

    const source = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!source) return { geometry: group };

    const instances = getInstances(source);
    const positionsList = Array.isArray(inputs.positions) ? inputs.positions : [];
    const rotationsList = Array.isArray(inputs.rotations) ? inputs.rotations : [];
    const scalesList = Array.isArray(inputs.scales) ? inputs.scales : [];
    const matricesList = Array.isArray(inputs.matrices) ? inputs.matrices : [];

    const mode = String(params.mode || "relative");

    instances.forEach((instance, i) => {
      const clone = instance.clone(true);

      // Check matrix override
      if (matricesList[i] instanceof THREE.Matrix4) {
        const mat = matricesList[i] as THREE.Matrix4;
        if (mode === "absolute") {
          clone.matrixAutoUpdate = false;
          clone.matrix.copy(mat);
        } else {
          clone.matrixAutoUpdate = false;
          clone.matrix.multiplyMatrices(mat, clone.matrix);
        }
      } else {
        // Individual position, rotation, scale overrides
        const posOffset = positionsList[i] !== undefined
          ? asVector(positionsList[i], new THREE.Vector3())
          : new THREE.Vector3();

        const rotOffset = rotationsList[i] !== undefined
          ? asVector(rotationsList[i], new THREE.Vector3())
          : new THREE.Vector3();

        const scaleVal = scalesList[i] !== undefined
          ? asVector(scalesList[i], new THREE.Vector3(1, 1, 1))
          : new THREE.Vector3(1, 1, 1);

        const deltaMat = new THREE.Matrix4();
        const euler = new THREE.Euler(
          (rotOffset.x * Math.PI) / 180,
          (rotOffset.y * Math.PI) / 180,
          (rotOffset.z * Math.PI) / 180
        );
        deltaMat.compose(posOffset, new THREE.Quaternion().setFromEuler(euler), scaleVal);

        const wrapper = new THREE.Group();
        wrapper.matrixAutoUpdate = false;

        if (mode === "absolute") {
          wrapper.matrix.copy(deltaMat);
        } else {
          wrapper.matrix.copy(deltaMat);
        }
        wrapper.add(clone);
        group.add(wrapper);
        return;
      }

      group.add(clone);
    });

    return { geometry: group };
  },
};

/**
 * Get Instance node — extracts an individual object/instance from a geometry pack by index,
 * and outputs total instance count.
 */
export const GET_INSTANCE_NODE: NodeDefinition = {
  type: "structure/get-instance",
  label: "Get Instance",
  category: "structure",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "index", label: "Index", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "count", label: "Count", type: "value" },
  ],
  defaultParams: { index: 0 },
  paramFields: [{ id: "index", label: "Index", kind: "number", step: 1 }],
  evaluate: (inputs, params, ctx) => {
    const group = getGroup(ctx.nodeId);
    group.clear();

    const source = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!source) return { geometry: group, count: 0 };

    const instances = getInstances(source);
    const count = instances.length;

    const rawIndex = inputs.index !== undefined ? Number(inputs.index) : Number(params.index);
    const index = Math.max(0, Math.floor(isNaN(rawIndex) ? 0 : rawIndex)) % count;

    const selectedInstance = instances[index];
    if (selectedInstance) {
      group.add(selectedInstance.clone(true));
    }

    return { geometry: group, count };
  },
};
