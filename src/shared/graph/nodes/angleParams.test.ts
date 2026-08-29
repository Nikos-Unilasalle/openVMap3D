import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { HUB_TEXT_NODE, HUB_IMAGE_NODE } from "./hub";
import { ORBIT_NODE } from "./motion";
import { WIGGLE_NODE } from "./wiggle";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "angle-params" };

/**
 * These params are stored in degrees (no `degrees: true`), because everything
 * that touches them already speaks degrees. They were marked `degrees: true`,
 * which made the panel the lone writer that converted: a typed 90 was stored
 * as 1.5708 and then read back as 1.5708 degrees, so the field said 90 and
 * the render showed almost nothing.
 */
describe("angle params stored in degrees", () => {
  it("hub/text: a rotation of 90 renders a quarter turn", () => {
    const res = HUB_TEXT_NODE.evaluate({}, { ...HUB_TEXT_NODE.defaultParams, rotation: 90 }, { ...CTX, nodeId: "t" });
    const hud = res.hud as { rotation: number; transform: string };
    expect(hud.rotation).toBe(90);
    expect(hud.transform).toContain("rotate(90deg)");
  });

  it("hub/image: same, and the wire agrees with the field", () => {
    const typed = HUB_IMAGE_NODE.evaluate({}, { ...HUB_IMAGE_NODE.defaultParams, rotation: 90 }, { ...CTX, nodeId: "i1" });
    const wired = HUB_IMAGE_NODE.evaluate({ rotation: 90 }, HUB_IMAGE_NODE.defaultParams, { ...CTX, nodeId: "i2" });
    expect((typed.hud as { transform: string }).transform).toContain("rotate(90deg)");
    expect((wired.hud as { transform: string }).transform).toContain("rotate(90deg)");
  });

  it("transform/orbit: a phase of 90 is a real quarter turn around the circle", () => {
    const at = (phase: number) => {
      const res = ORBIT_NODE.evaluate(
        {},
        { ...ORBIT_NODE.defaultParams, phase, speed: 0, radius: 1, axis: "Y" },
        { ...CTX, nodeId: `o-${phase}`, time: 0 },
      );
      return new THREE.Vector3().setFromMatrixPosition(res.matrix as THREE.Matrix4);
    };
    const start = at(0);
    const quarter = at(90);
    // A quarter turn swaps which axis carries the radius — the give-away that
    // the angle really was 90° and not 90 radians (or 1.57°, the old bug).
    expect(start.length()).toBeCloseTo(1, 5);
    expect(quarter.length()).toBeCloseTo(1, 5);
    expect(start.distanceTo(quarter)).toBeCloseTo(Math.SQRT2, 4);
  });

  it("transform/orbit: a tilt of 90 actually leans the orbit plane over", () => {
    // Phase 90, not 0: tilt leans the orbit's second basis vector about the
    // first, and at phase 0 the point sits exactly on the first one, where
    // the lean cannot show at all.
    const orbit = (tilt: number) =>
      ORBIT_NODE.evaluate(
        {},
        { ...ORBIT_NODE.defaultParams, tilt, phase: 90, speed: 0, radius: 1, height: 0, axis: "Y" },
        { ...CTX, nodeId: `tilt-${tilt}`, time: 0 },
      );
    const flat = new THREE.Vector3().setFromMatrixPosition(orbit(0).matrix as THREE.Matrix4);
    const leaned = new THREE.Vector3().setFromMatrixPosition(orbit(90).matrix as THREE.Matrix4);
    // 90° of lean has to move the point somewhere clearly different; 90 stored
    // as radians and read as degrees moved it by under a hundredth of a unit.
    expect(flat.distanceTo(leaned)).toBeGreaterThan(0.5);
  });

  it("animation/wiggle: Rot Amp is degrees, so 180 can swing a half turn", () => {
    // The rotation output is the amplitude times noise in [-1, 1], so a large
    // amplitude has to produce a large angle. Read as radians it would be
    // capped at a few degrees no matter what was typed.
    let maxAbs = 0;
    for (let step = 0; step < 60; step++) {
      const res = WIGGLE_NODE.evaluate(
        {},
        { ...WIGGLE_NODE.defaultParams, rotationAmplitude: new THREE.Vector3(180, 180, 180) },
        { ...CTX, nodeId: "w", time: step * 0.25, step },
      );
      const rot = res.rotation as THREE.Vector3;
      maxAbs = Math.max(maxAbs, Math.abs(rot.x), Math.abs(rot.y), Math.abs(rot.z));
    }
    expect(maxAbs).toBeGreaterThan(20);
  });
});
