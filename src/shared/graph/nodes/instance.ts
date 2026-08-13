import * as THREE from "three";
import { NodeDefinition } from "../types";
import { createNodeCache, disposeObject3D } from "../nodeCaches";

const groupCache = createNodeCache<THREE.Group>(disposeObject3D);

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
  if (typeof v === "object" && v !== null && "x" in v && "y" in v) {
    const obj = v as { x: number; y: number; z?: number };
    return new THREE.Vector3(Number(obj.x) || 0, Number(obj.y) || 0, Number(obj.z) || 0);
  }
  return fallback;
}

function listValueAt(list: unknown[], index: number, fallback: number): number {
  if (index < list.length) {
    const val = Number(list[index]);
    return Number.isFinite(val) ? val : fallback;
  }
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

function resolveScalarOrListItem(inputVal: unknown, index: number, fallback: number): number {
  if (Array.isArray(inputVal)) {
    return listValueAt(inputVal, index, fallback);
  }
  if (inputVal !== undefined && inputVal !== null) {
    const num = Number(inputVal);
    if (Number.isFinite(num)) return num;
  }
  return fallback;
}

/**
 * Set Instance Transform node — applies per-instance or global position, rotation, scale or matrix transformations
 * to each object/instance in a geometry pack (driven by single X, Y, Z defaults/inputs, or Lists of vectors/scalars/matrices).
 */
export const SET_INSTANCE_TRANSFORM_NODE: NodeDefinition = {
  type: "structure/instance-transform",
  label: "Set Instance Transform",
  category: "structure",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "positions", label: "Positions (Vector List)", type: "list" },
    { id: "posX", label: "Pos X", type: "any" },
    { id: "posY", label: "Pos Y", type: "any" },
    { id: "posZ", label: "Pos Z", type: "any" },
    { id: "rotations", label: "Rotations (Vector List)", type: "list" },
    { id: "rotX", label: "Rot X (°)", type: "any" },
    { id: "rotY", label: "Rot Y (°)", type: "any" },
    { id: "rotZ", label: "Rot Z (°)", type: "any" },
    { id: "scales", label: "Scales (Vector List)", type: "list" },
    { id: "scaleX", label: "Scale X", type: "any" },
    { id: "scaleY", label: "Scale Y", type: "any" },
    { id: "scaleZ", label: "Scale Z", type: "any" },
    { id: "matrices", label: "Matrices (List)", type: "list" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {
    mode: "relative",
    posX: 0,
    posY: 0,
    posZ: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  },
  paramFields: [
    { id: "mode", label: "Transform Mode", kind: "select", options: ["relative", "absolute"], group: "Transform Defaults" },
    { id: "posX", label: "Pos X", kind: "number", step: 0.1, group: "Transform Defaults" },
    { id: "posY", label: "Pos Y", kind: "number", step: 0.1, group: "Transform Defaults" },
    { id: "posZ", label: "Pos Z", kind: "number", step: 0.1, group: "Transform Defaults" },
    { id: "rotX", label: "Rot X (°)", kind: "number", step: 1, group: "Transform Defaults" },
    { id: "rotY", label: "Rot Y (°)", kind: "number", step: 1, group: "Transform Defaults" },
    { id: "rotZ", label: "Rot Z (°)", kind: "number", step: 1, group: "Transform Defaults" },
    { id: "scaleX", label: "Scale X", kind: "number", step: 0.1, group: "Transform Defaults" },
    { id: "scaleY", label: "Scale Y", kind: "number", step: 0.1, group: "Transform Defaults" },
    { id: "scaleZ", label: "Scale Z", kind: "number", step: 0.1, group: "Transform Defaults" },
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

    const paramPX = Number(params.posX) || 0;
    const paramPY = Number(params.posY) || 0;
    const paramPZ = Number(params.posZ) || 0;

    const paramRX = Number(params.rotX) || 0;
    const paramRY = Number(params.rotY) || 0;
    const paramRZ = Number(params.rotZ) || 0;

    const paramSX = params.scaleX !== undefined ? Number(params.scaleX) : 1;
    const paramSY = params.scaleY !== undefined ? Number(params.scaleY) : 1;
    const paramSZ = params.scaleZ !== undefined ? Number(params.scaleZ) : 1;

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
        // Base vectors from vector list or origin/identity
        const basePos = positionsList[i] !== undefined
          ? asVector(positionsList[i], new THREE.Vector3(0, 0, 0))
          : new THREE.Vector3(0, 0, 0);

        const posOffset = new THREE.Vector3(
          resolveScalarOrListItem(inputs.posX, i, basePos.x + paramPX),
          resolveScalarOrListItem(inputs.posY, i, basePos.y + paramPY),
          resolveScalarOrListItem(inputs.posZ, i, basePos.z + paramPZ),
        );

        // Rotation offset (Euler angles in degrees)
        const baseRot = rotationsList[i] !== undefined
          ? asVector(rotationsList[i], new THREE.Vector3(0, 0, 0))
          : new THREE.Vector3(0, 0, 0);

        const rotOffset = new THREE.Vector3(
          resolveScalarOrListItem(inputs.rotX, i, baseRot.x + paramRX),
          resolveScalarOrListItem(inputs.rotY, i, baseRot.y + paramRY),
          resolveScalarOrListItem(inputs.rotZ, i, baseRot.z + paramRZ),
        );

        // Scale
        const baseScale = scalesList[i] !== undefined
          ? asVector(scalesList[i], new THREE.Vector3(1, 1, 1))
          : new THREE.Vector3(1, 1, 1);

        const scaleVal = new THREE.Vector3(
          resolveScalarOrListItem(inputs.scaleX, i, baseScale.x * paramSX),
          resolveScalarOrListItem(inputs.scaleY, i, baseScale.y * paramSY),
          resolveScalarOrListItem(inputs.scaleZ, i, baseScale.z * paramSZ),
        );

        const deltaMat = new THREE.Matrix4();
        const euler = new THREE.Euler(
          (rotOffset.x * Math.PI) / 180,
          (rotOffset.y * Math.PI) / 180,
          (rotOffset.z * Math.PI) / 180
        );
        deltaMat.compose(posOffset, new THREE.Quaternion().setFromEuler(euler), scaleVal);

        const wrapper = new THREE.Group();
        wrapper.matrixAutoUpdate = false;
        wrapper.matrix.copy(deltaMat);
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

/**
 * Geometry Transform node — applies matrix, location, rotation, scale transformations directly to an incoming geometry stream.
 */
export const GEOMETRY_TRANSFORM_NODE: NodeDefinition = {
  type: "structure/geometry-transform",
  label: "Geometry Transform",
  category: "structure",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "location", label: "Location", type: "vector" },
    { id: "posX", label: "Pos X", type: "value" },
    { id: "posY", label: "Pos Y", type: "value" },
    { id: "posZ", label: "Pos Z", type: "value" },
    { id: "rotation", label: "Rotation", type: "vector" },
    { id: "rotX", label: "Rot X (°)", type: "value" },
    { id: "rotY", label: "Rot Y (°)", type: "value" },
    { id: "rotZ", label: "Rot Z (°)", type: "value" },
    { id: "scale", label: "Scale", type: "vector" },
    { id: "scaleX", label: "Scale X", type: "value" },
    { id: "scaleY", label: "Scale Y", type: "value" },
    { id: "scaleZ", label: "Scale Z", type: "value" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {
    mode: "relative",
    location: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
    posX: 0,
    posY: 0,
    posZ: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  },
  paramFields: [
    { id: "mode", label: "Mode", kind: "select", options: ["relative", "absolute"] },
    { id: "posX", label: "Pos X", kind: "number", step: 0.1 },
    { id: "posY", label: "Pos Y", kind: "number", step: 0.1 },
    { id: "posZ", label: "Pos Z", kind: "number", step: 0.1 },
    { id: "rotX", label: "Rot X (°)", kind: "number", step: 1 },
    { id: "rotY", label: "Rot Y (°)", kind: "number", step: 1 },
    { id: "rotZ", label: "Rot Z (°)", kind: "number", step: 1 },
    { id: "scaleX", label: "Scale X", kind: "number", step: 0.1 },
    { id: "scaleY", label: "Scale Y", kind: "number", step: 0.1 },
    { id: "scaleZ", label: "Scale Z", kind: "number", step: 0.1 },
    { id: "location", label: "Location (fallback)", kind: "vector" },
    { id: "rotation", label: "Rotation (°, fallback)", kind: "vector", step: 1, degrees: true },
    { id: "scale", label: "Scale (fallback)", kind: "vector" },
  ],
  evaluate: (inputs, params, ctx) => {
    const group = getGroup(ctx.nodeId);
    group.clear();

    const source = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!source) return { geometry: group };

    const clone = source.clone(true);

    let transformMat: THREE.Matrix4;

    if (inputs.matrix instanceof THREE.Matrix4) {
      transformMat = inputs.matrix.clone();
    } else {
      const baseLoc = asVector(inputs.location, asVector(params.location, new THREE.Vector3(0, 0, 0)));
      const locX = inputs.posX !== undefined ? Number(inputs.posX) : (params.posX !== undefined ? Number(params.posX) : baseLoc.x);
      const locY = inputs.posY !== undefined ? Number(inputs.posY) : (params.posY !== undefined ? Number(params.posY) : baseLoc.y);
      const locZ = inputs.posZ !== undefined ? Number(inputs.posZ) : (params.posZ !== undefined ? Number(params.posZ) : baseLoc.z);
      const location = new THREE.Vector3(
        Number.isFinite(locX) ? locX : baseLoc.x,
        Number.isFinite(locY) ? locY : baseLoc.y,
        Number.isFinite(locZ) ? locZ : baseLoc.z,
      );

      const baseRot = asVector(inputs.rotation, asVector(params.rotation, new THREE.Vector3(0, 0, 0)));
      const rx = inputs.rotX !== undefined ? Number(inputs.rotX) : (params.rotX !== undefined ? Number(params.rotX) : baseRot.x);
      const ry = inputs.rotY !== undefined ? Number(inputs.rotY) : (params.rotY !== undefined ? Number(params.rotY) : baseRot.y);
      const rz = inputs.rotZ !== undefined ? Number(inputs.rotZ) : (params.rotZ !== undefined ? Number(params.rotZ) : baseRot.z);
      const rotation = new THREE.Vector3(
        Number.isFinite(rx) ? rx : baseRot.x,
        Number.isFinite(ry) ? ry : baseRot.y,
        Number.isFinite(rz) ? rz : baseRot.z,
      );

      const baseScale = asVector(inputs.scale, asVector(params.scale, new THREE.Vector3(1, 1, 1)));
      const sx = inputs.scaleX !== undefined ? Number(inputs.scaleX) : (params.scaleX !== undefined ? Number(params.scaleX) : baseScale.x);
      const sy = inputs.scaleY !== undefined ? Number(inputs.scaleY) : (params.scaleY !== undefined ? Number(params.scaleY) : baseScale.y);
      const sz = inputs.scaleZ !== undefined ? Number(inputs.scaleZ) : (params.scaleZ !== undefined ? Number(params.scaleZ) : baseScale.z);
      const scale = new THREE.Vector3(
        Number.isFinite(sx) ? sx : baseScale.x,
        Number.isFinite(sy) ? sy : baseScale.y,
        Number.isFinite(sz) ? sz : baseScale.z,
      );

      const euler = new THREE.Euler(
        (rotation.x * Math.PI) / 180,
        (rotation.y * Math.PI) / 180,
        (rotation.z * Math.PI) / 180,
      );
      transformMat = new THREE.Matrix4();
      transformMat.compose(location, new THREE.Quaternion().setFromEuler(euler), scale);
    }

    const wrapper = new THREE.Group();
    wrapper.matrixAutoUpdate = false;
    wrapper.matrix.copy(transformMat);
    wrapper.add(clone);
    group.add(wrapper);

    return { geometry: group };
  },
};
