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

    expect(position.x).toBeCloseTo(0);
    expect(position.y).toBeCloseTo(0);
    expect(position.z).toBeCloseTo(5);
    expect(result.fov).toBe(50);
  });

  test("emits no projection matrix in manual mode, so the viewport uses plain fov", () => {
    const result = CAMERA_NODE.evaluate({}, CAMERA_NODE.defaultParams, CTX);
    expect(result.projection).toBeNull();
  });

  test("evaluates active state and emits geometry 3D helper group", () => {
    const activeRes = CAMERA_NODE.evaluate({ active: 1 }, CAMERA_NODE.defaultParams, CTX);
    expect(activeRes.active).toBe(1);
    expect(activeRes.geometry).toBeInstanceOf(THREE.Group);

    const inactiveRes = CAMERA_NODE.evaluate({ active: 0 }, CAMERA_NODE.defaultParams, CTX);
    expect(inactiveRes.active).toBe(0);
    expect(inactiveRes.geometry).toBeInstanceOf(THREE.Group);
  });

  test("the returned geometry itself carries the camera's pose, not an identity wrapper around it", () => {
    // The viewport's gizmo attaches directly to whatever `geometry` comes
    // back and reads its own `matrix`/`matrixAutoUpdate` to place the
    // handle and seed the drag — see Viewport.tsx's
    // `!targetObject.matrixAutoUpdate` decompose-on-attach block. If the
    // pose lived one level deeper (a positioned wrapper nested inside an
    // identity-transform outer group), the gizmo would read identity off
    // the outer group and either not appear or sit pinned at the origin
    // regardless of where the camera actually is.
    const location = new THREE.Vector3(4, 1, -2);
    const result = CAMERA_NODE.evaluate({ location, rotation: new THREE.Vector3(0, 0, 0) }, CAMERA_NODE.defaultParams, CTX);
    const group = result.geometry as THREE.Group;

    expect(group.matrixAutoUpdate).toBe(false);
    const pos = new THREE.Vector3().setFromMatrixPosition(group.matrix);
    expect(pos.x).toBeCloseTo(4);
    expect(pos.y).toBeCloseTo(1);
    expect(pos.z).toBeCloseTo(-2);
  });

  test("accepts external matrix input to override camera pose", () => {
    const customMat = new THREE.Matrix4().makeTranslation(10, 20, 30);
    const res = CAMERA_NODE.evaluate({ matrix: customMat }, CAMERA_NODE.defaultParams, CTX);
    const pos = new THREE.Vector3().setFromMatrixPosition(res.matrix as THREE.Matrix4);

    expect(pos.x).toBeCloseTo(10);
    expect(pos.y).toBeCloseTo(20);
    expect(pos.z).toBeCloseTo(30);
  });
});

describe("CAMERA_NODE gizmo live-edit", () => {
  test("leaves its matrix alone while the gizmo is dragging it", () => {
    // Without this guard the graph reclaimed the camera's matrix on every
    // frame of a drag, so the dragged pose was overwritten before the
    // viewport could read it back into location/rotation — the params never
    // moved, and a keyframe taken afterwards captured the stale value.
    const ctx = { ...CTX, nodeId: "cam-drag" };
    CAMERA_NODE.evaluate({ location: new THREE.Vector3(0, 0, 5) }, CAMERA_NODE.defaultParams, ctx);

    const group = CAMERA_NODE.evaluate(
      { location: new THREE.Vector3(0, 0, 5) },
      CAMERA_NODE.defaultParams,
      ctx,
    ).geometry as THREE.Group;

    // Stand in for TransformControls having just moved it.
    group.matrix.copy(new THREE.Matrix4().makeTranslation(7, 3, 1));

    const dragged = CAMERA_NODE.evaluate(
      { location: new THREE.Vector3(0, 0, 5) },
      CAMERA_NODE.defaultParams,
      { ...ctx, liveEditNodeId: "cam-drag" },
    );

    const position = new THREE.Vector3().setFromMatrixPosition((dragged.geometry as THREE.Group).matrix);
    expect(position.x).toBeCloseTo(7);
    expect(position.y).toBeCloseTo(3);

    // And the reported matrix follows the live pose, so downstream nodes and
    // the gizmo write-back both see what is actually on screen.
    const reported = new THREE.Vector3().setFromMatrixPosition(dragged.matrix as THREE.Matrix4);
    expect(reported.x).toBeCloseTo(7);
  });

  test("resumes following its params once the drag ends", () => {
    const ctx = { ...CTX, nodeId: "cam-drag-end" };
    const group = CAMERA_NODE.evaluate({}, CAMERA_NODE.defaultParams, ctx).geometry as THREE.Group;
    group.matrix.copy(new THREE.Matrix4().makeTranslation(7, 3, 1));

    const after = CAMERA_NODE.evaluate({ location: new THREE.Vector3(1, 2, 3) }, CAMERA_NODE.defaultParams, ctx);
    const position = new THREE.Vector3().setFromMatrixPosition((after.geometry as THREE.Group).matrix);

    expect(position.x).toBeCloseTo(1);
    expect(position.z).toBeCloseTo(3);
  });
});

