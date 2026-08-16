import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { evaluateKeyframeValue, interpolateValue } from "./evaluate";
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
    expect(interpolateValue(0, 100, 0.25, "linear", "linear")).toBeCloseTo(25);
    expect(interpolateValue(0, 100, 0.5, "linear", "linear")).toBeCloseTo(50);
    expect(interpolateValue(0, 100, 0.75, "linear", "linear")).toBeCloseTo(75);
  });

  it("supports hold easing", () => {
    // Hold stays at initial value until t = 1.0
    expect(interpolateValue(0, 100, 0, "hold", "smooth")).toBe(0);
    expect(interpolateValue(0, 100, 0.5, "hold", "smooth")).toBe(0);
    expect(interpolateValue(0, 100, 0.99, "hold", "smooth")).toBe(0);
    expect(interpolateValue(0, 100, 1.0, "hold", "smooth")).toBe(100);
  });

  it("supports expo, back, bounce, and elastic easings", () => {
    // Expo has high contrast acceleration/deceleration
    const expoMid = interpolateValue(0, 100, 0.5, "expo", "expo");
    expect(expoMid).toBeCloseTo(50);

    // Back has anticipation / overshoot
    const backOut = interpolateValue(0, 100, 0.4, "back", "back");
    expect(typeof backOut).toBe("number");

    // Bounce: physically travels fast towards destination then bounces
    const bounceMid = interpolateValue(0, 100, 0.5, "bounce", "bounce");
    expect(bounceMid).toBeGreaterThan(50);
    expect(interpolateValue(0, 100, 0, "bounce", "bounce")).toBe(0);
    expect(interpolateValue(0, 100, 1, "bounce", "bounce")).toBe(100);

    // Elastic: reaches target with spring oscillation
    const elasticOut = interpolateValue(0, 100, 1, "elastic", "elastic");
    expect(elasticOut).toBe(100);
    expect(interpolateValue(0, 100, 0, "elastic", "elastic")).toBe(0);
  });

  it("evaluates keyframes with custom easeIn and easeOut per keyframe", () => {
    const keyframes: KeyframeStore = {
      "node-1": {
        val: [
          { frame: 0, value: 0, easeOut: "hold" },
          { frame: 50, value: 100, easeIn: "linear", easeOut: "linear" },
          { frame: 100, value: 200, easeIn: "bounce" },
        ],
      },
    };

    // Between 0 and 50 with hold on k1:
    expect(evaluateKeyframeValue(keyframes, "node-1", "val", 0, -1)).toBe(0);
    expect(evaluateKeyframeValue(keyframes, "node-1", "val", 25, -1)).toBe(0);
    expect(evaluateKeyframeValue(keyframes, "node-1", "val", 49, -1)).toBe(0);
    expect(evaluateKeyframeValue(keyframes, "node-1", "val", 50, -1)).toBe(100);

    // Between 50 and 100: at 75 with linear out
    const val75 = evaluateKeyframeValue(keyframes, "node-1", "val", 75, -1);
    expect(val75).toBeGreaterThan(100);
    expect(val75).toBeLessThan(200);
    expect(evaluateKeyframeValue(keyframes, "node-1", "val", 100, -1)).toBe(200);
  });
});
