import * as THREE from "three";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { numberInput } from "./object";

interface SquashState {
  prevPos?: THREE.Vector3;
  lastTime?: number;
  lastDir?: THREE.Vector3;
}

const squashStateCache = createNodeCache<SquashState>();

function getSquashState(nodeId: string): SquashState {
  let state = squashStateCache.get(nodeId);
  if (!state) {
    state = {};
    squashStateCache.set(nodeId, state);
  }
  return state;
}

const squashGroupCache = createNodeCache<THREE.Group>();

function getSquashGroup(nodeId: string): THREE.Group {
  let group = squashGroupCache.get(nodeId);
  if (!group) {
    group = new THREE.Group();
    group.userData.nodeId = nodeId;
    squashGroupCache.set(nodeId, group);
  }
  return group;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Squash & Stretch Node — automatic, velocity-driven deformation. The object is
 * stretched along its direction of motion (and squashed perpendicularly,
 * volume-preserving) proportionally to its speed, with a single Intensity knob.
 * Wire `time` from the clock so the node can measure per-frame velocity; the
 * deformation settles back to identity the moment the object stops.
 */
export const SQUASH_STRETCH_NODE: NodeDefinition = {
  type: "modifier/squash-stretch",
  label: "Squash & Stretch",
  category: "structure",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry", owns: true },
    { id: "time", label: "Time", type: "value" },
    { id: "intensity", label: "Intensity", type: "value" },
    { id: "maxSpeed", label: "Max Speed", type: "value" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {
    time: 0,
    intensity: 0.6,
    maxSpeed: 3,
  },
  dynamicParamFields: () => [
    { id: "time", label: "Time", kind: "number", step: 0.05 },
    { id: "intensity", label: "Intensity (0–1)", kind: "number", step: 0.05 },
    { id: "maxSpeed", label: "Max Speed (units/s)", kind: "number", step: 0.5 },
  ],
  evaluate: (inputs, params, ctx) => {
    const group = getSquashGroup(ctx.nodeId);
    const state = getSquashState(ctx.nodeId);
    const object = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;

    const time = numberInput(inputs.time, params.time, 0);
    const intensity = clamp01(numberInput(inputs.intensity, params.intensity, 0.6));
    const maxSpeed = Math.max(0.01, numberInput(inputs.maxSpeed, params.maxSpeed, 3));

    group.clear();
    if (!object) return { geometry: group };
    group.add(object);

    object.updateWorldMatrix(true, false, true);
    const pos = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);

    let dir = state.lastDir ?? new THREE.Vector3(0, 1, 0);
    let factor = 1;

    if (state.prevPos && state.lastTime !== undefined && time > state.lastTime) {
      const dt = time - state.lastTime;
      const vel = new THREE.Vector3().subVectors(pos, state.prevPos).divideScalar(dt);
      const speed = vel.length();
      if (speed > 1e-6) dir.copy(vel).normalize();
      const normalized = Math.min(1, speed / maxSpeed);
      // stretchFactor 1..1+0.5*intensity along motion; volume-preserving inverse sideways.
      factor = 1 + intensity * 0.5 * normalized;
    }
    state.prevPos = pos.clone();
    state.lastTime = time;
    state.lastDir = dir.clone();

    if (Math.abs(factor - 1) < 1e-4) {
      group.matrix.identity();
      group.matrixAutoUpdate = false;
      return { geometry: group };
    }

    // Orthonormal basis built on the motion direction.
    const ref = Math.abs(dir.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3().crossVectors(dir, ref).normalize();
    const w = new THREE.Vector3().crossVectors(dir, v).normalize();
    const inv = 1 / Math.sqrt(factor);

    const U = new THREE.Matrix4().makeBasis(dir, v, w);
    const D = new THREE.Matrix4().makeScale(factor, inv, inv);
    const Uinv = new THREE.Matrix4().copy(U).invert();
    const S = new THREE.Matrix4().multiplyMatrices(U, D).multiply(Uinv);

    // Pin the deformation at the object's world origin so it deforms in place.
    const T = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z);
    const Tneg = new THREE.Matrix4().makeTranslation(-pos.x, -pos.y, -pos.z);

    group.matrixAutoUpdate = false;
    group.matrix.multiplyMatrices(T, S).multiply(Tneg);

    return { geometry: group };
  },
};
