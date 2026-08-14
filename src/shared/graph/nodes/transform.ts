import * as THREE from "three";
import { NodeDefinition } from "../types";

const ZERO = new THREE.Vector3(0, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);

export function asVector3(v: unknown, fallback: THREE.Vector3): THREE.Vector3 {
  if (v instanceof THREE.Vector3) return v;
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const x = Number(obj.x);
    const y = Number(obj.y);
    const z = Number(obj.z);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      return new THREE.Vector3(x, y, z);
    }
  }
  if (Array.isArray(v)) {
    const x = Number(v[0]);
    const y = Number(v[1]);
    const z = Number(v[2]);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      return new THREE.Vector3(x, y, z);
    }
  }
  return fallback;
}

/** location/rotation(Euler, radians)/scale -> a single composed Matrix4 — the LSR-to-matrix convention every transform-producing node in this file shares. */
export function composeTransform(location: THREE.Vector3, rotation: THREE.Vector3, scale: THREE.Vector3): THREE.Matrix4 {
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));
  return new THREE.Matrix4().compose(location, quaternion, scale);
}

/**
 * `final = base(location/rotation/scale) × delta(wiredMatrix)` — for a node
 * that owns its own initial pose (an object or light's native
 * location/rotation/scale params) but still accepts an incoming `matrix` to
 * modify that pose without cancelling it. Same composition
 * MATRIX_TRANSFORM_NODE below already does, roles reversed: there the wired
 * matrix is the base and the node's own params are the delta; here the
 * node's own params are the base and the wired matrix is the delta, applied
 * in the base's local frame.
 */
export function composeNativeMatrix(wiredMatrix: unknown, location: unknown, rotation: unknown, scale: unknown): THREE.Matrix4 {
  const delta = wiredMatrix instanceof THREE.Matrix4 ? wiredMatrix : new THREE.Matrix4();
  const base = composeTransform(asVector3(location, ZERO), asVector3(rotation, ZERO), asVector3(scale, ONE));
  return new THREE.Matrix4().multiplyMatrices(base, delta);
}

/**
 * The flagship node — almost everything else in a scene ends up feeding
 * this one. location/scale/rotate in, a single composed Matrix out, matching
 * Blender's LSR-to-matrix convention. Rotation travels as a Vector of Euler
 * angles (radians) rather than a dedicated quaternion socket type — simpler
 * type system, and gimbal lock is not a practical concern for VJ-scale
 * single-axis-at-a-time animation.
 */
export const TRANSFORM_NODE: NodeDefinition = {
  type: "transform",
  label: "Transform",
  category: "transform",
  inputs: [
    { id: "location", label: "Location", type: "vector" },
    { id: "rotation", label: "Rotation", type: "vector" },
    { id: "scale", label: "Scale", type: "vector" },
  ],
  outputs: [{ id: "matrix", label: "Matrix", type: "matrix" }],
  defaultParams: { location: ZERO.clone(), rotation: ZERO.clone(), scale: ONE.clone() },
  paramFields: [
    { id: "location", label: "Location (fallback)", kind: "vector" },
    { id: "rotation", label: "Rotation (°, fallback)", kind: "vector", step: 1, degrees: true },
    { id: "scale", label: "Scale (fallback)", kind: "vector" },
  ],
  evaluate: (inputs) => {
    const location = asVector3(inputs.location, ZERO);
    const rotation = asVector3(inputs.rotation, ZERO);
    const scale = asVector3(inputs.scale, ONE);
    return { matrix: composeTransform(location, rotation, scale) };
  },
};

/** Matrix -> separate location/rotation(Euler)/scale vectors — the inverse of Transform. */
export const DECOMPOSE_MATRIX_NODE: NodeDefinition = {
  type: "matrix/decompose",
  label: "Decompose Matrix",
  category: "converter",
  inputs: [{ id: "matrix", label: "Matrix", type: "matrix" }],
  outputs: [
    { id: "location", label: "Location", type: "vector" },
    { id: "rotation", label: "Rotation", type: "vector" },
    { id: "scale", label: "Scale", type: "vector" },
  ],
  defaultParams: {},
  evaluate: (inputs) => {
    const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
    const location = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(location, quaternion, scale);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);

    return { location, rotation: new THREE.Vector3(euler.x, euler.y, euler.z), scale };
  },
};

/** Matrix parent node — multiplies Parent Matrix * Child Matrix. */
export const PARENT_NODE: NodeDefinition = {
  type: "transform/parent",
  label: "Parent",
  category: "transform",
  inputs: [
    { id: "parent", label: "Parent", type: "matrix" },
    { id: "child", label: "Child", type: "matrix" },
  ],
  outputs: [{ id: "matrix", label: "Matrix", type: "matrix" }],
  defaultParams: {},
  evaluate: (inputs) => {
    const parent = inputs.parent instanceof THREE.Matrix4 ? inputs.parent : new THREE.Matrix4();
    const child = inputs.child instanceof THREE.Matrix4 ? inputs.child : new THREE.Matrix4();
    const matrix = new THREE.Matrix4().multiplyMatrices(parent, child);
    return { matrix };
  },
};

const DEFAULT_TARGET = new THREE.Vector3(0, 0, -1);
const DEFAULT_UP = new THREE.Vector3(0, 1, 0);

