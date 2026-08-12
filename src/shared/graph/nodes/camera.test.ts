import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { projectWithCalibration } from "../calibration/dlt";
import { CalibrationPicks, solveFromPicks } from "../calibration/picks";
import { roomCornerReferencePoints } from "../calibration/roomCorner";
import { EvalContext } from "../types";
import { CAMERA_NODE } from "./camera";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "cam-test" };
const ROOM = { width: 3.2, height: 2.5, depth: 2.8 };
const ONE = new THREE.Vector3(1, 1, 1);

/**
 * Picks as they would come back from an operator who aligned perfectly:
 * a known projector, its view of each room corner, in relative units.
 */
function perfectPicks(): { picks: CalibrationPicks; position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const position = new THREE.Vector3(2.1, 1.7, 2.6);
  const target = new THREE.Vector3(0.4, 1.1, 0.4);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0)),
  );
  // Relative focal/principal, with a deliberate lens shift on y.
  const focal = 0.9;
  const principal = { x: 0.5, y: 1.1 };
  const view = new THREE.Matrix4().compose(position, quaternion, ONE).invert();

  const picks: CalibrationPicks = {};
  for (const point of roomCornerReferencePoints(ROOM)) {
    const camera = point.world.clone().applyMatrix4(view);
    const depth = -camera.z;
    picks[point.id] = {
      x: (focal * camera.x) / depth + principal.x,
      y: (-focal * camera.y) / depth + principal.y,
    };
  }
  return { picks, position, quaternion };
}

describe("CAMERA_NODE manual mode", () => {
  test("composes location/rotation into a matrix and passes fov through", () => {
    const location = new THREE.Vector3(1, 2, 3);
    const rotation = new THREE.Vector3(0, Math.PI / 2, 0);

    const result = CAMERA_NODE.evaluate({ location, rotation, fov: 70 }, CAMERA_NODE.defaultParams, CTX);
    const matrix = result.matrix as THREE.Matrix4;

    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(1);
    expect(position.y).toBeCloseTo(2);
    expect(position.z).toBeCloseTo(3);
    expect(result.fov).toBe(70);
  });

  test("unconnected inputs default to the standard starting pose, not the origin", () => {
    const result = CAMERA_NODE.evaluate({}, CAMERA_NODE.defaultParams, CTX);
    const position = new THREE.Vector3().setFromMatrixPosition(result.matrix as THREE.Matrix4);

    expect(position.x).toBeCloseTo(3);
    expect(position.y).toBeCloseTo(3);
    expect(position.z).toBeCloseTo(5);
    expect(result.fov).toBe(50);
  });

  test("emits no projection matrix in manual mode, so the viewport uses plain fov", () => {
    const result = CAMERA_NODE.evaluate({}, CAMERA_NODE.defaultParams, CTX);
    expect(result.projection).toBeNull();
  });
});

describe("CAMERA_NODE calibrated mode", () => {
  test("recovers the projector's real position from the operator's picks", () => {
    // Arrange
    const { picks, position } = perfectPicks();
    const params = { ...CAMERA_NODE.defaultParams, mode: "calibrated", calibrationPicks: picks };

    // Act
    const result = CAMERA_NODE.evaluate({ refPoints: roomCornerReferencePoints(ROOM) }, params, CTX);

    // Assert — position is the thing the vanishing-point method could never
    // produce, and the thing that made the cube vanish without it.
    const recovered = new THREE.Vector3().setFromMatrixPosition(result.matrix as THREE.Matrix4);
    expect(recovered.distanceTo(position)).toBeLessThan(1e-6);
  });

  test("emits an asymmetric projection matrix carrying the lens shift", () => {
    const { picks } = perfectPicks();
    const params = { ...CAMERA_NODE.defaultParams, mode: "calibrated", calibrationPicks: picks };

    const result = CAMERA_NODE.evaluate({ refPoints: roomCornerReferencePoints(ROOM) }, params, CTX);

    expect(result.projection).toBeInstanceOf(THREE.Matrix4);
    // A centred frustum has zero x/y offset in the projection matrix's third
    // column; a lens-shifted one does not. That offset is precisely what a
    // plain PerspectiveCamera cannot express.
    const m = (result.projection as THREE.Matrix4).elements;
    expect(Math.abs(m[9])).toBeGreaterThan(0.1);
  });

  test("reports a near-zero reprojection error for perfect picks", () => {
    const { picks } = perfectPicks();
    const params = { ...CAMERA_NODE.defaultParams, mode: "calibrated", calibrationPicks: picks };

    const result = CAMERA_NODE.evaluate({ refPoints: roomCornerReferencePoints(ROOM) }, params, CTX);

    expect(result.error as number).toBeLessThan(1e-6);
  });

  test("falls back to the manual pose when the picks cannot be solved", () => {
    // Arrange — only three points picked, well under the six-point minimum
    const { picks } = perfectPicks();
    const partial = {
      "corner-floor": picks["corner-floor"],
      "corner-ceiling": picks["corner-ceiling"],
      "wallA-floor": picks["wallA-floor"],
    };
    const params = { ...CAMERA_NODE.defaultParams, mode: "calibrated", calibrationPicks: partial };

    // Act
    const result = CAMERA_NODE.evaluate({ refPoints: roomCornerReferencePoints(ROOM) }, params, CTX);

    // Assert — degrades to the manual pose rather than emitting a broken one
    const position = new THREE.Vector3().setFromMatrixPosition(result.matrix as THREE.Matrix4);
    expect(position.x).toBeCloseTo(3);
    expect(result.projection).toBeNull();
  });

  test("falls back when no reference points are wired in", () => {
    const { picks } = perfectPicks();
    const params = { ...CAMERA_NODE.defaultParams, mode: "calibrated", calibrationPicks: picks };

    const result = CAMERA_NODE.evaluate({}, params, CTX);

    expect(result.projection).toBeNull();
  });
});

describe("solveFromPicks", () => {
  test("round-trips every picked point back to where the operator put it", () => {
    // Arrange
    const { picks } = perfectPicks();
    const points = roomCornerReferencePoints(ROOM);

    // Act
    const calibration = solveFromPicks(points, picks);

    // Assert
    expect(calibration).not.toBeNull();
    for (const point of points) {
      const projected = projectWithCalibration(point.world, calibration!);
      expect(projected).not.toBeNull();
      expect(projected!.x).toBeCloseTo(picks[point.id].x, 6);
      expect(projected!.y).toBeCloseTo(picks[point.id].y, 6);
    }
  });
});
