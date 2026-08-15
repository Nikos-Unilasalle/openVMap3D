import * as THREE from "three";
import { projectionMatrixFromCalibration, ProjectorCalibration } from "../calibration/dlt";
import { DEFAULT_PICKS, isCalibrationPicks, isReferencePointArray, solveFromPicks } from "../calibration/picks";
import { NodeDefinition } from "../types";
import { toBoolean } from "../sockets";
import { createNodeCache } from "../nodeCaches";
import { extractPositionFromInput } from "./transform";

const ZERO = new THREE.Vector3(0, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const DEFAULT_LOCATION = new THREE.Vector3(0, 0, 5);
const DEFAULT_UP = new THREE.Vector3(0, 1, 0);
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

const groupCache = new Map<string, THREE.Group>();
function getGroup(nodeId: string): THREE.Group {
  let group = groupCache.get(nodeId);
  if (!group) {
    group = new THREE.Group();
    groupCache.set(nodeId, group);
  }
  return group;
}

/**
 * Body box + frustum lines only — no pose here. The pose lives on the group
 * this content gets added into (see evaluate below), the same way every
 * object.ts primitive puts its own composed matrix directly on the mesh it
 * hands back rather than on a wrapper around it. An earlier version wrapped
 * this in its own positioned Group and returned the *outer*, always-identity
 * cache group as `geometry` — rendering looked right (three.js composes
 * transforms down the whole chain regardless of which node carries them),
 * but anything reading the returned object's own matrix directly — the
 * viewport's gizmo attach, in particular — found identity every time and
 * either grabbed nothing or dragged an invisible object stuck at the origin.
 */
function buildCameraHelperGeometry(fov: number, isActive: boolean): THREE.Group {
  const group = new THREE.Group();

  // Camera Body Box
  const bodyGeo = new THREE.BoxGeometry(0.3, 0.2, 0.4);
  const color = isActive ? 0x3b82f6 : 0x64748b;
  const mat = new THREE.MeshBasicMaterial({ color, wireframe: true });
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.set(0, 0, 0.2);
  group.add(body);

  // Camera Frustum Pyramid lines
  const radFov = THREE.MathUtils.degToRad(fov || 50);
  const aspect = 16 / 9;
  const dist = 1.2;
  const h = Math.tan(radFov / 2) * dist;
  const w = h * aspect;

  const points = [
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(-w, h, -dist),
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, h, -dist),
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, -h, -dist),
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(-w, -h, -dist),
    // Rect boundary at dist
    new THREE.Vector3(-w, h, -dist), new THREE.Vector3(w, h, -dist),
    new THREE.Vector3(w, h, -dist), new THREE.Vector3(w, -h, -dist),
    new THREE.Vector3(w, -h, -dist), new THREE.Vector3(-w, -h, -dist),
    new THREE.Vector3(-w, -h, -dist), new THREE.Vector3(-w, h, -dist),
  ];

  const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
  const lineMat = new THREE.LineBasicMaterial({ color: isActive ? 0x60a5fa : 0x94a3b8 });
  const frustum = new THREE.LineSegments(lineGeo, lineMat);
  group.add(frustum);

  return group;
}

/**
 * Aiming the camera at something is the overwhelmingly common case — a
 * subject to orbit, a projection surface to stay square to — and expressing
 * it as an Euler triple by hand is the least usable way to say it. So the
 * Look At node's math is embedded here, exactly as a Directional Light
 * embeds its own Target: wire an Empty (or any object, or a bare position)
 * into Target and the camera tracks it, with `rotation` ignored for as long
 * as it does. Nothing wired and Use Target off leaves the manual Euler pose
 * untouched, so existing graphs behave identically.
 */
