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
});
