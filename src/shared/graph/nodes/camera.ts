import * as THREE from "three";
import { NodeDefinition } from "../types";

const ZERO = new THREE.Vector3(0, 0, 0);
const DEFAULT_LOCATION = new THREE.Vector3(3, 3, 5);
const DEFAULT_FOV = 50;

function asVector3(v: unknown, fallback: THREE.Vector3): THREE.Vector3 {
  return v instanceof THREE.Vector3 ? v : fallback;
}

/**
 * The scene's render camera, as a node instead of the Viewport's hardcoded
 * default — this is what Manual Alignment (BIBLE.md's Calibration section)
 * actually is: drag Location/Rotation/FOV by hand — the same scrub-number
 * fields every other node uses — while watching the live projector output,
 * until the scene matches the physical space. No photo, no vanishing-point
 * solve; the projector itself is the feedback loop.
 *
 * Viewport auto-detects the first node of this type in the graph and drives
 * its camera from that node's resolved transform instead of its own
 * default, and disables free orbit navigation while it does (calibration
 * wants exact numbers, not a mouse drag fighting them every frame). A graph
 * with no Camera node renders exactly as before — this is purely additive.
 */
export const CAMERA_NODE: NodeDefinition = {
  type: "calibration/camera",
  label: "Camera",
  category: "calibration",
  inputs: [
    { id: "location", label: "Location", type: "vector" },
    { id: "rotation", label: "Rotation", type: "vector" },
    { id: "fov", label: "FOV", type: "value" },
  ],
  outputs: [
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "fov", label: "FOV", type: "value" },
  ],
  defaultParams: { location: DEFAULT_LOCATION.clone(), rotation: ZERO.clone(), fov: DEFAULT_FOV },
  paramFields: [
    { id: "location", label: "Location", kind: "vector" },
    { id: "rotation", label: "Rotation (rad)", kind: "vector" },
    { id: "fov", label: "FOV (deg)", kind: "number" },
  ],
  evaluate: (inputs) => {
    const location = asVector3(inputs.location, DEFAULT_LOCATION);
    const rotation = asVector3(inputs.rotation, ZERO);
    const fov = Number(inputs.fov) || DEFAULT_FOV;

    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));
    const matrix = new THREE.Matrix4().compose(location, quaternion, new THREE.Vector3(1, 1, 1));

    return { matrix, fov };
  },
};