function manualPose(
  inputs: Record<string, unknown>,
  params: Record<string, unknown>,
  connectedInputs?: ReadonlySet<string>,
) {
  const location = asVector3(inputs.location, DEFAULT_LOCATION);
  const fov = Number(inputs.fov) || DEFAULT_FOV;

  // Asked directly rather than inferred by comparing the input against the
  // param. That comparison only worked by reference-identity accident — an
  // unwired socket is handed the param object itself — and quietly broke as
  // soon as Target carried a keyframe, since interpolation hands back a
  // fresh Vector3 that compares unequal and read as a wire that isn't there.
  const isTargetWired = connectedInputs?.has("target") ?? false;
  const useTarget = toBoolean(params.useTarget ?? false) || isTargetWired;
  if (useTarget) {
    const target = extractPositionFromInput(inputs.target, asVector3(params.target, ZERO));
    const up = asVector3(params.up, DEFAULT_UP);
    // Degenerate when the camera sits exactly on its target — lookAt would
    // produce a zero-length forward axis and a NaN matrix, which silently
    // blanks the whole view. Fall back to the untargeted pose instead.
    if (target.distanceToSquared(location) > 1e-12) {
      const matrix = new THREE.Matrix4().lookAt(location, target, up);
      matrix.setPosition(location);
      return { matrix, fov, projection: null, error: 0 };
    }
  }

  const rotation = asVector3(inputs.rotation, ZERO);
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z, "YXZ"));
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
 * The scene's render camera, in either of two modes (Manual or Calibrated).
 * Can be driven as a regular 3D object, transformed by Matrix nodes, or activated/deactivated.
 */
export const CAMERA_NODE: NodeDefinition = {
  type: "calibration/camera",
  label: "Camera",
  category: "calibration",
  inputs: [
    // No `geometry` input: the Camera aims at things through `target` below,
    // and builds its own helper for the `geometry` *output*. It carried an
    // unused geometry input for a while that nothing ever read — wiring an
    // object into it did nothing at all.
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "location", label: "Location", type: "vector" },
    { id: "rotation", label: "Rotation", type: "vector" },
    // "any" rather than the Directional Light's "geometry", so this accepts
    // both an object to track (an Empty, the usual case) and a bare
    // position — same as the Look At node's own Target, whose behaviour
    // this embeds.
    { id: "target", label: "Target", type: "any" },
    { id: "fov", label: "FOV", type: "value" },
    { id: "active", label: "Active", type: "value" },
    { id: "refPoints", label: "Ref Points", type: "list" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "fov", label: "FOV", type: "value" },
    { id: "projection", label: "Projection", type: "matrix" },
    { id: "error", label: "Error", type: "value" },
    { id: "active", label: "Active", type: "value" },
  ],
  defaultParams: {
    location: DEFAULT_LOCATION.clone(),
    rotation: ZERO.clone(),
    useTarget: false,
    target: ZERO.clone(),
    up: DEFAULT_UP.clone(),
    fov: DEFAULT_FOV,
    active: true,
    mode: "manual",
    projectionType: "perspective",
    calibrationPicks: { ...DEFAULT_PICKS },
  },
  paramFields: [
    { id: "active", label: "Active", kind: "boolean" },
    { id: "mode", label: "Mode", kind: "select", options: ["manual", "calibrated"] },
    { id: "projectionType", label: "Projection", kind: "select", options: ["perspective", "orthographic"] },
    { id: "location", label: "Location", kind: "vector" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true },
    { id: "useTarget", label: "Use Target (Look At)", kind: "boolean" },
    { id: "target", label: "Target (fallback)", kind: "vector" },
    { id: "up", label: "Up", kind: "vector" },
    { id: "fov", label: "FOV (deg)", kind: "number" },
  ],
  evaluate: (inputs, params, ctx) => {
    const rawActive = inputs.active !== undefined ? inputs.active : params.active;
    const isActive = toBoolean(rawActive ?? true);

    let pose: { matrix: THREE.Matrix4; fov: number; projection: THREE.Matrix4 | null; error: number };

    if (params.mode === "calibrated") {
      const points = inputs.refPoints;
      const picks = params.calibrationPicks;
      if (isReferencePointArray(points) && isCalibrationPicks(picks)) {
        const calibration = solveFromPicks(points, picks);
        if (calibration) {
          pose = {
            matrix: new THREE.Matrix4().compose(calibration.position, calibration.quaternion, ONE),
            fov: verticalFovDegrees(calibration),
            projection: projectionMatrixFromCalibration(calibration, RELATIVE_WIDTH, RELATIVE_HEIGHT, NEAR, FAR),
            error: calibration.reprojectionError,
          };
        } else {
          pose = manualPose(inputs, params, ctx.connectedInputs);
        }
      } else {
        pose = manualPose(inputs, params, ctx.connectedInputs);
      }
    } else {
      pose = manualPose(inputs, params, ctx.connectedInputs);
    }

    if (inputs.matrix instanceof THREE.Matrix4) {
      pose.matrix = inputs.matrix.clone();
    }

    const group = getGroup(ctx.nodeId);
    group.clear();
    group.matrixAutoUpdate = false;
    // Skip the overwrite for the node the viewport gizmo is dragging right
    // now — the same guard every primitive in object.ts already has, and the
    // Camera was the one gizmo-draggable node missing it. Without it, the
    // graph reclaimed the camera's matrix on every frame of a drag: the
    // gizmo's own pose was overwritten before it could be read back, so
    // dragging the camera never made it to location/rotation and those
    // params stayed at whatever they were — which is what a keyframe taken
    // afterwards then captured.
    if (ctx.nodeId !== ctx.liveEditNodeId) {
      group.matrix.copy(pose.matrix);
    }
    group.userData.nodeId = ctx.nodeId;
    const helperContent = buildCameraHelperGeometry(pose.fov, isActive);
    helperContent.traverse((child) => {
      child.userData.nodeId = ctx.nodeId;
    });
    group.add(helperContent);

    return {
      ...pose,
      // The group's matrix, not `pose.matrix` — they agree except during a
      // gizmo drag, where the group carries the live dragged pose and
      // pose.matrix is still the pre-drag params. Downstream readers
      // (Distance, Look At, the render camera itself) should follow what is
      // actually on screen, same as primitiveOutputs does in object.ts.
      matrix: group.matrix.clone(),
      projectionType: String(params.projectionType || "perspective"),
      geometry: group,
      active: isActive ? 1 : 0,
    };
  },
};

