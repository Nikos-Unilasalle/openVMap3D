import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { VELOCITY_NODE } from "./velocity";

function ctx(nodeId: string): EvalContext {
  return { time: 0, step: 0, nodeId };
}

function matrixAt(x: number, y: number, z: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, y, z);
}

describe("VELOCITY_NODE", () => {
  it("reports zero speed on the first frame — nothing to measure a delta against yet", () => {
    const res = VELOCITY_NODE.evaluate({ matrix: matrixAt(0, 0, 0), time: 0 }, VELOCITY_NODE.defaultParams, ctx("v1"));
    expect(res.speed).toBe(0);
    const vel = res.velocity as THREE.Vector3;
    expect(vel.length()).toBe(0);
  });

  it("measures speed as distance/time between two frames", () => {
    const nodeId = "v2";
    VELOCITY_NODE.evaluate({ matrix: matrixAt(0, 0, 0), time: 0 }, VELOCITY_NODE.defaultParams, ctx(nodeId));
    // moved 6 units in X over 2 seconds -> speed 3
    const res = VELOCITY_NODE.evaluate({ matrix: matrixAt(6, 0, 0), time: 2 }, VELOCITY_NODE.defaultParams, ctx(nodeId));
    expect(res.speed).toBeCloseTo(3, 5);
  });

  it("velocity vector points in the direction of travel, magnitude = speed", () => {
    const nodeId = "v3";
    VELOCITY_NODE.evaluate({ matrix: matrixAt(0, 0, 0), time: 0 }, VELOCITY_NODE.defaultParams, ctx(nodeId));
    const res = VELOCITY_NODE.evaluate({ matrix: matrixAt(0, 4, 0), time: 1 }, VELOCITY_NODE.defaultParams, ctx(nodeId));
    const vel = res.velocity as THREE.Vector3;
    expect(vel.x).toBeCloseTo(0);
    expect(vel.y).toBeCloseTo(4);
    expect(vel.z).toBeCloseTo(0);
    expect(res.speed).toBeCloseTo(4);
  });

  it("reports zero speed the instant the object stops moving", () => {
    const nodeId = "v4";
    VELOCITY_NODE.evaluate({ matrix: matrixAt(0, 0, 0), time: 0 }, VELOCITY_NODE.defaultParams, ctx(nodeId));
    VELOCITY_NODE.evaluate({ matrix: matrixAt(5, 0, 0), time: 1 }, VELOCITY_NODE.defaultParams, ctx(nodeId));
    const res = VELOCITY_NODE.evaluate({ matrix: matrixAt(5, 0, 0), time: 2 }, VELOCITY_NODE.defaultParams, ctx(nodeId));
    expect(res.speed).toBe(0);
  });

  it("a same-instant re-evaluate (split view evaluating twice per frame) keeps the last measurement instead of reading as 'not moving'", () => {
    const nodeId = "v5";
    VELOCITY_NODE.evaluate({ matrix: matrixAt(0, 0, 0), time: 0 }, VELOCITY_NODE.defaultParams, ctx(nodeId));
    const first = VELOCITY_NODE.evaluate({ matrix: matrixAt(3, 0, 0), time: 1 }, VELOCITY_NODE.defaultParams, ctx(nodeId));
    // Re-evaluate at the SAME time (second pane, same frame) — speed must
    // not reset to 0.
    const second = VELOCITY_NODE.evaluate({ matrix: matrixAt(3, 0, 0), time: 1 }, VELOCITY_NODE.defaultParams, ctx(nodeId));
    expect(second.speed).toBeCloseTo(first.speed as number);
  });

  it("a real scrub backwards reseeds at zero instead of measuring a velocity across the jump", () => {
    const nodeId = "v6";
    VELOCITY_NODE.evaluate({ matrix: matrixAt(0, 0, 0), time: 0 }, VELOCITY_NODE.defaultParams, ctx(nodeId));
    VELOCITY_NODE.evaluate({ matrix: matrixAt(10, 0, 0), time: 5 }, VELOCITY_NODE.defaultParams, ctx(nodeId));
    const res = VELOCITY_NODE.evaluate({ matrix: matrixAt(0, 0, 0), time: 0 }, VELOCITY_NODE.defaultParams, ctx(nodeId));
    expect(res.speed).toBe(0);
  });

  it("no matrix wired defaults to identity without throwing", () => {
    const res = VELOCITY_NODE.evaluate({}, VELOCITY_NODE.defaultParams, ctx("v7"));
    expect(res.speed).toBe(0);
  });
});