/** Look At node — constructs a matrix orienting Eye towards Target with an Up vector. */
export const LOOK_AT_NODE: NodeDefinition = {
  type: "transform/look-at",
  label: "Look At",
  category: "transform",
  inputs: [
    { id: "eye", label: "Eye", type: "vector" },
    { id: "target", label: "Target", type: "vector" },
    { id: "up", label: "Up", type: "vector" },
  ],
  outputs: [{ id: "matrix", label: "Matrix", type: "matrix" }],
  defaultParams: { eye: ZERO.clone(), target: DEFAULT_TARGET.clone(), up: DEFAULT_UP.clone() },
  paramFields: [
    { id: "eye", label: "Eye (fallback)", kind: "vector" },
    { id: "target", label: "Target (fallback)", kind: "vector" },
    { id: "up", label: "Up (fallback)", kind: "vector" },
  ],
  evaluate: (inputs) => {
    const eye = asVector3(inputs.eye, ZERO);
    const target = asVector3(inputs.target, DEFAULT_TARGET);
    const up = asVector3(inputs.up, DEFAULT_UP);

    const matrix = new THREE.Matrix4().lookAt(eye, target, up);
    return { matrix };
  },
};

/**
 * Matrix Transform node — transforms an existing base Matrix4 by applying
 * incremental translation (Location), rotation (Euler), and scaling (Scale).
 */
export const MATRIX_TRANSFORM_NODE: NodeDefinition = {
  type: "transform/matrix-transform",
  label: "Matrix Transform",
  category: "transform",
  inputs: [
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "location", label: "Location", type: "vector" },
    { id: "rotation", label: "Rotation", type: "vector" },
    { id: "scale", label: "Scale", type: "vector" },
  ],
  outputs: [{ id: "matrix", label: "Matrix", type: "matrix" }],
  defaultParams: { location: ZERO.clone(), rotation: ZERO.clone(), scale: ONE.clone() },
  paramFields: [
    { id: "location", label: "Location Offset", kind: "vector" },
    { id: "rotation", label: "Rotation Offset (°)", kind: "vector", step: 1, degrees: true },
    { id: "scale", label: "Scale Multiplier", kind: "vector" },
  ],
  evaluate: (inputs) => {
    const baseMatrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
    const location = asVector3(inputs.location, ZERO);
    const rotation = asVector3(inputs.rotation, ZERO);
    const scale = asVector3(inputs.scale, ONE);
    const deltaMatrix = composeTransform(location, rotation, scale);

    const matrix = new THREE.Matrix4().multiplyMatrices(baseMatrix, deltaMatrix);
    return { matrix };
  },
};

/**
 * Transform Vector node — multiplies a 3D Vector by a Matrix4 transform.
 */
export const TRANSFORM_VECTOR_NODE: NodeDefinition = {
  type: "transform/transform-vector",
  label: "Transform Vector",
  category: "transform",
  inputs: [
    { id: "vector", label: "Vector", type: "vector" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  outputs: [{ id: "vector", label: "Vector", type: "vector" }],
  defaultParams: { vector: ZERO.clone() },
  paramFields: [{ id: "vector", label: "Vector (fallback)", kind: "vector" }],
  evaluate: (inputs) => {
    const v = asVector3(inputs.vector, ZERO);
    const m = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
    return { vector: v.clone().applyMatrix4(m) };
  },
};

/**
 * Pivot Transform node — transforms an existing base Matrix4 (or identity)
 * by applying rotation, scale, and location offset relative to an arbitrary Pivot Point.
 */
export const PIVOT_TRANSFORM_NODE: NodeDefinition = {
  type: "transform/pivot",
  label: "Pivot Transform",
  category: "transform",
  inputs: [
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "pivot", label: "Pivot", type: "vector" },
    { id: "location", label: "Location", type: "vector" },
    { id: "rotation", label: "Rotation", type: "vector" },
    { id: "scale", label: "Scale", type: "vector" },
  ],
  outputs: [{ id: "matrix", label: "Matrix", type: "matrix" }],
  defaultParams: {
    pivot: ZERO.clone(),
    location: ZERO.clone(),
    rotation: ZERO.clone(),
    scale: ONE.clone(),
  },
  paramFields: [
    { id: "pivot", label: "Pivot Point", kind: "vector" },
    { id: "location", label: "Location Offset", kind: "vector" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true },
    { id: "scale", label: "Scale Multiplier", kind: "vector" },
  ],
  evaluate: (inputs) => {
    const baseMatrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
    const pivot = asVector3(inputs.pivot, ZERO);
    const location = asVector3(inputs.location, ZERO);
    const rotation = asVector3(inputs.rotation, ZERO);
    const scale = asVector3(inputs.scale, ONE);

    const mPivotInv = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
    const mRotScale = composeTransform(ZERO, rotation, scale);
    const mPivotLoc = new THREE.Matrix4().makeTranslation(pivot.x + location.x, pivot.y + location.y, pivot.z + location.z);

    const deltaMatrix = new THREE.Matrix4()
      .multiply(mPivotLoc)
      .multiply(mRotScale)
      .multiply(mPivotInv);

    const matrix = new THREE.Matrix4().multiplyMatrices(baseMatrix, deltaMatrix);
    return { matrix };
  },
};