/** Helper for fly_to transitions easing */
export function evaluateFlyToEasing(t: number, easing: string): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case "easeInOutCubic":
      return clamped < 0.5 ? 4 * clamped * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
    case "easeInOutQuad":
      return clamped < 0.5 ? 2 * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
    case "easeInOutSine":
      return -(Math.cos(Math.PI * clamped) - 1) / 2;
    case "easeInOutExpo":
      return clamped === 0
        ? 0
        : clamped === 1
        ? 1
        : clamped < 0.5
        ? Math.pow(2, 20 * clamped - 10) / 2
        : (2 - Math.pow(2, -20 * clamped + 10)) / 2;
    case "linear":
      return clamped;
    default:
      // Smoothstep default (cinematic & natural)
      return clamped * clamped * (3 - 2 * clamped);
  }
}


function extractCameraPose(objOrMatrix: unknown, fallbackPosition: THREE.Vector3 = DEFAULT_LOCATION): { position: THREE.Vector3; quaternion: THREE.Quaternion; fov: number } {
  const position = fallbackPosition.clone();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  let fov = 50;

  if (objOrMatrix instanceof THREE.Matrix4) {
    objOrMatrix.decompose(position, quaternion, scale);
  } else if (objOrMatrix instanceof THREE.Object3D) {
    if (objOrMatrix.matrix && !objOrMatrix.matrixAutoUpdate) {
      objOrMatrix.matrix.decompose(position, quaternion, scale);
    } else {
      objOrMatrix.updateWorldMatrix(true, false);
      objOrMatrix.matrixWorld.decompose(position, quaternion, scale);
    }
  } else if (objOrMatrix && typeof objOrMatrix === "object") {
    const dict = objOrMatrix as Record<string, unknown>;
    if (dict.matrix instanceof THREE.Matrix4) {
      dict.matrix.decompose(position, quaternion, scale);
    } else if (dict.geometry instanceof THREE.Object3D) {
      if (dict.geometry.matrix && !dict.geometry.matrixAutoUpdate) {
        dict.geometry.matrix.decompose(position, quaternion, scale);
      } else {
        dict.geometry.updateWorldMatrix(true, false);
        dict.geometry.matrixWorld.decompose(position, quaternion, scale);
      }
    }
    if (typeof dict.fov === "number" && Number.isFinite(dict.fov)) fov = dict.fov;
  }

  return { position, quaternion, fov };
}

