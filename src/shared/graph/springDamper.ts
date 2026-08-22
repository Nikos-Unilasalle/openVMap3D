import { STEP_SECONDS } from "./clock";

/**
 * One step of a damped spring chasing `target`, shared by every node that
 * wants "ease toward a value, optionally overshoot" — Squash & Stretch's
 * bounce-on-stop and the Spring node both reduce to this same integrator so
 * a given Smoothing/Bounciness pair feels identical wherever it's used.
 *
 * `smoothing` (0-1) maps to the spring's response speed: 0 keeps the spring
 * fully rigid (see `stepValueTowardTarget` below for what that collapses
 * to), 1 is sluggish. `bounciness` (0-1) maps to damping ratio: 0 is
 * critically damped (eases in, never overshoots), 1 is lightly damped
 * (rings past the target before settling) — that overshoot is what reads as
 * a bounce, or, if the target is a stretch amount that just dropped to 0, a
 * squash.
 */
export interface SpringState {
  value: number;
  velocity: number;
}

// This is explicit (semi-implicit) Euler, which is only numerically stable
// for dt below roughly 2/omega — fine for a steady ~16ms frame even at the
// snappiest omega (30 -> ~67ms bound), but `ctx.time` is derived from the
// WALL clock (see clock.ts), not accumulated per-frame delta: a frame slow
// enough (a heavy mesh, hundreds of thousands of Individual-Points springs)
// makes the NEXT frame's dt jump by however long that frame actually took.
// Past the stability bound, Euler doesn't just lose accuracy, it diverges —
// each step overshoots harder than the last, exponentially — so the spring
// rockets to a huge distance, which makes the mesh's own bounding sphere/
// geometry update even more expensive, which makes the NEXT frame slower
// too. That feedback loop is what turns "one slow frame" into a crash.
// Capping substep size below the stability bound (and capping how much
// total time one call will ever integrate, so a real stall — a debugger
// pause, a backgrounded tab — can't demand thousands of substeps at once)
// fixes both: the spring never diverges, and a lag spike costs a bounded
// amount of extra work instead of an unbounded one.
const MAX_SUBSTEP_DT = STEP_SECONDS * 2; // ~33ms — well under the ~67ms bound even at the snappiest omega (30)
const MAX_TOTAL_DT = STEP_SECONDS * 16; // ~267ms — a longer stall falls behind real time rather than substepping without bound

/**
 * The per-frame constants every spring in one evaluation shares. Split out
 * so a bulk caller (Spring Vector's Individual Points mode, which may be
 * integrating hundreds of thousands of independent springs against the same
 * dt/smoothing/bounciness) can hoist this work out of its inner loop and
 * inline the integration over typed arrays — without re-deriving, or drifting
 * from, the stability policy documented above. `stepDampedSpring` below is
 * the same math for the one-value-at-a-time callers.
 */
export interface SpringCoefficients {
  omega: number;
  zeta: number;
  substeps: number;
  stepDt: number;
}

export function springCoefficients(dt: number, smoothing: number, bounciness: number): SpringCoefficients {
  const clampedDt = Math.min(Math.max(0, dt), MAX_TOTAL_DT);
  const substeps = Math.max(1, Math.ceil(clampedDt / MAX_SUBSTEP_DT));
  return {
    omega: 30 + (2 - 30) * smoothing, // response speed, rad/s-ish: smoothing=0 -> snappy, 1 -> sluggish
    zeta: 1 + (0.2 - 1) * bounciness, // damping ratio: bounciness=0 -> critically damped, 1 -> underdamped/bouncy
    substeps,
    stepDt: clampedDt / substeps,
  };
}

export function stepDampedSpring(state: SpringState, target: number, dt: number, smoothing: number, bounciness: number): SpringState {
  if (dt <= 0) return state;
  const { omega, zeta, substeps, stepDt } = springCoefficients(dt, smoothing, bounciness);

  let { value, velocity } = state;
  for (let i = 0; i < substeps; i++) {
    const accel = omega * omega * (target - value) - 2 * zeta * omega * velocity;
    velocity = velocity + accel * stepDt;
    value = value + velocity * stepDt;
  }
  return { value, velocity };
}
