import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { ROLLING_NODE, ROLLING_SHAPES } from "./rolling";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "rolling-test" };

function quaternionAngle(rotation: THREE.Vector3): number {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));
  return 2 * Math.acos(Math.min(1, Math.abs(q.w)));
}

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
    // size is the sphere's diameter: diameter 1 -> radius 0.5.
    const size = 1;
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0), size }, {}, ctx);
    // Travels exactly one circumference — should land back at its start orientation (mod 2π).
    const distance = Math.PI * size;
    const res = ROLLING_NODE.evaluate({ position: new THREE.Vector3(distance, 0, 0), size }, {}, ctx);
    const rot = res.rotation as THREE.Vector3;
    // A full rotation about Z (or -Z) — Euler angle wraps, so check via the
    // underlying quaternion angle instead of the raw Euler component.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z));
    const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    expect(angle).toBeCloseTo(0, 3); // full turn = back to identity
  });

  it("rotates about the axis perpendicular to both up and the direction of travel", () => {
    const ctx = { ...CTX, nodeId: "roll-axis" };
    const size = 2; // diameter 2 -> radius 1
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0), size, axis: new THREE.Vector3(0, 1, 0) }, {}, ctx);
    // Quarter-circumference along +X — a quarter turn (π/2 rad at radius 1).
    const res = ROLLING_NODE.evaluate(
      { position: new THREE.Vector3(Math.PI / 2, 0, 0), size, axis: new THREE.Vector3(0, 1, 0) },
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
    const size = 2; // diameter 2 -> radius 1
    let x = 0;
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0), size }, {}, ctx);
    let last: THREE.Vector3 = new THREE.Vector3();
    for (let i = 0; i < 10; i++) {
      x += 0.3;
      last = ROLLING_NODE.evaluate({ position: new THREE.Vector3(x, 0, 0), size }, {}, ctx).rotation as THREE.Vector3;
    }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(last.x, last.y, last.z));
    const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    // Total travel 3.0 at radius 1 -> 3.0 rad total rotation.
    expect(angle).toBeCloseTo(3.0, 1);
  });

  it("reversing direction unrolls it, no separate handling needed", () => {
    const ctx = { ...CTX, nodeId: "roll-reverse" };
    const size = 2; // diameter 2 -> radius 1
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0), size }, {}, ctx);
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(2, 0, 0), size }, {}, ctx);
    const res = ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0), size }, {}, ctx);
    const rot = res.rotation as THREE.Vector3;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z));
    const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    expect(angle).toBeCloseTo(0, 3); // back where it started -> back to identity
  });
});

