import * as THREE from "three";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { getUnusedAxes } from "./vector";
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

/**
 * Which axes were disabled in a producing Compose Vector node, if any. A
 * disabled axis means "leave this property at its identity value" — 0 for a
 * location/rotation axis, 1 for a scale axis. Tracked off-band so a real,
 * wanted value on a legitimately-used axis (e.g. scale -1 for a flip, or
 * z = -1 for a location) is never mistaken for an unused axis.
 */
function isUnused(v: THREE.Vector3, axis: string): boolean {
  return getUnusedAxes(v).includes(axis);
}

export function resolveLocationVector(v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(
    isUnused(v, "x") ? 0 : v.x,
    isUnused(v, "y") ? 0 : v.y,
    isUnused(v, "z") ? 0 : v.z,
  );
}

export function resolveRotationVector(v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(
    isUnused(v, "x") ? 0 : v.x,
    isUnused(v, "y") ? 0 : v.y,
    isUnused(v, "z") ? 0 : v.z,
  );
}

export function resolveScaleVector(v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(
    isUnused(v, "x") ? 1 : v.x,
    isUnused(v, "y") ? 1 : v.y,
    isUnused(v, "z") ? 1 : v.z,
  );
}

/** location/rotation(Euler, radians)/scale -> a single composed Matrix4 — the LSR-to-matrix convention every transform-producing node in this file shares. */
export function composeTransform(location: THREE.Vector3, rotation: THREE.Vector3, scale: THREE.Vector3): THREE.Matrix4 {
  const loc = resolveLocationVector(location);
  const rot = resolveRotationVector(rotation);
  const scl = resolveScaleVector(scale);
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z));
  return new THREE.Matrix4().compose(loc, quaternion, scl);
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
 * Same contract as composeNativeMatrix, but rotation/scale pivot around an
 * arbitrary point instead of always the node's local origin — for geometry
 * whose own origin isn't where the user wants to rotate/scale from. An
 * imported .OBJ is the chief case: the format has no pivot concept at all,
 * so wherever the exporting app happened to leave (0,0,0) is where a plain
 * Transform would pivot from, and that's rarely the base/handle/center the
 * artist actually modeled around. Same translate-to-origin /
 * rotate-and-scale / translate-back-plus-offset formula as
 * PIVOT_TRANSFORM_NODE below, just producing a native base matrix instead of
 * modifying an already-composed one.
 */
export function composeNativeMatrixWithPivot(
  wiredMatrix: unknown,
  location: unknown,
  rotation: unknown,
  scale: unknown,
  pivot: unknown,
): THREE.Matrix4 {
  const delta = wiredMatrix instanceof THREE.Matrix4 ? wiredMatrix : new THREE.Matrix4();
  const loc = asVector3(location, ZERO);
  const rot = asVector3(rotation, ZERO);
  const scl = asVector3(scale, ONE);
  const piv = asVector3(pivot, ZERO);

  const mPivotInv = new THREE.Matrix4().makeTranslation(-piv.x, -piv.y, -piv.z);
  const mRotScale = composeTransform(ZERO, rot, scl);
  const mPivotLoc = new THREE.Matrix4().makeTranslation(piv.x + loc.x, piv.y + loc.y, piv.z + loc.z);

  const base = new THREE.Matrix4().multiply(mPivotLoc).multiply(mRotScale).multiply(mPivotInv);
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
  label: "Compose Matrix",
  category: "compose",
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
  category: "compose",
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

export function extractPositionFromInput(val: unknown, fallback: THREE.Vector3): THREE.Vector3 {
  if (val instanceof THREE.Vector3) return val.clone();
  // A Matrix4 is a perfectly good way to point at a place — it is what every
  // Transform node hands downstream. Without this it fell through to
  // asVector3, which sees no x/y/z on a matrix and quietly returned the
  // fallback, so a matrix-driven Target aimed at the origin instead.
  if (val instanceof THREE.Matrix4) return new THREE.Vector3().setFromMatrixPosition(val);
  if (val instanceof THREE.Object3D) {
    val.updateMatrixWorld(true);
    let target: THREE.Object3D = val;
    while (target instanceof THREE.Group && target.children.length > 0) {
      target = target.children[0];
      target.updateMatrixWorld(true);
    }
    const pos = new THREE.Vector3();
    target.getWorldPosition(pos);
    return pos;
  }
  return asVector3(val, fallback);
}

const groupCache = createNodeCache<THREE.Group>(disposeObject3D);
function getGroup(nodeId: string): THREE.Group {
  let group = groupCache.get(nodeId);
  if (!group) {
    group = new THREE.Group();
    groupCache.set(nodeId, group);
  }
  return group;
}

function cloneObject(source: THREE.Object3D): THREE.Object3D {
  const clone = source.clone(true);
  clone.matrixAutoUpdate = source.matrixAutoUpdate;
  clone.matrix.copy(source.matrix);
  clone.matrixWorldNeedsUpdate = true;
  return clone;
}

const DEFAULT_TARGET = new THREE.Vector3(0, 0, -1);
const DEFAULT_UP = new THREE.Vector3(0, 1, 0);

/** Look At node — transforms an incoming Geometry (or Eye position) to orient towards Target with an Up vector. */
export const LOOK_AT_NODE: NodeDefinition = {
  type: "transform/look-at",
  label: "Look At",
  category: "transform",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry", owns: true },
    { id: "target", label: "Target", type: "any" },
    { id: "up", label: "Up", type: "vector" },
    { id: "eye", label: "Eye / Pos", type: "any" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  defaultParams: { eye: ZERO.clone(), target: DEFAULT_TARGET.clone(), up: DEFAULT_UP.clone() },
  paramFields: [
    { id: "eye", label: "Eye (fallback)", kind: "vector" },
    { id: "target", label: "Target (fallback)", kind: "vector" },
    { id: "up", label: "Up (fallback)", kind: "vector" },
  ],
  evaluate: (inputs, params, ctx) => {
    const group = getGroup(ctx.nodeId);
    group.clear();

    const source = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    const defaultEye = source ? extractPositionFromInput(source, ZERO) : ZERO;
    const eye = extractPositionFromInput(inputs.eye, source ? defaultEye : asVector3(params?.eye, ZERO));
    const target = extractPositionFromInput(inputs.target, asVector3(params?.target, DEFAULT_TARGET));
    const up = asVector3(inputs.up, asVector3(params?.up, DEFAULT_UP));

    const matrix = new THREE.Matrix4().lookAt(eye, target, up);
    matrix.setPosition(eye);

    if (source) {
      const clone = cloneObject(source);
      const wrapper = new THREE.Group();
      wrapper.matrixAutoUpdate = false;
      wrapper.matrix.copy(matrix);
      wrapper.add(clone);
      group.add(wrapper);
    }

    return { geometry: group, matrix };
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