/** Where the camera's own -Z axis points once posed, in world space. */
function forwardAxis(matrix: THREE.Matrix4): THREE.Vector3 {
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
  return new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion).normalize();
}

describe("CAMERA_NODE target (embedded look-at)", () => {
  test("a wired Target position aims the camera at it, keeping its own location", () => {
    const location = new THREE.Vector3(0, 0, 5);
    const target = new THREE.Vector3(0, 0, 0);

    const result = CAMERA_NODE.evaluate({ location, target }, CAMERA_NODE.defaultParams, CTX);
    const matrix = result.matrix as THREE.Matrix4;

    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(position.z).toBeCloseTo(5);

    const forward = forwardAxis(matrix);
    expect(forward.x).toBeCloseTo(0);
    expect(forward.y).toBeCloseTo(0);
    expect(forward.z).toBeCloseTo(-1);
  });

  test("an Object3D wired into Target is tracked by its world position, like a light's target", () => {
    const anchor = new THREE.Object3D();
    anchor.position.set(3, 0, 0);
    anchor.updateMatrixWorld(true);

    const result = CAMERA_NODE.evaluate(
      { location: new THREE.Vector3(0, 0, 0), target: anchor },
      CAMERA_NODE.defaultParams,
      CTX,
    );

    const forward = forwardAxis(result.matrix as THREE.Matrix4);
    expect(forward.x).toBeCloseTo(1);
    expect(forward.y).toBeCloseTo(0);
    expect(forward.z).toBeCloseTo(0);
  });

  test("a wired Target overrides the rotation input rather than composing with it", () => {
    const withRotation = CAMERA_NODE.evaluate(
      {
        location: new THREE.Vector3(0, 0, 5),
        rotation: new THREE.Vector3(0, Math.PI / 2, 0),
        target: new THREE.Vector3(0, 0, 0),
      },
      CAMERA_NODE.defaultParams,
      CTX,
    );

    const forward = forwardAxis(withRotation.matrix as THREE.Matrix4);
    expect(forward.z).toBeCloseTo(-1);
    expect(forward.x).toBeCloseTo(0);
  });

  test("no Target wired and Use Target off leaves the manual Euler pose untouched", () => {
    const rotation = new THREE.Vector3(0, Math.PI / 2, 0);
    // Evaluate with inputs.target set to defaultParams.target (simulating evaluateGraph's unconnected fallback)
    const result = CAMERA_NODE.evaluate(
      { location: new THREE.Vector3(0, 0, 0), rotation, target: CAMERA_NODE.defaultParams.target },
      { ...CAMERA_NODE.defaultParams, useTarget: false },
      CTX,
    );

    // Yaw of +90° swings the -Z forward axis round to -X.
    const forward = forwardAxis(result.matrix as THREE.Matrix4);
    expect(forward.x).toBeCloseTo(-1);
    expect(forward.z).toBeCloseTo(0);
  });

  test("Use Target aims at the fallback target param with nothing wired", () => {
    const result = CAMERA_NODE.evaluate(
      { location: new THREE.Vector3(0, 5, 0) },
      { ...CAMERA_NODE.defaultParams, useTarget: true, target: new THREE.Vector3(0, 0, 0) },
      CTX,
    );

    const forward = forwardAxis(result.matrix as THREE.Matrix4);
    expect(forward.y).toBeCloseTo(-1);
  });

  test("a target coincident with the camera falls back instead of producing a NaN matrix", () => {
    const location = new THREE.Vector3(2, 2, 2);
    const result = CAMERA_NODE.evaluate(
      { location, target: location.clone() },
      CAMERA_NODE.defaultParams,
      CTX,
    );

    const matrix = result.matrix as THREE.Matrix4;
    expect(matrix.elements.every((n) => Number.isFinite(n))).toBe(true);

    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(2);
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
    expect(position.x).toBeCloseTo(0);
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
