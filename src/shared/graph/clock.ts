/**
 * Ported from OpenVMap's physicsClock.ts, not re-derived: that module proved
 * this exact contract keeps two independent windows in lockstep with zero
 * per-frame IPC — each side derives "how many fixed steps should have
 * happened by now" purely from a shared epoch and its own wall clock, then
 * steps forward to match. A window that reconnects mid-show fast-forwards
 * from the epoch instead of asking the other side for state. See
 * BIBLE.md's "Reusable engineering, not just concepts" section.
 *
 * Single-window today (no output-window split yet), but the contract is
 * written the same way from the start so adding that split later is a sync
 * point, not a rewrite: whatever owns `epoch` broadcasts it once, and every
 * window computes its own `time`/`step` locally from there.
 */

/** Fixed timestep. Every window must use the same one or their graphs part company. */
export const STEP_SECONDS = 1 / 60;

/** How many fixed steps should have elapsed by `nowMs`, given the epoch the clock started counting from. */
export function targetStepCount(epochMs: number, nowMs: number): number {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return 0;
  return Math.max(0, Math.floor((nowMs - epochMs) / 1000 / STEP_SECONDS));
}

export interface ClockState {
  epochMs: number;
  step: number;
  time: number;
}

export function createClock(epochMs: number): ClockState {
  return { epochMs, step: 0, time: 0 };
}

/** Advances the clock to where it should be at `nowMs` — a pure state transition, not a mutation. */
export function tickClock(clock: ClockState, nowMs: number): ClockState {
  const step = targetStepCount(clock.epochMs, nowMs);
  return { epochMs: clock.epochMs, step, time: step * STEP_SECONDS };
}
