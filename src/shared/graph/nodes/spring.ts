import * as THREE from "three";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { stepDampedSpring, SpringState } from "../springDamper";
import { clockInput, numberInput } from "./object";
import { asVector3 } from "./transform";
import { writePointsToMesh } from "./pointsGeometry";
import { findFirstMesh } from "../meshRequired";

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

interface SpringPointsState {
  lastTime?: number;
  /** One [x,y,z] spring per point, indexed to match the incoming list. */
  axes: [SpringState, SpringState, SpringState][];
}

const springPointsCache = createNodeCache<SpringPointsState>();

function getSpringPointsState(nodeId: string): SpringPointsState {
  let state = springPointsCache.get(nodeId);
  if (!state) {
    state = { axes: [] };
    springPointsCache.set(nodeId, state);
  }
  return state;
}

/**
 * Springs each point in a list independently — the "Individual Points" mode
 * that lets Spring Vector drive a *subset* of a mesh (via Mesh to Points /
 * Points Selection / Points to Mesh) while the rest stays rigid. Mask is a
 * continuous 0-1 influence, not a binary switch: every point's spring is
 * always fully integrated (so a low-influence point still carries real
 * velocity/energy underneath), and the influence just blends the *output*
 * between the raw target (0 = rigid, exactly where Points Influence painted
 * it) and the full spring result (1) — a mid-value point visibly springs
 * with reduced amplitude, matching a painted gradient rather than snapping
 * in or out at a threshold.
 *
 * A point count change (the upstream mesh/selection changed shape) reseeds
 * every spring at its new target rather than trying to carry old state across
 * an index space that may no longer mean the same thing — a visible but rare
 * and honest discontinuity, versus silently misapplying stale velocity to
 * the wrong vertex.
 */