describe("ROLLING_NODE — polygonal shapes", () => {
  // A square of side 2 (inscribed radius 1): R = √2, r_eff = 4/π ≈ 1.273,
  // so a full 90° tip covers 2 units and a half-tip covers 1 unit.
  const square = (nodeId: string, position: THREE.Vector3) =>
    ROLLING_NODE.evaluate({ position, size: 2 }, { shape: "square" }, { ...CTX, nodeId });

  it("rests flat on its first read: no rotation, no bob", () => {
    const res = square("square-rest", new THREE.Vector3(10, 0, 5));
    expect((res.rotation as THREE.Vector3).length()).toBeCloseTo(0, 5);
    expect(res.bob).toBeCloseTo(0, 5);
    expect(res.position).toEqual(new THREE.Vector3(10, 0, 5));
  });

  it("bobs to the circumradius at the half-tip, rotated by half the tip angle", () => {
    const nodeId = "square-half";
    square(nodeId, new THREE.Vector3(0, 0, 0));
    // Half a 90° tip = r_eff · π/4 = 1 unit of travel.
    const res = square(nodeId, new THREE.Vector3(1, 0, 0));
    expect(res.bob).toBeCloseTo(Math.SQRT2 - 1, 4); // R − r
    expect(quaternionAngle(res.rotation as THREE.Vector3)).toBeCloseTo(Math.PI / 4, 4);
    // The bob rides the input position's height (input y = 0).
    expect((res.position as THREE.Vector3).y).toBeCloseTo(Math.SQRT2 - 1, 4);
    expect((res.position as THREE.Vector3).x).toBeCloseTo(1, 4);
  });

  it("lands flat again after a full tip (90°), bob back to zero", () => {
    const nodeId = "square-tip";
    square(nodeId, new THREE.Vector3(0, 0, 0));
    const res = square(nodeId, new THREE.Vector3(2, 0, 0));
    expect(res.bob).toBeCloseTo(0, 4);
    expect(quaternionAngle(res.rotation as THREE.Vector3)).toBeCloseTo(Math.PI / 2, 4);
  });

  it("returns to identity after rolling one full perimeter (a square's 4 sides)", () => {
    const nodeId = "square-lap";
    square(nodeId, new THREE.Vector3(0, 0, 0));
    // Perimeter = 4 × side = 8.
    const res = square(nodeId, new THREE.Vector3(8, 0, 0));
    expect(quaternionAngle(res.rotation as THREE.Vector3)).toBeCloseTo(0, 3);
    expect(res.bob).toBeCloseTo(0, 4);
  });

  it("reversing direction unrolls the tumble and drops the bob back down", () => {
    const nodeId = "square-reverse";
    square(nodeId, new THREE.Vector3(0, 0, 0));
    square(nodeId, new THREE.Vector3(1, 0, 0));
    const res = square(nodeId, new THREE.Vector3(0, 0, 0));
    expect(quaternionAngle(res.rotation as THREE.Vector3)).toBeCloseTo(0, 3);
    expect(res.bob).toBeCloseTo(0, 4);
  });

  it("applies the bob along the configured axis, not just +Y", () => {
    const nodeId = "square-axis";
    const axis = new THREE.Vector3(0, 0, 1);
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0), size: 2, axis }, { shape: "square" }, { ...CTX, nodeId });
    const res = ROLLING_NODE.evaluate({ position: new THREE.Vector3(1, 0, 0), size: 2, axis }, { shape: "square" }, { ...CTX, nodeId });
    const pos = res.position as THREE.Vector3;
    expect(pos.x).toBeCloseTo(1, 4);
    expect(pos.y).toBeCloseTo(0, 4);
    expect(pos.z).toBeCloseTo(Math.SQRT2 - 1, 4); // bob rides z now
    expect(res.bob).toBeCloseTo(Math.SQRT2 - 1, 4);
  });

  it("round shapes never bob and pass position straight through (regression)", () => {
    const nodeId = "round-nobob";
    // size = diameter 2 -> radius 1, but a round shape has no bob regardless.
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0), size: 2 }, ROLLING_NODE.defaultParams, { ...CTX, nodeId });
    const res = ROLLING_NODE.evaluate({ position: new THREE.Vector3(3, 1, 0), size: 2 }, ROLLING_NODE.defaultParams, { ...CTX, nodeId });
    expect(res.bob).toBeCloseTo(0, 5);
    expect(res.position).toEqual(new THREE.Vector3(3, 1, 0));
  });

  it("a triangle tips through 120° per side and bobs to its (larger) circumradius", () => {
    const nodeId = "triangle";
    // Equilateral triangle with inradius 1 -> side 2√3.
    const side = 2 * Math.sqrt(3);
    ROLLING_NODE.evaluate({ position: new THREE.Vector3(0, 0, 0), size: side }, { shape: "triangle" }, { ...CTX, nodeId });
    // Half a 120° tip: r_eff = 3r·tan(60°)/π = √3, travel = r_eff·(π/3) = √3.
    const res = ROLLING_NODE.evaluate({ position: new THREE.Vector3(Math.sqrt(3), 0, 0), size: side }, { shape: "triangle" }, { ...CTX, nodeId });
    expect(res.bob).toBeCloseTo(1, 4); // R − r = 2 − 1
    expect(quaternionAngle(res.rotation as THREE.Vector3)).toBeCloseTo(Math.PI / 3, 4);
  });

  it("every listed shape is a real select option", () => {
    const field = ROLLING_NODE.paramFields!.find((f) => f.id === "shape") as { options?: string[] } | undefined;
    expect(field?.options).toEqual([...ROLLING_SHAPES]);
  });
});
