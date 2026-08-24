import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { computeSegmentEasing, evaluateKeyframeValue, interpolateValue } from "./evaluate";
import { KeyframeStore } from "./types";

describe("KEYFRAME ANIMATION SYSTEM", () => {
  it("interpolates scalar values with non-linear sinusoidal easing", () => {
    const start = 0;
    const end = 100;
    // At t = 0 -> 0
    expect(interpolateValue(start, end, 0)).toBe(0);
    // At t = 0.5 -> 50 (midpoint of sinusoidal ease)
    expect(interpolateValue(start, end, 0.5)).toBeCloseTo(50);
    // At t = 1.0 -> 100
    expect(interpolateValue(start, end, 1.0)).toBe(100);

    // Sinusoidal easing slows down near 0 and 1:
    // at t = 0.25, sin ease = (1 - cos(pi/4))/2 = (1 - 0.7071)/2 = 0.1464 -> 14.64
    expect(interpolateValue(start, end, 0.25)).toBeLessThan(25);
  });

  it("interpolates Vector3 components with sinusoidal easing", () => {
    const v1 = new THREE.Vector3(0, 10, 20);
    const v2 = new THREE.Vector3(100, 110, 120);

    const mid = interpolateValue(v1, v2, 0.5) as THREE.Vector3;
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(60);
    expect(mid.z).toBeCloseTo(70);
  });

  it("evaluates keyframes store at exact frames and interpolated frames", () => {
    const keyframes: KeyframeStore = {
      "node-1": {
        location: [
          { frame: 0, value: 0 },
          { frame: 100, value: 200 },
        ],
      },
    };

    expect(evaluateKeyframeValue(keyframes, "node-1", "location", 0, -1)).toBe(0);
    expect(evaluateKeyframeValue(keyframes, "node-1", "location", 100, -1)).toBe(200);
    expect(evaluateKeyframeValue(keyframes, "node-1", "location", 50, -1)).toBeCloseTo(100);
  });

  it("returns fallback value when keyframes are disabled or empty", () => {
    const keyframes: KeyframeStore = {};
    expect(evaluateKeyframeValue(keyframes, "node-1", "location", 10, 42)).toBe(42);
    expect(evaluateKeyframeValue(undefined, "node-1", "location", 10, 42)).toBe(42);
  });

  it("supports linear easing", () => {
    expect(interpolateValue(0, 100, 0.25, "linear")).toBeCloseTo(25);
    expect(interpolateValue(0, 100, 0.5, "linear")).toBeCloseTo(50);
    expect(interpolateValue(0, 100, 0.75, "linear")).toBeCloseTo(75);
  });

  it("supports hold easing", () => {
    // Hold stays at initial value until t = 1.0
    expect(interpolateValue(0, 100, 0, "hold")).toBe(0);
    expect(interpolateValue(0, 100, 0.5, "hold")).toBe(0);
    expect(interpolateValue(0, 100, 0.99, "hold")).toBe(0);
    expect(interpolateValue(0, 100, 1.0, "hold")).toBe(100);
  });

  it("supports expo, back, bounce, and elastic easings", () => {
    // Expo arrival is an exponential deceleration: most of the travel happens
    // up front, then it eases into the keyframe value.
    const expoMid = interpolateValue(0, 100, 0.5, "expo");
    expect(expoMid).toBeGreaterThan(50);
    expect(interpolateValue(0, 100, 0.5, "expo")).toBeLessThan(100);
    expect(interpolateValue(0, 100, 1, "expo")).toBe(100);

    // Back has anticipation / overshoot
    const backOut = interpolateValue(0, 100, 0.4, "back");
    expect(typeof backOut).toBe("number");

    // Bounce: physically travels fast towards destination then bounces
    const bounceMid = interpolateValue(0, 100, 0.5, "bounce");
    expect(bounceMid).toBeGreaterThan(50);
    expect(interpolateValue(0, 100, 0, "bounce")).toBe(0);
    expect(interpolateValue(0, 100, 1, "bounce")).toBe(100);

    // Elastic: reaches target with spring oscillation
    const elasticOut = interpolateValue(0, 100, 1, "elastic");
    expect(elasticOut).toBe(100);
    expect(interpolateValue(0, 100, 0, "elastic")).toBe(0);
  });

  it("supports a custom cubic-bezier easing", () => {
    // Symmetric bezier → mid stays at mid.
    expect(computeSegmentEasing(0.5, "bezier", undefined, [0.42, 0, 0.58, 1])).toBeCloseTo(0.5, 3);
    // Degenerate [0,0,1,1] is the linear curve.
    expect(computeSegmentEasing(0.3, "bezier", undefined, [0, 0, 1, 1])).toBeCloseTo(0.3, 3);
    // Endpoints are exact regardless of the control points.
    expect(computeSegmentEasing(0, "bezier", undefined, [0.34, 1.56, 0.64, 1])).toBe(0);
    expect(computeSegmentEasing(1, "bezier", undefined, [0.34, 1.56, 0.64, 1])).toBe(1);
    // Overshoot bezier exceeds 1 mid-curve.
    expect(computeSegmentEasing(0.5, "bezier", undefined, [0.34, 1.56, 0.64, 1])).toBeGreaterThan(1);

    // The control points flow through keyframe evaluation.
    const keyframes: KeyframeStore = {
      "node-1": {
        val: [
          { frame: 0, value: 0 },
          { frame: 100, value: 100, easeIn: "bezier", easeBezier: [0, 0, 1, 1] },
        ],
      },
    };
    expect(evaluateKeyframeValue(keyframes, "node-1", "val", 50, -1)).toBeCloseTo(50, 3);
  });

  it("strength tunes every easing (expo exponent, back overshoot, others blend to linear)", () => {
    // Expo: default exponent 10 → ~97% at the midpoint; higher is more front-loaded.
    expect(computeSegmentEasing(0.5, "expo")).toBeCloseTo(0.96875, 5);
    expect(computeSegmentEasing(0.5, "expo", 20)).toBeCloseTo(1 - Math.pow(2, -10), 5);

    // Back: strength = overshoot amount — 0 removes the overshoot, high overshoots.
    expect(computeSegmentEasing(0.5, "back", 0)).toBeCloseTo(1 + Math.pow(-0.5, 3), 5);
    expect(computeSegmentEasing(0.5, "back", 3)).toBeGreaterThan(1);

    // smooth / bounce / elastic: 0..1 blend toward linear (0 = linear, 1 = full).
    expect(computeSegmentEasing(0.25, "smooth", 0)).toBeCloseTo(0.25);
    expect(computeSegmentEasing(0.25, "bounce", 0)).toBeCloseTo(0.25);
    expect(computeSegmentEasing(0.25, "elastic", 0)).toBeCloseTo(0.25);
    expect(computeSegmentEasing(0.25, "smooth")).toBeCloseTo((1 - Math.cos(Math.PI * 0.25)) / 2);
    // Blending partially toward linear keeps the endpoints exact.
    expect(computeSegmentEasing(0, "smooth", 0.5)).toBe(0);
    expect(computeSegmentEasing(1, "smooth", 0.5)).toBe(1);

    // The strength flows through keyframe evaluation.
    const keyframes: KeyframeStore = {
      "node-1": {
        val: [
          { frame: 0, value: 0 },
          { frame: 100, value: 100, easeIn: "expo", easeStrength: 1 },
        ],
      },
    };
    const gentle = evaluateKeyframeValue(keyframes, "node-1", "val", 50, -1) as number;
    expect(gentle).toBeLessThan(50);
  });

  it("interpolates a curve's pointsList element-wise when both keyframes have the same point count", () => {
    const v1 = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)];
    const v2 = [new THREE.Vector3(0, 10, 0), new THREE.Vector3(10, 10, 0)];

    const mid = interpolateValue(v1, v2, 0.5, "linear") as THREE.Vector3[];
    expect(mid).toHaveLength(2);
    expect(mid[0].y).toBeCloseTo(5);
    expect(mid[1].y).toBeCloseTo(5);
    expect(mid[1].x).toBeCloseTo(10);

    // Plain {x,y,z} objects (what a saved .tsuji file round-trips pointsList
    // as) interpolate the same way as real Vector3s.
    const p1 = [{ x: 0, y: 0, z: 0 }];
    const p2 = [{ x: 100, y: 0, z: 0 }];
    const plainMid = interpolateValue(p1, p2, 0.5, "linear") as THREE.Vector3[];
    expect(plainMid[0].x).toBeCloseTo(50);
  });

  it("falls back to a snap when pointsList keyframes disagree on point count", () => {
    const v1 = [new THREE.Vector3(0, 0, 0)];
    const v2 = [new THREE.Vector3(1, 1, 1), new THREE.Vector3(2, 2, 2)];

    expect(interpolateValue(v1, v2, 0.25)).toBe(v1);
    expect(interpolateValue(v1, v2, 0.75)).toBe(v2);
  });

  it("each keyframe carries a single arrival easing that shapes its incoming segment", () => {
    const keyframes: KeyframeStore = {
      "node-1": {
        val: [
          { frame: 0, value: 0 },
          { frame: 50, value: 100, easeIn: "hold" },
          { frame: 100, value: 200, easeIn: "bounce" },
        ],
      },
    };

    // Between 0 and 50, hold on the arriving keyframe (frame 50):
    expect(evaluateKeyframeValue(keyframes, "node-1", "val", 0, -1)).toBe(0);
    expect(evaluateKeyframeValue(keyframes, "node-1", "val", 25, -1)).toBe(0);
    expect(evaluateKeyframeValue(keyframes, "node-1", "val", 49, -1)).toBe(0);
    expect(evaluateKeyframeValue(keyframes, "node-1", "val", 50, -1)).toBe(100);

    // Between 50 and 100: bounce into the frame-100 keyframe.
    const val75 = evaluateKeyframeValue(keyframes, "node-1", "val", 75, -1);
    expect(val75).toBeGreaterThan(100);
    expect(val75).toBeLessThan(200);
    expect(evaluateKeyframeValue(keyframes, "node-1", "val", 100, -1)).toBe(200);
  });
});
