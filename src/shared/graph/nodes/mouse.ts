import * as THREE from "three";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { readViewportPointer } from "../pointerStore";

interface MouseState {
  /** Rebuilt from ctx.activeCameraPose only when no viewport is registered (headless/export). */
  poseCamera: THREE.PerspectiveCamera;
  raycaster: THREE.Raycaster;
  /** Smoothed outputs, carried frame to frame — see the `smoothing` param. */
  point: THREE.Vector3;
  normal: THREE.Vector3;
  ndc: THREE.Vector2;
  seeded: boolean;
}

const mouseCache = createNodeCache<MouseState>();

function getState(nodeId: string): MouseState {
  let state = mouseCache.get(nodeId);
  if (!state) {
    const poseCamera = new THREE.PerspectiveCamera();
    poseCamera.matrixAutoUpdate = false;
    state = {
      poseCamera,
      raycaster: new THREE.Raycaster(),
      point: new THREE.Vector3(),
      normal: new THREE.Vector3(0, 0, 1),
      ndc: new THREE.Vector2(),
      seeded: false,
    };
    mouseCache.set(nodeId, state);
  }
  return state;
}

function numberParam(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * The first hit under the ray that belongs to a graph node and is visible.
 * three's Raycaster reports invisible objects unless you filter yourself, so
 * a hidden object would otherwise shadow whatever is actually on screen —
 * same walk the viewport's own click-picking does.
 */
function pickVisible(raycaster: THREE.Raycaster, scene: THREE.Scene): THREE.Intersection | undefined {
  return raycaster.intersectObjects(scene.children, true).find((i) => {
    let curr: THREE.Object3D | null = i.object;
    let taggedNode = false;
    while (curr) {
      if (curr.visible === false) return false;
      if (curr.userData?.nodeId) taggedNode = true;
      curr = curr.parent;
    }
    return taggedNode;
  });
}

/**
 * Mouse node — the pointer's position over the viewport, and the 3D point it
 * corresponds to.
 *
 * "Where in 3D is the cursor" has no single answer: a ray through the pointer
 * hits the scene at one point, hits nothing at all over empty space, and the
 * cursor-follow effect most sites want (oxigen.sa's is the reference) is
 * actually the ray's crossing of a *plane*, not of geometry. So Target picks
 * which estimate is wanted, and Scene falls back to the plane on a miss —
 * without that fallback the outputs sit at 0,0,0 for every pixel of empty
 * space, which reads as a broken node rather than as "nothing there".
 */
export const MOUSE_NODE: NodeDefinition = {
  type: "io/mouse",
  label: "Mouse",
  category: "io",
  inputs: [
    { id: "distance", label: "Plane Distance", type: "value" },
    { id: "height", label: "Ground Height", type: "value" },
    { id: "smoothing", label: "Smoothing", type: "value" },
  ],
  outputs: [
    { id: "screenX", label: "Screen X", type: "value" },
    { id: "screenY", label: "Screen Y", type: "value" },
    { id: "ndcX", label: "NDC X", type: "value" },
    { id: "ndcY", label: "NDC Y", type: "value" },
    { id: "inside", label: "Inside Viewport", type: "value" },
    { id: "point", label: "Point (3D)", type: "vector" },
    { id: "normal", label: "Normal", type: "vector" },
    { id: "hit", label: "Hit Geometry (0/1)", type: "value" },
    { id: "distanceOut", label: "Distance", type: "value" },
  ],
  defaultParams: {
    target: "Scene",
    distance: 5,
    height: 0,
    smoothing: 0,
  },
  paramFields: [
    { id: "target", label: "Target", kind: "select", options: ["Scene", "Camera Plane", "Ground"] },
    { id: "distance", label: "Plane Distance", kind: "number", step: 0.5 },
    { id: "height", label: "Ground Height (Y)", kind: "number", step: 0.1 },
    { id: "smoothing", label: "Smoothing (0-1)", kind: "number", step: 0.05 },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getState(ctx.nodeId);
    const target = String(params.target ?? "Scene");
    const planeDistance = Math.max(0.001, numberParam(inputs.distance, numberParam(params.distance, 5)));
    const groundHeight = numberParam(inputs.height, numberParam(params.height, 0));
    const smoothing = Math.min(0.999, Math.max(0, numberParam(inputs.smoothing, numberParam(params.smoothing, 0))));

    // The viewport the pointer is over wins; without one (headless evaluate,
    // the offscreen export renderer) fall back to the context's own renderer
    // + Camera-node pose, which is all that exists there.
    const sample = readViewportPointer();
    let camera: THREE.Camera | null = sample ? sample.camera : null;
    let screenX = 0;
    let screenY = 0;
    let ndcX = 0;
    let ndcY = 0;
    let inside = false;

    if (sample) {
      screenX = sample.x;
      screenY = sample.y;
      ndcX = sample.ndcX;
      ndcY = sample.ndcY;
      inside = sample.inside;
    } else if (ctx.renderer && ctx.activeCameraPose) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const width = rect.width > 0 ? rect.width : ctx.renderSize?.width ?? 0;
      const height = rect.height > 0 ? rect.height : ctx.renderSize?.height ?? 0;
      if (width > 0 && height > 0) {
        const poseCamera = state.poseCamera;
        poseCamera.fov = ctx.activeCameraPose.fov;
        poseCamera.aspect = width / height;
        poseCamera.near = 0.01;
        poseCamera.far = 10000;
        poseCamera.updateProjectionMatrix();
        poseCamera.matrix.copy(ctx.activeCameraPose.matrix);
        poseCamera.updateMatrixWorld(true);
        camera = poseCamera;
      }
    }

    if (!camera) {
      return {
        screenX,
        screenY,
        ndcX,
        ndcY,
        inside: inside ? 1 : 0,
        point: state.point.clone(),
        normal: state.normal.clone(),
        hit: 0,
        distanceOut: 0,
      };
    }

    const raycaster = state.raycaster;
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const origin = raycaster.ray.origin;
    const direction = raycaster.ray.direction;

    let point: THREE.Vector3 | null = null;
    let normal = new THREE.Vector3();
    let hit = 0;

    if (target === "Scene" && ctx.scene) {
      const intersection = pickVisible(raycaster, ctx.scene);
      if (intersection) {
        hit = 1;
        point = intersection.point.clone();
        normal = intersection.face
          ? intersection.face.normal.clone().transformDirection(intersection.object.matrixWorld)
          : direction.clone().negate();
      }
    }

    if (!point && target === "Ground") {
      // A horizontal plane at `height`; a ray parallel to it (or aimed away)
      // has no crossing, so keep the previous point rather than snapping the
      // output to the origin as the view passes through the horizon.
      const denom = direction.y;
      if (Math.abs(denom) > 1e-6) {
        const t = (groundHeight - origin.y) / denom;
        if (t > 0) {
          point = origin.clone().addScaledVector(direction, t);
          normal.set(0, 1, 0);
        }
      }
    }

    if (!point) {
      // Camera plane: `planeDistance` in front of the camera, facing it — the
      // plain "cursor at a fixed depth" mapping, and the fallback for both
      // other modes so the outputs always describe somewhere sensible.
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const denom = direction.dot(forward);
      const t = Math.abs(denom) > 1e-6 ? planeDistance / denom : planeDistance;
      point = origin.clone().addScaledVector(direction, t);
      normal = forward.clone().negate();
    }

    if (!state.seeded) {
      state.point.copy(point);
      state.normal.copy(normal);
      state.ndc.set(ndcX, ndcY);
      state.seeded = true;
    } else if (smoothing > 0) {
      // Exponential follow, the damping oxigen-style cursor markers use. The
      // screen outputs are smoothed alongside the 3D point so a marker and a
      // 2D HUD element driven by the same node stay together.
      const alpha = 1 - smoothing;
      state.point.lerp(point, alpha);
      state.normal.lerp(normal, alpha).normalize();
      state.ndc.lerp(new THREE.Vector2(ndcX, ndcY), alpha);
    } else {
      state.point.copy(point);
      state.normal.copy(normal);
      state.ndc.set(ndcX, ndcY);
    }

    const smoothedNdc = state.ndc;
    const width = sample?.width ?? ctx.renderSize?.width ?? 0;
    const height = sample?.height ?? ctx.renderSize?.height ?? 0;

    return {
      screenX: smoothing > 0 && width > 0 ? ((smoothedNdc.x + 1) / 2) * width : screenX,
      screenY: smoothing > 0 && height > 0 ? ((1 - smoothedNdc.y) / 2) * height : screenY,
      ndcX: smoothedNdc.x,
      ndcY: smoothedNdc.y,
      inside: inside ? 1 : 0,
      point: state.point.clone(),
      normal: state.normal.clone(),
      hit,
      distanceOut: state.point.distanceTo(origin),
    };
  },
};
