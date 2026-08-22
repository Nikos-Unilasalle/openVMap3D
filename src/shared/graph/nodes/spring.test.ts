import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { SPRING_NODE, SPRING_VECTOR_NODE } from "./spring";

function ctx(nodeId: string): EvalContext {
  return { time: 0, step: 0, nodeId };
}

describe("SPRING_NODE", () => {
  it("seeds at the target on the first frame — no snap-in from 0", () => {
    const res = SPRING_NODE.evaluate({ target: 5, time: 0 }, SPRING_NODE.defaultParams, ctx("s1"));
    expect(res.value).toBe(5);
  });

  it("lags behind a target that changes after the first frame", () => {
    const nodeId = "s2";
    SPRING_NODE.evaluate({ target: 0, time: 0 }, SPRING_NODE.defaultParams, ctx(nodeId));
    const res = SPRING_NODE.evaluate({ target: 10, time: 1 / 60 }, SPRING_NODE.defaultParams, ctx(nodeId));
    expect(res.value).toBeGreaterThan(0);
    expect(res.value).toBeLessThan(10);
  });

  it("eventually converges on the target and stays there", () => {
    const nodeId = "s3";
    const params = { ...SPRING_NODE.defaultParams, smoothing: 0.3, bounciness: 0.2 };
    SPRING_NODE.evaluate({ target: 0, time: 0 }, params, ctx(nodeId));
    let t = 0;
    let last = 0;
    for (let i = 0; i < 300; i++) {
      t += 1 / 60;
      last = SPRING_NODE.evaluate({ target: 10, time: t }, params, ctx(nodeId)).value as number;
    }
    expect(last).toBeCloseTo(10, 1);
  });

  it("bounciness 0 never overshoots the target", () => {
    const nodeId = "s4";
    const params = { ...SPRING_NODE.defaultParams, smoothing: 0.4, bounciness: 0 };
    SPRING_NODE.evaluate({ target: 0, time: 0 }, params, ctx(nodeId));
    let t = 0;
    let max = -Infinity;
    for (let i = 0; i < 120; i++) {
      t += 1 / 60;
      const v = SPRING_NODE.evaluate({ target: 10, time: t }, params, ctx(nodeId)).value as number;
      max = Math.max(max, v);
    }
    expect(max).toBeLessThanOrEqual(10 + 1e-6);
  });

  it("bounciness near 1 overshoots the target before settling", () => {
    const nodeId = "s5";
    const params = { ...SPRING_NODE.defaultParams, smoothing: 0.4, bounciness: 0.95 };
    SPRING_NODE.evaluate({ target: 0, time: 0 }, params, ctx(nodeId));
    let t = 0;
    let max = -Infinity;
    for (let i = 0; i < 120; i++) {
      t += 1 / 60;
      const v = SPRING_NODE.evaluate({ target: 10, time: t }, params, ctx(nodeId)).value as number;
      max = Math.max(max, v);
    }
    expect(max).toBeGreaterThan(10);
  });

  it("a real scrub backwards reseeds at the target instead of springing across the jump", () => {
    const nodeId = "s6";
    const params = { ...SPRING_NODE.defaultParams, smoothing: 0.5, bounciness: 0.5 };
    SPRING_NODE.evaluate({ target: 0, time: 0 }, params, ctx(nodeId));
    SPRING_NODE.evaluate({ target: 10, time: 1 }, params, ctx(nodeId));
    const res = SPRING_NODE.evaluate({ target: 3, time: 0 }, params, ctx(nodeId));
    expect(res.value).toBe(3);
  });
});

describe("SPRING_VECTOR_NODE", () => {
  it("springs each axis independently toward the target vector", () => {
    const nodeId = "sv1";
    const params = { ...SPRING_VECTOR_NODE.defaultParams, smoothing: 0.3, bounciness: 0.2 };
    SPRING_VECTOR_NODE.evaluate({ target: new THREE.Vector3(0, 0, 0), time: 0 }, params, ctx(nodeId));
    let t = 0;
    let last = new THREE.Vector3();
    for (let i = 0; i < 300; i++) {
      t += 1 / 60;
      last = SPRING_VECTOR_NODE.evaluate({ target: new THREE.Vector3(5, -2, 1), time: t }, params, ctx(nodeId))
        .vector as THREE.Vector3;
    }
    expect(last.x).toBeCloseTo(5, 1);
    expect(last.y).toBeCloseTo(-2, 1);
    expect(last.z).toBeCloseTo(1, 1);
  });

  it("a target moving only in X does not perturb Y or Z", () => {
    const nodeId = "sv2";
    const params = { ...SPRING_VECTOR_NODE.defaultParams, smoothing: 0.4, bounciness: 0.5 };
    SPRING_VECTOR_NODE.evaluate({ target: new THREE.Vector3(0, 2, -3), time: 0 }, params, ctx(nodeId));
    const res = SPRING_VECTOR_NODE.evaluate({ target: new THREE.Vector3(10, 2, -3), time: 1 / 60 }, params, ctx(nodeId));
    const v = res.vector as THREE.Vector3;
    expect(v.y).toBeCloseTo(2, 6);
    expect(v.z).toBeCloseTo(-3, 6);
  });
});
