import { describe, expect, it } from "vitest";
import { EASING_STRENGTH_CONFIG, strengthForEasing } from "./EasingPopover";
import { computeSegmentEasing } from "../shared/graph/evaluate";
import { EasingType } from "../shared/graph/types";

const WITH_KNOB = (Object.keys(EASING_STRENGTH_CONFIG) as EasingType[]).filter(
  (t) => EASING_STRENGTH_CONFIG[t] !== null,
);
const WITHOUT_KNOB = (Object.keys(EASING_STRENGTH_CONFIG) as EasingType[]).filter(
  (t) => EASING_STRENGTH_CONFIG[t] === null,
);

describe("strengthForEasing", () => {
  it("never carries a strength across easings that scale it differently", () => {
    // expo reads strength as an exponent over 1..20; smooth reads it as a
    // 0..1 blend toward linear. Handing expo's 10 to smooth used to swing the
    // segment far outside the keyframes it runs between.
    expect(strengthForEasing("smooth", "expo", 10)).toBe(EASING_STRENGTH_CONFIG.smooth!.defaultValue);
    expect(strengthForEasing("back", "expo", 10)).toBe(EASING_STRENGTH_CONFIG.back!.defaultValue);
    expect(strengthForEasing("expo", "smooth", 1)).toBe(EASING_STRENGTH_CONFIG.expo!.defaultValue);
  });

  it("keeps the tuning between easings that share a scale", () => {
    // smooth / bounce / elastic are all "0..1 blend toward linear", so a
    // deliberate 0.3 survives trying the segment as each of them.
    expect(strengthForEasing("bounce", "smooth", 0.3)).toBe(0.3);
    expect(strengthForEasing("elastic", "bounce", 0.3)).toBe(0.3);
    expect(strengthForEasing("smooth", "elastic", 0.3)).toBe(0.3);
  });

  it("drops the strength for easings that take none", () => {
    for (const t of WITHOUT_KNOB) {
      expect(strengthForEasing(t, "expo", 10)).toBeUndefined();
    }
  });

  it("gives a knobbed easing its own default when coming from one without", () => {
    for (const from of WITHOUT_KNOB) {
      for (const to of WITH_KNOB) {
        expect(strengthForEasing(to, from, 10)).toBe(EASING_STRENGTH_CONFIG[to]!.defaultValue);
      }
    }
  });

  it("always lands within the target easing's own slider range", () => {
    // The popover's slider is bounded by this config; a value outside it would
    // render as a number the control cannot represent.
    for (const from of Object.keys(EASING_STRENGTH_CONFIG) as EasingType[]) {
      for (const to of WITH_KNOB) {
        for (const carried of [0, 0.3, 1, 1.70158, 5, 10, 20]) {
          const s = strengthForEasing(to, from, carried)!;
          const cfg = EASING_STRENGTH_CONFIG[to]!;
          expect(s).toBeGreaterThanOrEqual(cfg.min);
          expect(s).toBeLessThanOrEqual(cfg.max);
        }
      }
    }
  });

  it("never makes a curve wilder than picking that easing fresh", () => {
    // The real symptom: an out-of-scale strength makes blendToLinear
    // extrapolate rather than blend, so the value swings past both ends of
    // the segment. Bounds are compared against the same easing at its own
    // default, not against 0..1 — back and elastic overshoot by design, and
    // that is the shape the user asked for by choosing them.
    const samples = [...Array(41)].map((_, i) => i / 40);
    for (const to of WITH_KNOB) {
      // The envelope of everything this easing can legitimately do — its
      // slider swept end to end. Re-picking the easing you already have keeps
      // your tuning rather than resetting it, so a shared-scale carry has to
      // be judged against the whole range, not just the default.
      const cfg = EASING_STRENGTH_CONFIG[to]!;
      const legal: number[] = [];
      for (let i = 0; i <= 20; i++) {
        const s = cfg.min + ((cfg.max - cfg.min) * i) / 20;
        for (const p of samples) legal.push(computeSegmentEasing(p, to, s));
      }
      const freshMin = Math.min(...legal);
      const freshMax = Math.max(...legal);

      for (const from of Object.keys(EASING_STRENGTH_CONFIG) as EasingType[]) {
        for (const carried of [0, 0.3, 1, 1.70158, 5, 10, 20]) {
          const s = strengthForEasing(to, from, carried);
          for (const p of samples) {
            const v = computeSegmentEasing(p, to, s);
            expect(v).toBeGreaterThanOrEqual(freshMin - 0.001);
            expect(v).toBeLessThanOrEqual(freshMax + 0.001);
          }
        }
      }
    }
  });

  it("regression: expo's strength reaching smooth used to swing the segment outside it", () => {
    // The exact broken path, kept as the shape of the bug: picking Smooth on
    // a keyframe that was Expo carried the exponent 10 into a 0..1 blend.
    const broken = [0.25, 0.75].map((p) => computeSegmentEasing(p, "smooth", 10));
    expect(Math.min(...broken)).toBeLessThan(0);
    expect(Math.max(...broken)).toBeGreaterThan(1);

    const s = strengthForEasing("smooth", "expo", 10);
    const fixed = [0.25, 0.75].map((p) => computeSegmentEasing(p, "smooth", s));
    expect(Math.min(...fixed)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...fixed)).toBeLessThanOrEqual(1);
  });
});
