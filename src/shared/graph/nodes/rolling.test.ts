import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { ROLLING_NODE } from "./rolling";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "rolling-test" };

describe("ROLLING_NODE", () => {
  it("does not spin on its first read, however far from the origin it starts", () => {
    const res = ROLLING_NODE.evaluate(
      { position: new THREE.Vector3(50, 0, -30) },
      ROLLING_NODE.defaultParams,
      { ...CTX, nodeId: "roll-start" },
    );
    const rot = res.rotation as THREE.Vector3;
    expect(rot.x).toBeCloseTo(0);
    expect(rot.y).toBeCloseTo(0);
    expect(rot.z).toBeCloseTo(0);
  });

  it("rolls forward the exact rolling-without-slipping angle for a straight run", () => {
    const ctx = { ...CTX, nodeId: "roll-straight" };
    const radius = 0.5;
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0), radius }, {}, ctx);
    // Travels exactly one circumference — should land back at its start orientation (mod 2π).
    const distance = 2 * Math.PI * radius;
    const res = ROLLING_NODE.evaluate({ position: new THREE.Vector3(distance, 0, 0), radius }, {}, ctx);
    const rot = res.rotation as THREE.Vector3;
    // A full rotation about Z (or -Z) — Euler angle wraps, so check via the
    // underlying quaternion angle instead of the raw Euler component.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z));
    const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    expect(angle).toBeCloseTo(0, 3); // full turn = back to identity
  });

  it("rotates about the axis perpendicular to both up and the direction of travel", () => {
    const ctx = { ...CTX, nodeId: "roll-axis" };
    const radius = 1;
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0), radius, axis: new THREE.Vector3(0, 1, 0) }, {}, ctx);
    // Quarter-circumference along +X — a quarter turn (π/2 rad at radius 1).
    const res = ROLLING_NODE.evaluate(
      { position: new THREE.Vector3(Math.PI / 2, 0, 0), radius, axis: new THREE.Vector3(0, 1, 0) },
      {},
      ctx,
    );
    const rot = res.rotation as THREE.Vector3;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z));
    // Rolling +X with up=+Y turns about -Z: check by rotating the ball's local
    // +Y ("top") point and confirming it moved toward +X, not -X.
    const top = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    expect(top.x).toBeGreaterThan(0.9);
    expect(top.y).toBeCloseTo(0, 3);
  });

  it("does not roll for movement purely along the rolling-plane normal (straight up)", () => {
    const ctx = { ...CTX, nodeId: "roll-vertical" };
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0) }, {}, ctx);
    const res = ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 5, 0) }, {}, ctx);
    const rot = res.rotation as THREE.Vector3;
    expect(rot.x).toBeCloseTo(0);
    expect(rot.y).toBeCloseTo(0);
    expect(rot.z).toBeCloseTo(0);
  });

  it("accumulates across many small steps rather than resetting each frame", () => {
    const ctx = { ...CTX, nodeId: "roll-accum" };
    const radius = 1;
    let x = 0;
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0), radius }, {}, ctx);
    let last: THREE.Vector3 = new THREE.Vector3();
    for (let i = 0; i < 10; i++) {
      x += 0.3;
      last = ROLLING_NODE.evaluate({ position: new THREE.Vector3(x, 0, 0), radius }, {}, ctx).rotation as THREE.Vector3;
    }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(last.x, last.y, last.z));
    const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    // Total travel 3.0 at radius 1 -> 3.0 rad total rotation.
    expect(angle).toBeCloseTo(3.0, 1);
  });

  it("reversing direction unrolls it, no separate handling needed", () => {
    const ctx = { ...CTX, nodeId: "roll-reverse" };
    const radius = 1;
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0), radius }, {}, ctx);
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(2, 0, 0), radius }, {}, ctx);
    const res = ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0), radius }, {}, ctx);
    const rot = res.rotation as THREE.Vector3;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z));
    const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    expect(angle).toBeCloseTo(0, 3); // back where it started -> back to identity
  });
});
