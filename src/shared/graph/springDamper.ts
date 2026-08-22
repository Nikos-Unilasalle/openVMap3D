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

export function stepDampedSpring(state: SpringState, target: number, dt: number, smoothing: number, bounciness: number): SpringState {
  if (dt <= 0) return state;
  const omega = 30 + (2 - 30) * smoothing; // response speed, rad/s-ish: smoothing=0 -> snappy, 1 -> sluggish
  const zeta = 1 + (0.2 - 1) * bounciness; // damping ratio: bounciness=0 -> critically damped, 1 -> underdamped/bouncy
  const accel = omega * omega * (target - state.value) - 2 * zeta * omega * state.velocity;
  const velocity = state.velocity + accel * dt;
  const value = state.value + velocity * dt;
  return { value, velocity };
}
