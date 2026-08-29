import * as THREE from "three";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { asVector3 } from "./transform";

interface RollingState {
  prevPosition?: THREE.Vector3;
  /** The rotation accumulated so far — has to persist across frames, unlike Velocity's speed: rolling is the *integral* of motion, not an instantaneous reading of it. */
  quaternion: THREE.Quaternion;
}

const rollingCache = createNodeCache<RollingState>();

function getState(nodeId: string): RollingState {
  let state = rollingCache.get(nodeId);
  if (!state) {
    state = { quaternion: new THREE.Quaternion() };
    rollingCache.set(nodeId, state);
  }
  return state;
}

const DEFAULT_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Rolling — turns an object's own movement into the spin a ball rolling on
 * the ground without slipping would have, so a sphere driven by Location
 * looks like it's actually rolling there instead of sliding while it spins
 * on noise.
 *
 * Unlike Velocity (`math/velocity`), which only ever reports the current
 * instant, a rolling ball's orientation is the *sum* of every bit of travel
 * since it started — so this keeps its own running rotation (a quaternion,
 * not degrees-per-frame) and adds to it, the same "state has to survive
 * between evaluate() calls" shape Trail keeps its sample history in.
 *
 * Per frame: the displacement since the last read is flattened onto the
 * rolling plane (whatever moved along Axis is climbing/falling, not
 * rolling), rotated by Axis × displacement to get the physically correct
 * roll axis, and turned by distance / Radius radians — the standard
 * rolling-without-slipping relation. Reversing direction naturally unrolls
 * it; no separate "reverse" logic needed.
 */
export const ROLLING_NODE: NodeDefinition = {
  type: "physics/rolling",
  label: "Rolling",
  category: "physics",
  inputs: [
    { id: "position", label: "Position", type: "vector" },
    { id: "radius", label: "Ball Radius", type: "value" },
    { id: "axis", label: "Rolling Plane Normal (Up)", type: "vector" },
  ],
  outputs: [{ id: "rotation", label: "Rotation", type: "vector" }],
  defaultParams: {
    radius: 0.5,
    axis: DEFAULT_AXIS.clone(),
  },
  paramFields: [
    { id: "radius", label: "Ball Radius", kind: "number", step: 0.05 },
    { id: "axis", label: "Rolling Plane Normal (Up)", kind: "vector" },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getState(ctx.nodeId);
    const position = asVector3(inputs.position, new THREE.Vector3());
    const radius = Math.max(1e-4, inputs.radius !== undefined ? Number(inputs.radius) || 0 : Number(params.radius) || 0.5);
    const axis = asVector3(inputs.axis, params.axis instanceof THREE.Vector3 ? params.axis : DEFAULT_AXIS).normalize();
    if (axis.lengthSq() < 1e-8) axis.copy(DEFAULT_AXIS);

    if (!state.prevPosition) {
      // First read: nothing to have moved from yet. Seeding here (rather
      // than defaulting prevPosition to the origin) is what stops a ball
      // that merely *starts* away from (0,0,0) from spinning once, hard, on
      // its very first frame.
      state.prevPosition = position.clone();
    } else {
      const delta = new THREE.Vector3().subVectors(position, state.prevPosition);
      const alongAxis = delta.dot(axis);
      const deltaFlat = delta.clone().sub(axis.clone().multiplyScalar(alongAxis));
      const distance = deltaFlat.length();

      if (distance > 1e-7) {
        // n × v (not v × n): with axis = +Y and travel along +X, this gives
        // -Z — rotating the ball's top toward +X, the direction it's
        // actually moving. The other cross-product order rolls it backward.
        const rollAxis = new THREE.Vector3().crossVectors(axis, deltaFlat).normalize();
        const angle = distance / radius;
        const step = new THREE.Quaternion().setFromAxisAngle(rollAxis, angle);
        state.quaternion.premultiply(step);
      }
      state.prevPosition.copy(position);
    }

    const euler = new THREE.Euler().setFromQuaternion(state.quaternion);
    return { rotation: new THREE.Vector3(euler.x, euler.y, euler.z) };
  },
};
