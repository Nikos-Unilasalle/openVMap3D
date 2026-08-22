import * as THREE from "three";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { stepDampedSpring, SpringState } from "../springDamper";
import { clockInput, numberInput } from "./object";
import { asVector3 } from "./transform";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

interface SpringNodeState {
  lastTime?: number;
  x: SpringState;
  y: SpringState;
  z: SpringState;
}

const springStateCache = createNodeCache<SpringNodeState>();

function getSpringState(nodeId: string, seed: THREE.Vector3): SpringNodeState {
  let state = springStateCache.get(nodeId);
  if (!state) {
    state = { x: { value: seed.x, velocity: 0 }, y: { value: seed.y, velocity: 0 }, z: { value: seed.z, velocity: 0 } };
    springStateCache.set(nodeId, state);
  }
  return state;
}

/**
 * Advances one axis's spring and folds in the same rewound/reseed handling
 * Squash & Stretch uses: a real scrub backwards (or the very first frame)
 * snaps straight to the target instead of springing across the jump, since
 * there's no meaningful "velocity" to integrate across a discontinuity.
 */
function advance(axis: SpringState, target: number, dt: number, rewound: boolean, smoothing: number, bounciness: number): SpringState {
  if (rewound) return { value: target, velocity: 0 };
  return stepDampedSpring(axis, target, dt, smoothing, bounciness);
}

/**
 * Spring — the same damped-spring integrator behind Squash & Stretch's
 * Smoothing/Bounciness, exposed on its own so any value or vector can chase
 * a moving target with lag and (optionally) overshoot: a camera easing
 * toward a target position, a UI value settling with a bit of bounce, a
 * light's intensity following a trigger without snapping. Unlike Squash &
 * Stretch this isn't derived from measured velocity — it springs directly
 * toward whatever's wired into Target.
 */
export const SPRING_NODE: NodeDefinition = {
  type: "math/spring",
  label: "Spring",
  category: "math",
  inputs: [
    { id: "target", label: "Target", type: "value" },
    { id: "time", label: "Time", type: "value" },
    { id: "smoothing", label: "Smoothing", type: "value" },
    { id: "bounciness", label: "Bounciness", type: "value" },
  ],
  outputs: [{ id: "value", label: "Value", type: "value" }],
  defaultParams: {
    time: 0,
    target: 0,
    smoothing: 0.4,
    bounciness: 0.3,
  },
  paramFields: [
    { id: "target", label: "Target (fallback)", kind: "number", step: 0.1, group: "Spring" },
    { id: "smoothing", label: "Smoothing (response speed)", kind: "number", step: 0.05, group: "Spring" },
    { id: "bounciness", label: "Bounciness (0 = no overshoot)", kind: "number", step: 0.05, group: "Spring" },
  ],
  evaluate: (inputs, params, ctx) => {
    const target = numberInput(inputs.target, params.target, 0);
    const state = getSpringState(ctx.nodeId, new THREE.Vector3(target, 0, 0));

    const time = clockInput(inputs, params, ctx);
    const smoothing = clamp01(numberInput(inputs.smoothing, params.smoothing, 0.4));
    const bounciness = clamp01(numberInput(inputs.bounciness, params.bounciness, 0.3));

    const rewound = state.lastTime !== undefined && time < state.lastTime - 0.5;
    const dt = state.lastTime === undefined || rewound ? 0 : Math.max(0, time - state.lastTime);
    const reseed = rewound || state.lastTime === undefined;
    state.lastTime = time;

    state.x = advance(state.x, target, dt, reseed, smoothing, bounciness);
    return { value: state.x.value };
  },
};

/**
 * Spring Vector — Spring's per-axis sibling, matching the Wiggle / Wiggle
 * Number / Wiggle Vector split this codebase already uses: one node for a
 * bare scalar, one for a Vector3, both sharing the same underlying math.
 * Each axis runs its own independent spring (a target that only moves in X
 * shouldn't perturb Y or Z), which is also why this can't just be Spring
 * called three times — three separate node instances would each need their
 * own Time wiring and wouldn't share a single Smoothing/Bounciness pair.
 */
export const SPRING_VECTOR_NODE: NodeDefinition = {
  type: "vector/spring",
  label: "Spring Vector",
  category: "math",
  inputs: [
    { id: "target", label: "Target", type: "vector" },
    { id: "time", label: "Time", type: "value" },
    { id: "smoothing", label: "Smoothing", type: "value" },
    { id: "bounciness", label: "Bounciness", type: "value" },
  ],
  outputs: [{ id: "vector", label: "Vector", type: "vector" }],
  defaultParams: {
    time: 0,
    target: new THREE.Vector3(0, 0, 0),
    smoothing: 0.4,
    bounciness: 0.3,
  },
  paramFields: [
    { id: "target", label: "Target (fallback)", kind: "vector", group: "Spring" },
    { id: "smoothing", label: "Smoothing (response speed)", kind: "number", step: 0.05, group: "Spring" },
    { id: "bounciness", label: "Bounciness (0 = no overshoot)", kind: "number", step: 0.05, group: "Spring" },
  ],
  evaluate: (inputs, params, ctx) => {
    const target = asVector3(inputs.target ?? params.target, new THREE.Vector3(0, 0, 0));
    const state = getSpringState(ctx.nodeId, target);

    const time = clockInput(inputs, params, ctx);
    const smoothing = clamp01(numberInput(inputs.smoothing, params.smoothing, 0.4));
    const bounciness = clamp01(numberInput(inputs.bounciness, params.bounciness, 0.3));

    const rewound = state.lastTime !== undefined && time < state.lastTime - 0.5;
    const dt = state.lastTime === undefined || rewound ? 0 : Math.max(0, time - state.lastTime);
    state.lastTime = time;

    const reseed = rewound || state.lastTime === undefined;
    state.x = advance(state.x, target.x, dt, reseed, smoothing, bounciness);
    state.y = advance(state.y, target.y, dt, reseed, smoothing, bounciness);
    state.z = advance(state.z, target.z, dt, reseed, smoothing, bounciness);

    return { vector: new THREE.Vector3(state.x.value, state.y.value, state.z.value) };
  },
};