function springPoints(
  nodeId: string,
  targets: THREE.Vector3[],
  mask: number[] | null,
  time: number,
  smoothing: number,
  bounciness: number,
): THREE.Vector3[] {
  const state = getSpringPointsState(nodeId);

  const rewound = state.lastTime !== undefined && time < state.lastTime - 0.5;
  const dt = state.lastTime === undefined || rewound ? 0 : Math.max(0, time - state.lastTime);
  const countChanged = state.axes.length !== targets.length;
  const globalReseed = rewound || state.lastTime === undefined || countChanged;
  state.lastTime = time;

  if (countChanged) {
    state.axes = targets.map((p) => [
      { value: p.x, velocity: 0 },
      { value: p.y, velocity: 0 },
      { value: p.z, velocity: 0 },
    ]);
  }

  const out: THREE.Vector3[] = new Array(targets.length);
  for (let i = 0; i < targets.length; i++) {
    const influence = mask !== null ? clamp01(mask[i] ?? 1) : 1;
    const axis = state.axes[i];
    axis[0] = advance(axis[0], targets[i].x, dt, globalReseed, smoothing, bounciness);
    axis[1] = advance(axis[1], targets[i].y, dt, globalReseed, smoothing, bounciness);
    axis[2] = advance(axis[2], targets[i].z, dt, globalReseed, smoothing, bounciness);
    out[i] = new THREE.Vector3(
      targets[i].x + (axis[0].value - targets[i].x) * influence,
      targets[i].y + (axis[1].value - targets[i].y) * influence,
      targets[i].z + (axis[2].value - targets[i].z) * influence,
    );
  }
  return out;
}

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
    // Wiring Points switches this node into "Individual Points" mode: Target
    // is ignored and every point in the list gets its own independent spring
    // instead. Mask (same length, 1 = spring / 0 = hold still) is what lets
    // only *some* of those points move — see springPoints' doc comment.
    { id: "points", label: "Points (Individual)", type: "list" },
    { id: "mask", label: "Influence (1=spring, 0=hold, continuous)", type: "list" },
    // The shortcut that makes "OBJ -> Points Selection -> Spring Vector"
    // work with no other nodes: wire Points Selection's own Geometry
    // passthrough in here alongside Points/Mask, and this node writes the
    // sprung result straight back into a mesh on its own Geometry output —
    // same round-trip Points to Mesh does, just folded in so the operator
    // never sees a points list at all. Points/Mask/Vector outputs still
    // update normally, for anyone who wants the raw values instead.
    //
    // Also switches the spring from local space to WORLD space: Points is
    // always in the mesh's own local space, which is constant for a static
    // mesh no matter how its Location/Rotation/Scale/wired Matrix animates —
    // springing there has nothing to react to. With Geometry wired, the
    // object's *current* world transform is folded in before springing and
    // divided back out afterward, so the selection genuinely lags/overshoots
    // behind the object's own motion (secondary motion / follow-through —
    // an antenna or a cloth corner trailing behind the body it's attached
    // to) while every unselected vertex still rides along perfectly rigid.
    { id: "geometry", label: "Geometry (optional passthrough)", type: "geometry" },
    { id: "time", label: "Time", type: "value" },
    { id: "smoothing", label: "Smoothing", type: "value" },
    { id: "bounciness", label: "Bounciness", type: "value" },
  ],
  outputs: [
    { id: "vector", label: "Vector", type: "vector" },
    { id: "points", label: "Points", type: "list" },
    { id: "geometry", label: "Geometry (when Geometry is wired)", type: "geometry" },
  ],
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
    const time = clockInput(inputs, params, ctx);
    const smoothing = clamp01(numberInput(inputs.smoothing, params.smoothing, 0.4));
    const bounciness = clamp01(numberInput(inputs.bounciness, params.bounciness, 0.3));

    if (Array.isArray(inputs.points)) {
      const localTargets = (inputs.points as unknown[]).map((p) => asVector3(p, new THREE.Vector3(0, 0, 0)));
      const mask = Array.isArray(inputs.mask) ? (inputs.mask as unknown[]).map((m) => Number(m)) : null;

      // With Geometry wired, spring in WORLD space, not the mesh's own local
      // space: Points is always local (Mesh to Points / Points Selection's
      // convention), so a static local vertex position gives the spring
      // nothing to react to even while the *object* is animated (moved,
      // rotated, wiggled...) upstream — the whole point of wiring Geometry
      // in the first place is "let selected points lag/jiggle behind the
      // object's own motion while the rest stays rigid," and that motion
      // only shows up in the WORLD position, not the constant local one.
      // Springing in world space and converting back afterward is also what
      // keeps a masked-out (held) point exactly rigid with the object even
      // though it round-trips through world space too: local -> world ->
      // (held exactly at that same world target) -> local is the identity
      // transform for an unmoved point, by construction.
      const mesh = inputs.geometry instanceof THREE.Object3D ? findFirstMesh(inputs.geometry) : null;
      if (mesh) {
        const geomObj = inputs.geometry as THREE.Object3D;
        geomObj.updateMatrixWorld(true);
        const matrixWorld = mesh.matrixWorld.clone();
        const inverse = matrixWorld.clone().invert();

        const worldTargets = localTargets.map((p) => p.clone().applyMatrix4(matrixWorld));
        const sprungWorld = springPoints(ctx.nodeId, worldTargets, mask, time, smoothing, bounciness);
        const points = sprungWorld.map((p) => p.clone().applyMatrix4(inverse));

        const geometry = writePointsToMesh(ctx.nodeId, geomObj, points, "Spring Vector");
        return { vector: points[0] ?? new THREE.Vector3(0, 0, 0), points, geometry };
      }

      const points = springPoints(ctx.nodeId, localTargets, mask, time, smoothing, bounciness);
      return { vector: points[0] ?? new THREE.Vector3(0, 0, 0), points };
    }

    const target = asVector3(inputs.target ?? params.target, new THREE.Vector3(0, 0, 0));
    const state = getSpringState(ctx.nodeId, target);

    const rewound = state.lastTime !== undefined && time < state.lastTime - 0.5;
    const dt = state.lastTime === undefined || rewound ? 0 : Math.max(0, time - state.lastTime);
    state.lastTime = time;

    const reseed = rewound || state.lastTime === undefined;
    state.x = advance(state.x, target.x, dt, reseed, smoothing, bounciness);
    state.y = advance(state.y, target.y, dt, reseed, smoothing, bounciness);
    state.z = advance(state.z, target.z, dt, reseed, smoothing, bounciness);

    const vector = new THREE.Vector3(state.x.value, state.y.value, state.z.value);
    return { vector, points: [vector] };
  },
};