interface FlyToState {
  startTime?: number;
  isFlying?: boolean;
  lastTrigger?: boolean;
  startSimTime?: number;
  /**
   * A flight ran to completion and nothing has re-triggered since. Held
   * separately from `isFlying` because progress has to *stay* at the
   * destination afterwards: the timer branch stops running the moment the
   * flight ends, and without this the next frame fell through to the
   * Progress param — still 0 — and snapped the camera back to Camera A.
   */
  landed?: boolean;
}

// createNodeCache, not a bare Map: node ids are stable (saved into .ovm,
// restored identically by undo), so an unregistered cache lets a deleted
// Fly To node's flight state silently reattach to whatever node next lands
// on that id — undo of the delete, most directly.
const flyToCache = createNodeCache<FlyToState>();

/**
 * 2. Camera Fly To Node (Unreal-style smooth camera hand-off transition)
 */
export const CAMERA_FLY_TO_NODE: NodeDefinition = {
  type: "camera/fly_to",
  label: "Fly To",
  category: "calibration",
  inputs: [
    { id: "cameraA", label: "Camera A (Start)", type: "any" },
    { id: "cameraB", label: "Camera B (Target)", type: "any" },
    { id: "progress", label: "Progress (0-1)", type: "value" },
    { id: "trigger", label: "Trigger Flight", type: "value" },
    { id: "duration", label: "Duration (s)", type: "value" },
    { id: "arcHeight", label: "Arc Height", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "fov", label: "FOV", type: "value" },
    { id: "active", label: "Active", type: "value" },
    { id: "progress", label: "Progress", type: "value" },
    { id: "isFinished", label: "Finished Signal", type: "value" },
  ],
  defaultParams: {
    progress: 0.0,
    trigger: 0,
    duration: 2.0,
    arcHeight: 1.0,
    easing: "easeInOutCubic",
    switchActiveOnFinish: true,
  },
  dynamicParamFields: () => [
    { id: "trigger", label: "Trigger (Fly)", kind: "boolean" },
    { id: "progress", label: "Progress (0-1)", kind: "number", step: 0.01 },
    { id: "duration", label: "Duration (s)", kind: "number", step: 0.2 },
    { id: "arcHeight", label: "Flight Arc Height", kind: "number", step: 0.2 },
    {
      id: "easing",
      label: "Easing Curve",
      kind: "select",
      options: ["easeInOutCubic", "smoothstep", "easeInOutQuad", "easeInOutSine", "easeInOutExpo", "linear"],
    },
    { id: "switchActiveOnFinish", label: "Auto Switch Active Cam", kind: "boolean" },
  ],
  evaluate: (inputs, params, ctx) => {
    let state = flyToCache.get(ctx.nodeId);
    if (!state) {
      state = {};
      flyToCache.set(ctx.nodeId, state);
    }

    const defaultTargetPos = new THREE.Vector3(5, 3, 5);
    const poseA = extractCameraPose(inputs.cameraA, DEFAULT_LOCATION);
    const poseB = extractCameraPose(inputs.cameraB, defaultTargetPos);

    const isTriggered = toBoolean(inputs.trigger !== undefined ? inputs.trigger : params.trigger);
    const nowSec = typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000;

    if (isTriggered && !state.lastTrigger) {
      state.isFlying = true;
      state.landed = false;
      state.startTime = nowSec;
      state.startSimTime = ctx.time;
    }
    state.lastTrigger = isTriggered;

    const duration = Math.max(0.01, inputs.duration !== undefined ? Number(inputs.duration) : Number(params.duration ?? 2.0));
    const arcHeight = inputs.arcHeight !== undefined ? Number(inputs.arcHeight) : Number(params.arcHeight ?? 1.0);
    const easingType = String(params.easing || "easeInOutCubic");

    // `connectedInputs`, not `inputs.progress !== undefined`: the evaluator
    // fills every declared socket from its param when nothing is wired, so
    // that test was always true and the flight timer below was unreachable in
    // the app — Progress sat at 0 and the camera never moved. It only looked
    // right in tests that call evaluate() directly, omitting the key.
    const isProgressDriven = ctx.connectedInputs?.has("progress") ?? false;

    let rawProgress = 0.0;
    if (isProgressDriven) {
      rawProgress = Math.max(0, Math.min(1, Number(inputs.progress) || 0));
    } else if (state.isFlying && state.startTime !== undefined) {
      // Advance either by sim time (if timeline is playing) or real-world clock
      const elapsed =
        ctx.time !== 0 && state.startSimTime !== undefined && ctx.time > state.startSimTime
          ? ctx.time - state.startSimTime
          : nowSec - state.startTime;
      rawProgress = Math.max(0, Math.min(1, elapsed / duration));
      if (rawProgress >= 1.0) {
        state.isFlying = false;
        state.landed = true;
      }
    } else if (state.landed) {
      rawProgress = 1.0;
    } else {
      rawProgress = Math.max(0, Math.min(1, Number(params.progress) || 0));
    }

    const e = evaluateFlyToEasing(rawProgress, easingType);

    // Position interpolation with parabolic lift
    const pos = new THREE.Vector3().lerpVectors(poseA.position, poseB.position, e);
    const arcLift = 4.0 * e * (1.0 - e) * arcHeight;
    pos.y += arcLift;

    // Quaternion slerp orientation
    const quat = poseA.quaternion.clone().slerp(poseB.quaternion, e);

    // FOV interpolation
    const fov = poseA.fov * (1.0 - e) + poseB.fov * e;

    const matrix = new THREE.Matrix4().compose(pos, quat, ONE);

    const group = getGroup(ctx.nodeId);
    group.clear();
    group.matrixAutoUpdate = false;
    group.matrix.copy(matrix);
    group.userData.nodeId = ctx.nodeId;

    const isFinished = rawProgress >= 0.999 ? 1 : 0;

    // Only in charge of the output camera while there is a reason to be:
    // mid-flight, driven by a wired Progress, scrubbed by hand on the param,
    // or parked at the destination because "Auto Switch Active Cam" says not
    // to hand control back. Never true just because the node exists and
    // hasn't been touched — the original unconditional `active: 1` meant
    // dropping a Fly To node into the graph silently overrode every Camera
    // node's own Active toggle, permanently, before the flight was ever
    // triggered. It also left "Auto Switch Active Cam" with nothing to
    // switch: `active` never went false once a flight had happened.
    const switchOnFinish = toBoolean(params.switchActiveOnFinish ?? true);
    const isActive =
      isProgressDriven ||
      state.isFlying === true ||
      (state.landed ? !switchOnFinish : rawProgress > 0);

    const helper = buildCameraHelperGeometry(fov, isActive);
    helper.traverse((child) => {
      child.userData.nodeId = ctx.nodeId;
    });
    group.add(helper);

    return {
      matrix,
      fov,
      geometry: group,
      active: isActive ? 1 : 0,
      progress: rawProgress,
      isFinished,
    };
  },
};
