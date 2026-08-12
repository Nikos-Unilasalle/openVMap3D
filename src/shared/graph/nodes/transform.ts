import * as THREE from "three";
import { NodeDefinition } from "../types";

const ZERO = new THREE.Vector3(0, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);

function asVector3(v: unknown, fallback: THREE.Vector3): THREE.Vector3 {
  return v instanceof THREE.Vector3 ? v : fallback;
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
    { id: "rotation", label: "Rotation (fallback, rad)", kind: "vector" },
    { id: "scale", label: "Scale (fallback)", kind: "vector" },
  ],
  evaluate: (inputs) => {
    const location = asVector3(inputs.location, ZERO);
    const rotation = asVector3(inputs.rotation, ZERO);
    const scale = asVector3(inputs.scale, ONE);

    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation.x, rotation.y, rotation.z),
    );
    const matrix = new THREE.Matrix4().compose(location, quaternion, scale);

    return { matrix };
  },
};

/** Matrix -> separate location/rotation(Euler)/scale vectors — the inverse of Transform. */
export const DECOMPOSE_MATRIX_NODE: NodeDefinition = {
  type: "matrix/decompose",
  label: "Decompose Matrix",
  category: "transform",
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
