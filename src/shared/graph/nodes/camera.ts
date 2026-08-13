import * as THREE from "three";
import { projectionMatrixFromCalibration, ProjectorCalibration } from "../calibration/dlt";
import { DEFAULT_PICKS, isCalibrationPicks, isReferencePointArray, solveFromPicks } from "../calibration/picks";
import { NodeDefinition } from "../types";

const ZERO = new THREE.Vector3(0, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const DEFAULT_LOCATION = new THREE.Vector3(3, 3, 5);
const DEFAULT_FOV = 50;

/** Relative image units, so the frustum is built against a 1x1 image — see picks.ts on why no resolution is stored. */
const RELATIVE_WIDTH = 1;
const RELATIVE_HEIGHT = 1;
const NEAR = 0.05;
const FAR = 500;

function asVector3(v: unknown, fallback: THREE.Vector3): THREE.Vector3 {
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
  return fallback;
}

function manualPose(inputs: Record<string, unknown>) {
  const location = asVector3(inputs.location, DEFAULT_LOCATION);
  const rotation = asVector3(inputs.rotation, ZERO);
  const fov = Number(inputs.fov) || DEFAULT_FOV;
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));
  return { matrix: new THREE.Matrix4().compose(location, quaternion, ONE), fov, projection: null, error: 0 };
}

/**
 * The angular height the solved frustum actually covers. Reported for the
 * param panel and for anything downstream that wants a single number; the
 * renderer uses the projection matrix instead, since a lens-shifted frustum
 * is not describable by one symmetric angle.
 */
function verticalFovDegrees(calibration: ProjectorCalibration): number {
  const top = calibration.principalY / calibration.focalY;
  const bottom = -(RELATIVE_HEIGHT - calibration.principalY) / calibration.focalY;
  return THREE.MathUtils.radToDeg(Math.atan(top) - Math.atan(bottom));
}

/**
 * The scene's render camera, in either of two modes.
 *
 * **Manual** — scrub Location/Rotation/FOV by hand while watching the live
 * projector output. Fine for a rough look, hopeless for matching a real room.
 *
 * **Calibrated** — the real method (BIBLE.md's Calibration section, and what
 * every projection-mapping tool does): wire in a Room Corner node, project
 * its wireframe, and drag each corner handle onto the matching physical
 * corner of the room. Each handle carries a *known* 3D coordinate, so the
 * DLT solve recovers the projector's full state — position, orientation,
 * focal lengths, and the off-centre principal point that is its lens shift.
 *
 * The earlier vanishing-point attempt lived here too, and is worth naming so
 * it isn't retried: tracing lines recovers rotation and focal length but
 * never position, so the scene never landed in the room at all. See dlt.ts.
 *
 * Calibrated mode falls back to the manual pose whenever the solve cannot
 * run — too few handles placed, no Room Corner wired in, a degenerate
 * configuration — rather than emitting a broken camera.
 */
export const CAMERA_NODE: NodeDefinition = {
  type: "calibration/camera",
  label: "Camera",
  category: "calibration",
  inputs: [
    { id: "location", label: "Location", type: "vector" },
    { id: "rotation", label: "Rotation", type: "vector" },
    { id: "fov", label: "FOV", type: "value" },
    { id: "refPoints", label: "Ref Points", type: "list" },
  ],
  outputs: [
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "fov", label: "FOV", type: "value" },
    { id: "projection", label: "Projection", type: "matrix" },
    { id: "error", label: "Error", type: "value" },
  ],
  defaultParams: {
    location: DEFAULT_LOCATION.clone(),
    rotation: ZERO.clone(),
    fov: DEFAULT_FOV,
    mode: "manual",
    calibrationPicks: { ...DEFAULT_PICKS },
  },
  paramFields: [
    { id: "mode", label: "Mode", kind: "select", options: ["manual", "calibrated"] },
    { id: "location", label: "Location", kind: "vector" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true },
    { id: "fov", label: "FOV (deg)", kind: "number" },
  ],
  evaluate: (inputs, params) => {
    if (params.mode !== "calibrated") return manualPose(inputs);

    const points = inputs.refPoints;
    const picks = params.calibrationPicks;
    if (!isReferencePointArray(points) || !isCalibrationPicks(picks)) return manualPose(inputs);

    const calibration = solveFromPicks(points, picks);
    if (!calibration) return manualPose(inputs);

    const quaternion = calibration.quaternion;
    return {
      matrix: new THREE.Matrix4().compose(calibration.position, quaternion, ONE),
      fov: verticalFovDegrees(calibration),
      projection: projectionMatrixFromCalibration(calibration, RELATIVE_WIDTH, RELATIVE_HEIGHT, NEAR, FAR),
      error: calibration.reprojectionError,
    };
  },
};
