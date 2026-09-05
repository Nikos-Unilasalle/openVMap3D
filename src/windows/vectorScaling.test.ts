import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { toDisplayUnit, toStoredUnit } from "./ParamPanel";

describe("vectorField proportional scaling logic", () => {
  function scaleVectorWithShift(
    startVec: THREE.Vector3,
    axisKey: "x" | "y" | "z",
    nextVal: number,
    degrees?: boolean,
  ): THREE.Vector3 {
    const startVal = toDisplayUnit(startVec[axisKey], degrees);
    const updated = startVec.clone();
    const axes: ("x" | "y" | "z")[] = ["x", "y", "z"];

    if (Math.abs(startVal) > 1e-7) {
      const factor = nextVal / startVal;
      for (const k of axes) {
        const disp = k === axisKey ? nextVal : toDisplayUnit(startVec[k], degrees) * factor;
        updated[k] = toStoredUnit(disp, degrees);
      }
    } else {
      const delta = nextVal - startVal;
      for (const k of axes) {
        const disp = k === axisKey ? nextVal : toDisplayUnit(startVec[k], degrees) + delta;
        updated[k] = toStoredUnit(disp, degrees);
      }
    }
    return updated;
  }

  it("scales all components proportionally to preserve the exact ratio (3D)", () => {
    // Initial vector with ratio 1 : 2 : 3
    const start = new THREE.Vector3(2, 4, 6);

    // Drag X from 2 to 3 (factor = 1.5)
    const scaled = scaleVectorWithShift(start, "x", 3);

    expect(scaled.x).toBeCloseTo(3);
    expect(scaled.y).toBeCloseTo(6);
    expect(scaled.z).toBeCloseTo(9);

    // Verify ratio y/x and z/x are preserved
    expect(scaled.y / scaled.x).toBeCloseTo(4 / 2);
    expect(scaled.z / scaled.x).toBeCloseTo(6 / 2);
  });

  it("scales proportionally when dragging downwards or into negative values", () => {
    const start = new THREE.Vector3(10, 20, 30);

    // Drag Y from 20 down to 10 (factor = 0.5)
    const scaledDown = scaleVectorWithShift(start, "y", 10);
    expect(scaledDown.x).toBeCloseTo(5);
    expect(scaledDown.y).toBeCloseTo(10);
    expect(scaledDown.z).toBeCloseTo(15);

    // Drag Z to -30 (factor = -1.0)
    const scaledNeg = scaleVectorWithShift(start, "z", -30);
    expect(scaledNeg.x).toBeCloseTo(-10);
    expect(scaledNeg.y).toBeCloseTo(-20);
    expect(scaledNeg.z).toBeCloseTo(-30);
  });

  it("handles zero starting value by applying uniform delta", () => {
    const startZero = new THREE.Vector3(0, 0, 0);

    // Drag X from 0 to 2.5 (delta = +2.5)
    const scaled = scaleVectorWithShift(startZero, "x", 2.5);
    expect(scaled.x).toBeCloseTo(2.5);
    expect(scaled.y).toBeCloseTo(2.5);
    expect(scaled.z).toBeCloseTo(2.5);
  });

  it("preserves zero on a component when other non-zero component is scaled", () => {
    const startWithZero = new THREE.Vector3(2, 0, 4);

    // Drag X from 2 to 4 (factor = 2)
    const scaled = scaleVectorWithShift(startWithZero, "x", 4);
    expect(scaled.x).toBeCloseTo(4);
    expect(scaled.y).toBeCloseTo(0);
    expect(scaled.z).toBeCloseTo(8);
  });

  it("correctly handles degrees unit conversion during proportional scaling", () => {
    // Rotation angles in radians: 30° on X, 60° on Y, 90° on Z
    const startRad = new THREE.Vector3(
      THREE.MathUtils.degToRad(30),
      THREE.MathUtils.degToRad(60),
      THREE.MathUtils.degToRad(90),
    );

    // Drag displayed X from 30° to 45° (factor = 1.5)
    const scaledRad = scaleVectorWithShift(startRad, "x", 45, true);

    expect(THREE.MathUtils.radToDeg(scaledRad.x)).toBeCloseTo(45);
    expect(THREE.MathUtils.radToDeg(scaledRad.y)).toBeCloseTo(90);
    expect(THREE.MathUtils.radToDeg(scaledRad.z)).toBeCloseTo(135);
  });
});
