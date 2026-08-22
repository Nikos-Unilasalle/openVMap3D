import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { SQUASH_STRETCH_NODE } from "./squash";

function ctx(nodeId: string): EvalContext {
  return { time: 0, step: 0, nodeId };
}

/** Distance the group's matrix stretches a point one unit along `dir` from `pos` — reads the live stretch factor without relying on THREE.Matrix4.decompose, which doesn't cleanly separate a rotated anisotropic scale back into quaternion+scale. */
function stretchLengthAlongDir(group: THREE.Object3D, pos: THREE.Vector3, dir: THREE.Vector3): number {
  const p = pos.clone().addScaledVector(dir, 1).applyMatrix4(group.matrix);
  return p.distanceTo(pos);
}

describe("SQUASH_STRETCH_NODE — smoothing 0 (default) matches the pre-spring behaviour exactly", () => {
  it("factor is 1 + intensity*0.5*normalized(speed), immediately, no lag", () => {
    const nodeId = "sq-1";
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const params = { ...SQUASH_STRETCH_NODE.defaultParams, intensity: 0.6, maxSpeed: 3 };

    // seed frame
    mesh.position.set(0, 0, 0);
    SQUASH_STRETCH_NODE.evaluate({ geometry: mesh, time: 0 }, params, ctx(nodeId));

    // move 3 units in X over 1s -> speed 3 -> normalized 1 -> factor 1.3
    mesh.position.set(3, 0, 0);
    const res = SQUASH_STRETCH_NODE.evaluate({ geometry: mesh, time: 1 }, params, ctx(nodeId));
    const group = res.geometry as THREE.Object3D;

    const dir = new THREE.Vector3(1, 0, 0);
    const stretched = stretchLengthAlongDir(group, new THREE.Vector3(3, 0, 0), dir);
    expect(stretched).toBeCloseTo(1.3, 4);
  });

  it("never squashes below 1 when Bounciness is also 0 — no overshoot possible without smoothing", () => {
    const nodeId = "sq-2";
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const params = { ...SQUASH_STRETCH_NODE.defaultParams, intensity: 0.6, maxSpeed: 3 };

    mesh.position.set(0, 0, 0);
    SQUASH_STRETCH_NODE.evaluate({ geometry: mesh, time: 0 }, params, ctx(nodeId));
    mesh.position.set(3, 0, 0);
    SQUASH_STRETCH_NODE.evaluate({ geometry: mesh, time: 1 }, params, ctx(nodeId));

    // hard stop
    const res = SQUASH_STRETCH_NODE.evaluate({ geometry: mesh, time: 1.05 }, params, ctx(nodeId));
    const group = res.geometry as THREE.Object3D;
    const stretched = stretchLengthAlongDir(group, new THREE.Vector3(3, 0, 0), new THREE.Vector3(1, 0, 0));
    expect(stretched).toBeCloseTo(1, 4);
  });
});

describe("SQUASH_STRETCH_NODE — Smoothing lags the target instead of snapping", () => {
  it("one frame after a speed jump, the smoothed factor is still short of the instant target", () => {
    const nodeId = "sq-3";
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const params = { ...SQUASH_STRETCH_NODE.defaultParams, intensity: 0.6, maxSpeed: 3, smoothing: 0.6, bounciness: 0 };

    mesh.position.set(0, 0, 0);
    SQUASH_STRETCH_NODE.evaluate({ geometry: mesh, time: 0 }, params, ctx(nodeId));
    mesh.position.set(3, 0, 0);
    const res = SQUASH_STRETCH_NODE.evaluate({ geometry: mesh, time: 1 / 60 }, params, ctx(nodeId));
    const group = res.geometry as THREE.Object3D;

    const stretched = stretchLengthAlongDir(group, mesh.position.clone(), new THREE.Vector3(1, 0, 0));
    // Instant (unsmoothed) target for this one frame's huge speed would clamp
    // to normalized=1 -> factor 1.3. A single 1/60s step through a slow spring
    // should land well short of that.
    expect(stretched).toBeLessThan(1.29);
    expect(stretched).toBeGreaterThan(1.0);
  });
});

describe("SQUASH_STRETCH_NODE — Bounciness produces a squash (factor < 1) on a sudden stop", () => {
  it("dips below 1 within a few frames after velocity drops to zero", () => {
    const nodeId = "sq-4";
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const params = {
      ...SQUASH_STRETCH_NODE.defaultParams,
      intensity: 1,
      maxSpeed: 1,
      smoothing: 0.5,
      bounciness: 0.9,
    };

    const dt = 1 / 60;
    let t = 0;
    mesh.position.set(0, 0, 0);
    SQUASH_STRETCH_NODE.evaluate({ geometry: mesh, time: t }, params, ctx(nodeId));

    // Run at a steady high speed for a bit so the spring settles near the
    // stretched target.
    for (let i = 0; i < 20; i++) {
      t += dt;
      mesh.position.x += 1 * dt; // speed 1 = maxSpeed -> normalized 1
      SQUASH_STRETCH_NODE.evaluate({ geometry: mesh, time: t }, params, ctx(nodeId));
    }

    // Hard stop: position freezes, so measured speed instantly drops to 0.
    let minStretch = Infinity;
    const stopPos = mesh.position.clone();
    for (let i = 0; i < 30; i++) {
      t += dt;
      const res = SQUASH_STRETCH_NODE.evaluate({ geometry: mesh, time: t }, params, ctx(nodeId));
      const group = res.geometry as THREE.Object3D;
      const stretched = stretchLengthAlongDir(group, stopPos, new THREE.Vector3(1, 0, 0));
      minStretch = Math.min(minStretch, stretched);
    }

    expect(minStretch).toBeLessThan(1);
  });
});

describe("SQUASH_STRETCH_NODE — volume-preserving perpendicular compression (already true before this change)", () => {
  it("stretching along the motion axis compresses the two perpendicular axes", () => {
    const nodeId = "sq-5";
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const params = { ...SQUASH_STRETCH_NODE.defaultParams, intensity: 0.6, maxSpeed: 3 };

    mesh.position.set(0, 0, 0);
    SQUASH_STRETCH_NODE.evaluate({ geometry: mesh, time: 0 }, params, ctx(nodeId));
    mesh.position.set(3, 0, 0);
    const res = SQUASH_STRETCH_NODE.evaluate({ geometry: mesh, time: 1 }, params, ctx(nodeId));
    const group = res.geometry as THREE.Object3D;

    const pos = new THREE.Vector3(3, 0, 0);
    const along = stretchLengthAlongDir(group, pos, new THREE.Vector3(1, 0, 0));
    const perp = stretchLengthAlongDir(group, pos, new THREE.Vector3(0, 1, 0));
    expect(along).toBeGreaterThan(1);
    expect(perp).toBeLessThan(1);
    // volume-preserving: along * perp * perp ≈ 1
    expect(along * perp * perp).toBeCloseTo(1, 4);
  });
});
