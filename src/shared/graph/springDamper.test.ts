import { describe, expect, it } from "vitest";
import { stepDampedSpring } from "./springDamper";

describe("stepDampedSpring", () => {
  it("a normal ~16ms frame steps smoothly toward the target", () => {
    const state = stepDampedSpring({ value: 0, velocity: 0 }, 10, 1 / 60, 0.4, 0.3);
    expect(state.value).toBeGreaterThan(0);
    expect(state.value).toBeLessThan(10);
    expect(Number.isFinite(state.value)).toBe(true);
  });

  it("a huge dt from a slow/laggy frame does not diverge — this was the 80k-face-mesh crash", () => {
    // A frame heavy enough to take a full second (an 80k-face mesh's worth
    // of Individual-Points springs, say) used to feed a dt of 1s straight
    // into explicit Euler at omega up to 30 — wildly past the ~67ms
    // stability bound — and the spring would rocket to a huge, eventually
    // NaN/Infinity distance within a handful of frames.
    let state = { value: 0, velocity: 0 };
    for (let i = 0; i < 10; i++) {
      state = stepDampedSpring(state, 10, 1, 0, 1); // snappiest omega, bounciest zeta, worst case
      expect(Number.isFinite(state.value)).toBe(true);
      expect(Number.isFinite(state.velocity)).toBe(true);
      expect(Math.abs(state.value)).toBeLessThan(1000);
    }
  });

  it("an extreme stall (minutes) still resolves to a finite, converged value, not a runaway", () => {
    const state = stepDampedSpring({ value: 0, velocity: 0 }, 5, 300, 0.4, 0.3);
    expect(Number.isFinite(state.value)).toBe(true);
    expect(Math.abs(state.value)).toBeLessThan(1000);
  });

  it("settles at the target under normal repeated stepping (critically damped, no overshoot)", () => {
    let state = { value: 0, velocity: 0 };
    for (let i = 0; i < 300; i++) {
      state = stepDampedSpring(state, 10, 1 / 60, 1, 0);
    }
    expect(state.value).toBeCloseTo(10, 1);
  });

  it("dt <= 0 is a no-op", () => {
    const state = { value: 3, velocity: 1 };
    expect(stepDampedSpring(state, 10, 0, 0.4, 0.3)).toEqual(state);
    expect(stepDampedSpring(state, 10, -1, 0.4, 0.3)).toEqual(state);
  });
});
