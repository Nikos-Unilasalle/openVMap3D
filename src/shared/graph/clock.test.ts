import { describe, expect, test } from "vitest";
import { STEP_SECONDS, createClock, stepsSince, targetStepCount, tickClock } from "./clock";

describe("targetStepCount", () => {
  test("counts whole fixed steps since the epoch", () => {
    const oneSecondLater = 1_000 + 1_000;

    expect(targetStepCount(1_000, oneSecondLater)).toBe(Math.round(1 / STEP_SECONDS));
  });

  test("is zero before the epoch, so clock skew cannot run the graph backwards", () => {
    expect(targetStepCount(5_000, 1_000)).toBe(0);
  });

  test("is zero for a clock that never started", () => {
    expect(targetStepCount(0, Date.now())).toBe(0);
  });

  test("is a pure function of (epoch, now) — the whole point of the sync model", () => {
    expect(targetStepCount(1_234, 987_654)).toBe(targetStepCount(1_234, 987_654));
  });
});

describe("tickClock", () => {
  test("does not mutate the clock it's given", () => {
    const clock = createClock(1_000);
    const frozen = { ...clock };

    tickClock(clock, 2_000);

    expect(clock).toEqual(frozen);
  });

  test("time is step count times the fixed step", () => {
    const next = tickClock(createClock(0), 1_000);

    expect(next.time).toBeCloseTo(next.step * STEP_SECONDS);
  });

  test("two clocks with the same epoch land on the same step for the same instant", () => {
    const a = tickClock(createClock(1_000), 50_000);
    const b = tickClock(createClock(1_000), 50_000);

    expect(a.step).toBe(b.step);
    expect(a.time).toBe(b.time);
  });
});

describe("stepsSince", () => {
  test("counts the shortfall between last-stepped and current step", () => {
    expect(stepsSince(10, 13, 600)).toBe(3);
  });

  test("caps a long stall instead of catching up all at once", () => {
    expect(stepsSince(0, 10_000, 600)).toBe(600);
  });

  test("is zero when nothing has advanced", () => {
    expect(stepsSince(50, 50, 600)).toBe(0);
  });

  test("is never negative for a step count that went backwards", () => {
    expect(stepsSince(50, 10, 600)).toBe(0);
  });
});
