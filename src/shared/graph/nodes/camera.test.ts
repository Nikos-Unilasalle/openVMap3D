import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { projectWithCalibration } from "../calibration/dlt";
import { CalibrationPicks, solveFromPicks } from "../calibration/picks";
import { roomCornerReferencePoints } from "../calibration/roomCorner";
import { consumeCameraHandoffRequest } from "../cameraHandoffStore";
import { evaluateGraph } from "../evaluate";
import { DEFAULT_REGISTRY } from "../nodes";
import { EvalContext, Graph } from "../types";
import { CAMERA_FLY_TO_NODE, CAMERA_NODE } from "./camera";

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
  /** "Target has a wire in it" — the thing the node forks on, which `inputs` alone cannot express (see EvalContext.connectedInputs). */
  const WIRED_TARGET: EvalContext = { ...CTX, connectedInputs: new Set(["target"]) };

  test("a wired Target position aims the camera at it, keeping its own location", () => {
    const location = new THREE.Vector3(0, 0, 5);
    const target = new THREE.Vector3(0, 0, 0);

    const result = CAMERA_NODE.evaluate({ location, target }, CAMERA_NODE.defaultParams, WIRED_TARGET);
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
      WIRED_TARGET,
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
      WIRED_TARGET,
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
      WIRED_TARGET,
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

describe("CAMERA_FLY_TO_NODE", () => {
  /**
   * Fly To only reads its Progress *input* when something is actually wired
   * into that socket — the evaluator fills every declared socket from its
   * param otherwise, so a node cannot tell the two apart from `inputs`
   * alone (see EvalContext.connectedInputs). A direct evaluate() call has to
   * say so explicitly, or it tests a situation the app never produces.
   */
  const wiredProgress = (nodeId: string): EvalContext => ({
    time: 0,
    step: 0,
    nodeId,
    connectedInputs: new Set(["progress"]),
  });

  test("interpolates smoothly between Camera A and Camera B positions and orientations", () => {
    const camA = new THREE.Matrix4().makeTranslation(0, 0, 10);
    const camB = new THREE.Matrix4().makeTranslation(10, 0, 10);

    const midResult = CAMERA_FLY_TO_NODE.evaluate(
      { cameraA: camA, cameraB: camB, progress: 0.5 },
      CAMERA_FLY_TO_NODE.defaultParams,
      wiredProgress("fly-interp")
    );

    const matrix = midResult.matrix as THREE.Matrix4;
    const pos = new THREE.Vector3().setFromMatrixPosition(matrix);

    // Midpoint X should be halfway (5.0)
    expect(pos.x).toBeCloseTo(5.0);
    // Parabolic arc lift adds vertical height offset at midpoint (e.g. +1.0)
    expect(pos.y).toBeGreaterThan(0);
    expect(midResult.isFinished).toBe(0);

    const endResult = CAMERA_FLY_TO_NODE.evaluate(
      { cameraA: camA, cameraB: camB, progress: 1.0 },
      CAMERA_FLY_TO_NODE.defaultParams,
      wiredProgress("fly-interp")
    );

    const endPos = new THREE.Vector3().setFromMatrixPosition(endResult.matrix as THREE.Matrix4);
    expect(endPos.x).toBeCloseTo(10.0);
    expect(endPos.y).toBeCloseTo(0.0);
    expect(endResult.isFinished).toBe(1);
  });

  test("with no Camera A wired, lifts off from the active camera pose in ctx", () => {
    const activePose = {
      matrix: new THREE.Matrix4().makeTranslation(3, 4, 5),
      fov: 42,
    };
    const camB = new THREE.Matrix4().makeTranslation(10, 0, 0);

    const ctx: EvalContext = {
      time: 0,
      step: 0,
      nodeId: "fly-no-start",
      activeCameraPose: activePose,
      connectedInputs: new Set(["progress"]),
    };

    const start = CAMERA_FLY_TO_NODE.evaluate(
      { cameraB: camB, progress: 0 },
      CAMERA_FLY_TO_NODE.defaultParams,
      ctx,
    );

    const pos = new THREE.Vector3().setFromMatrixPosition(start.matrix as THREE.Matrix4);
    expect(pos.x).toBeCloseTo(3);
    expect(pos.y).toBeCloseTo(4);
    expect(pos.z).toBeCloseTo(5);
    expect(start.fov).toBeCloseTo(42);
  });

  test("latches the start pose at flight onset so it doesn't chase its own output", () => {
    const camA = { matrix: new THREE.Matrix4().makeTranslation(0, 0, 0), fov: 50 };
    const camB = new THREE.Matrix4().makeTranslation(10, 0, 0);
    const ctx: EvalContext = { time: 0, step: 0, nodeId: "fly-latch" };

    // Rising edge at t=0: the start pose (the active camera) is latched here.
    CAMERA_FLY_TO_NODE.evaluate(
      { cameraB: camB, trigger: 1 },
      { ...CAMERA_FLY_TO_NODE.defaultParams, duration: 2.0, arcHeight: 0 },
      { ...ctx, activeCameraPose: camA },
    );

    // Mid-flight the active camera is now this node's own previous output —
    // simulate the feedback with a wildly different pose. The start must stay
    // latched at camA, not jump toward it.
    const mid = CAMERA_FLY_TO_NODE.evaluate(
      { cameraB: camB, trigger: 1 },
      { ...CAMERA_FLY_TO_NODE.defaultParams, duration: 2.0, arcHeight: 0 },
      { ...ctx, time: 1.0, step: 60, activeCameraPose: { matrix: new THREE.Matrix4().makeTranslation(100, 100, 100), fov: 50 } },
    );

    const midPos = new THREE.Vector3().setFromMatrixPosition(mid.matrix as THREE.Matrix4);
    // t=1.0 of a 2.0s flight is progress 0.5 → halfway between camA (0) and camB (10).
    expect(midPos.x).toBeCloseTo(5);
  });

  test("triggers flight on rising edge and advances with simulation time", () => {
    const camA = new THREE.Matrix4().makeTranslation(0, 0, 0);
    const camB = new THREE.Matrix4().makeTranslation(20, 0, 0);
    const trigCtx: EvalContext = { time: 1.0, step: 60, nodeId: "fly-trig-test" };

    // Initial state before trigger
    const initial = CAMERA_FLY_TO_NODE.evaluate(
      { cameraA: camA, cameraB: camB, trigger: 0 },
      { ...CAMERA_FLY_TO_NODE.defaultParams, duration: 2.0, arcHeight: 0 },
      trigCtx
    );
    expect(initial.progress).toBe(0);

    // Trigger pulse at t = 1.0
    CAMERA_FLY_TO_NODE.evaluate(
      { cameraA: camA, cameraB: camB, trigger: 1 },
      { ...CAMERA_FLY_TO_NODE.defaultParams, duration: 2.0, arcHeight: 0 },
      trigCtx
    );

    // At t = 2.0 (elapsed 1.0s / 2.0s = 0.5)
    const mid = CAMERA_FLY_TO_NODE.evaluate(
      { cameraA: camA, cameraB: camB, trigger: 1 },
      { ...CAMERA_FLY_TO_NODE.defaultParams, duration: 2.0, arcHeight: 0 },
      { ...trigCtx, time: 2.0 }
    );
    expect(mid.progress).toBeCloseTo(0.5);
    const midPos = new THREE.Vector3().setFromMatrixPosition(mid.matrix as THREE.Matrix4);
    expect(midPos.x).toBeCloseTo(10.0);

    // At t = 3.0 (elapsed 2.0s / 2.0s = 1.0) -> finished
    const finish = CAMERA_FLY_TO_NODE.evaluate(
      { cameraA: camA, cameraB: camB, trigger: 0 },
      { ...CAMERA_FLY_TO_NODE.defaultParams, duration: 2.0, arcHeight: 0 },
      { ...trigCtx, time: 3.0 }
    );
    expect(finish.progress).toBeCloseTo(1.0);
    expect(finish.isFinished).toBe(1);
    const finishPos = new THREE.Vector3().setFromMatrixPosition(finish.matrix as THREE.Matrix4);
    expect(finishPos.x).toBeCloseTo(20.0);
  });

  test("active is false until the flight is triggered — dropping the node into the graph must not steal camera control", () => {
    const idleCtx: EvalContext = { time: 0, step: 0, nodeId: "fly-idle" };

    const untouched = CAMERA_FLY_TO_NODE.evaluate({ trigger: 0 }, CAMERA_FLY_TO_NODE.defaultParams, idleCtx);

    expect(untouched.active).toBe(0);
  });

  test("active turns on for the duration of the flight", () => {
    const camA = new THREE.Matrix4().makeTranslation(0, 0, 0);
    const camB = new THREE.Matrix4().makeTranslation(20, 0, 0);
    const trigCtx: EvalContext = { time: 1.0, step: 60, nodeId: "fly-active-during" };
    const params = { ...CAMERA_FLY_TO_NODE.defaultParams, duration: 2.0, arcHeight: 0 };

    CAMERA_FLY_TO_NODE.evaluate({ cameraA: camA, cameraB: camB, trigger: 1 }, params, trigCtx);

    const mid = CAMERA_FLY_TO_NODE.evaluate(
      { cameraA: camA, cameraB: camB, trigger: 1 },
      params,
      { ...trigCtx, time: 2.0 },
    );
    expect(mid.active).toBe(1);
  });

  test("landing with no Camera B node behind the pose keeps the camera parked there", () => {
    // Auto Switch hands the active camera to the *node* wired into Camera B.
    // A bare matrix has no node behind it — releasing control here would drop
    // the view back to whichever Camera node is still active, i.e. the one
    // the flight departed from.
    const camA = new THREE.Matrix4().makeTranslation(0, 0, 0);
    const camB = new THREE.Matrix4().makeTranslation(20, 0, 0);
    const trigCtx: EvalContext = { time: 1.0, step: 60, nodeId: "fly-handback" };
    const params = { ...CAMERA_FLY_TO_NODE.defaultParams, duration: 2.0, arcHeight: 0, switchActiveOnFinish: true };

    CAMERA_FLY_TO_NODE.evaluate({ cameraA: camA, cameraB: camB, trigger: 1 }, params, trigCtx);
    const finish = CAMERA_FLY_TO_NODE.evaluate(
      { cameraA: camA, cameraB: camB, trigger: 0 },
      params,
      { ...trigCtx, time: 3.0 },
    );

    expect(finish.isFinished).toBe(1);
    expect(finish.active).toBe(1);
  });

  test("switchActiveOnFinish = false stays parked at the destination", () => {
    const camA = new THREE.Matrix4().makeTranslation(0, 0, 0);
    const camB = new THREE.Matrix4().makeTranslation(20, 0, 0);
    const trigCtx: EvalContext = { time: 1.0, step: 60, nodeId: "fly-stay-parked" };
    const params = { ...CAMERA_FLY_TO_NODE.defaultParams, duration: 2.0, arcHeight: 0, switchActiveOnFinish: false };

    CAMERA_FLY_TO_NODE.evaluate({ cameraA: camA, cameraB: camB, trigger: 1 }, params, trigCtx);
    const finish = CAMERA_FLY_TO_NODE.evaluate(
      { cameraA: camA, cameraB: camB, trigger: 0 },
      params,
      { ...trigCtx, time: 3.0 },
    );

    expect(finish.isFinished).toBe(1);
    expect(finish.active).toBe(1);
  });

  test("a wired Progress input is treated as deliberate control, active for as long as it's wired", () => {
    const camA = new THREE.Matrix4().makeTranslation(0, 0, 10);
    const camB = new THREE.Matrix4().makeTranslation(10, 0, 10);

    const result = CAMERA_FLY_TO_NODE.evaluate(
      { cameraA: camA, cameraB: camB, progress: 0.5 },
      CAMERA_FLY_TO_NODE.defaultParams,
      wiredProgress("fly-scrub"),
    );

    expect(result.active).toBe(1);
  });
});

/**
 * Through evaluateGraph, not evaluate() — the distinction that let the
 * flight timer ship broken. The evaluator fills every declared input socket
 * from its param when nothing is wired, so a direct evaluate() call that
 * simply omits a key exercises a situation the running app never produces.
 */
describe("CAMERA_FLY_TO_NODE in a real graph", () => {
  function flyToGraph(params: Record<string, unknown> = {}): Graph {
    return {
      nodes: [
        {
          id: "fly",
          type: CAMERA_FLY_TO_NODE.type,
          position: { x: 0, y: 0 },
          params: { ...CAMERA_FLY_TO_NODE.defaultParams, duration: 2.0, arcHeight: 0, ...params },
        },
      ],
      connections: [],
    };
  }

  function evalAt(graph: Graph, time: number): Record<string, unknown> {
    return evaluateGraph(graph, DEFAULT_REGISTRY, { time, step: time * 60, nodeId: "" }).get("fly")!;
  }

  test("an untriggered node stays out of the way instead of seizing the camera", () => {
    // The bug this covers: `active` was hardcoded to 1, so merely placing a
    // Fly To node overrode every Camera node's Active toggle for good.
    const result = evalAt(flyToGraph(), 1);

    expect(result.active).toBe(0);
    expect(result.progress).toBe(0);
  });

  test("a triggered flight actually advances over time", () => {
    // The bug this covers: Progress is an unwired socket, so the evaluator
    // filled inputs.progress with the param (0). The old
    // `inputs.progress !== undefined` test therefore always won and the
    // timer branch never ran — Progress stayed 0 forever and nothing moved.
    const graph = flyToGraph();
    evalAt(graph, 1);

    graph.nodes[0].params.trigger = 1;
    evalAt(graph, 2);

    expect(evalAt(graph, 3).progress).toBeCloseTo(0.5);
    expect(evalAt(graph, 2.5).progress).toBeCloseTo(0.25);
  });

  test("the camera stays at the destination after landing rather than snapping back", () => {
    // Once the flight ends isFlying goes false, and without the landed flag
    // the next frame fell through to the Progress param — still 0 — putting
    // the camera back at Camera A one frame after arriving.
    const graph = flyToGraph();
    evalAt(graph, 1);
    graph.nodes[0].params.trigger = 1;
    evalAt(graph, 2);

    expect(evalAt(graph, 4).progress).toBeCloseTo(1);
    expect(evalAt(graph, 9).progress).toBeCloseTo(1);
  });

  test("with Auto Switch off it keeps the camera parked at the destination", () => {
    const graph = flyToGraph({ switchActiveOnFinish: false });
    evalAt(graph, 1);
    graph.nodes[0].params.trigger = 1;
    evalAt(graph, 2);

    expect(evalAt(graph, 4).active).toBe(1);
  });

  test("re-triggering flies again from the start", () => {
    const graph = flyToGraph();
    evalAt(graph, 1);
    graph.nodes[0].params.trigger = 1;
    evalAt(graph, 2);
    evalAt(graph, 4);

    // Release, then press again — the same rising edge a held key produces.
    graph.nodes[0].params.trigger = 0;
    evalAt(graph, 5);
    graph.nodes[0].params.trigger = 1;
    evalAt(graph, 6);

    expect(evalAt(graph, 7).progress).toBeCloseTo(0.5);
  });

  test("a wired Progress takes over and reports itself in charge", () => {
    const graph: Graph = {
      nodes: [
        { id: "p", type: "value/constant", position: { x: 0, y: 0 }, params: { value: 0.5 } },
        {
          id: "fly",
          type: CAMERA_FLY_TO_NODE.type,
          position: { x: 0, y: 0 },
          params: { ...CAMERA_FLY_TO_NODE.defaultParams, arcHeight: 0 },
        },
      ],
      connections: [
        { id: "c1", fromNode: "p", fromSocket: "out", toNode: "fly", toSocket: "progress" },
      ],
    };

    const result = evalAt(graph, 1);
    expect(result.progress).toBeCloseTo(0.5);
    expect(result.active).toBe(1);
  });
});

describe("CAMERA_FLY_TO_NODE landing hand-off", () => {
  function handoffGraph(params: Record<string, unknown> = {}): Graph {
    return {
      nodes: [
        { id: "camA", type: CAMERA_NODE.type, position: { x: 0, y: 0 }, params: { active: true } },
        { id: "camB", type: CAMERA_NODE.type, position: { x: 0, y: 0 }, params: { active: false } },
        {
          id: "fly",
          type: CAMERA_FLY_TO_NODE.type,
          position: { x: 0, y: 0 },
          params: { ...CAMERA_FLY_TO_NODE.defaultParams, duration: 2.0, arcHeight: 0, ...params },
        },
      ],
      connections: [
        { id: "a", fromNode: "camA", fromSocket: "matrix", toNode: "fly", toSocket: "cameraA" },
        { id: "b", fromNode: "camB", fromSocket: "matrix", toNode: "fly", toSocket: "cameraB" },
      ],
    };
  }

  function evalAt(graph: Graph, time: number) {
    return evaluateGraph(graph, DEFAULT_REGISTRY, { time, step: time * 60, nodeId: "" });
  }

  function flyAndLand(graph: Graph) {
    const fly = graph.nodes.find((n) => n.id === "fly")!;
    evalAt(graph, 1);
    fly.params.trigger = 1;
    evalAt(graph, 2);
    return evalAt(graph, 4);
  }

  test("landing hands the active camera to whatever is wired into Camera B", () => {
    // The reported bug: Fly To merely stopped claiming control, so the
    // viewport fell back to the first *active* Camera node — the one the
    // flight departed from — and the view snapped back to camera 1.
    consumeCameraHandoffRequest();
    const graph = handoffGraph();

    flyAndLand(graph);

    expect(consumeCameraHandoffRequest()).toBe("camB");
  });

  test("the hand-off is asked for once, not on every frame after landing", () => {
    // It writes to the graph, so re-requesting each frame would rewrite
    // state 60 times a second for as long as the node sits there landed.
    consumeCameraHandoffRequest();
    const graph = handoffGraph();
    flyAndLand(graph);
    consumeCameraHandoffRequest();

    evalAt(graph, 5);
    evalAt(graph, 6);

    expect(consumeCameraHandoffRequest()).toBeNull();
  });

  test("re-triggering hands off again", () => {
    consumeCameraHandoffRequest();
    const graph = handoffGraph();
    flyAndLand(graph);
    consumeCameraHandoffRequest();

    const fly = graph.nodes.find((n) => n.id === "fly")!;
    fly.params.trigger = 0;
    evalAt(graph, 5);
    fly.params.trigger = 1;
    evalAt(graph, 6);
    evalAt(graph, 9);

    expect(consumeCameraHandoffRequest()).toBe("camB");
  });

  test("Auto Switch off keeps control instead of handing over", () => {
    consumeCameraHandoffRequest();
    const graph = handoffGraph({ switchActiveOnFinish: false });

    const landed = flyAndLand(graph).get("fly")!;

    expect(consumeCameraHandoffRequest()).toBeNull();
    expect(landed.active).toBe(1);
  });

  test("with nothing wired into Camera B it stays parked rather than falling back to the start", () => {
    // No node owns the destination pose, so there is nobody to hand to —
    // releasing here would drop the view straight back to Camera A.
    consumeCameraHandoffRequest();
    const graph: Graph = {
      nodes: [
        { id: "camA", type: CAMERA_NODE.type, position: { x: 0, y: 0 }, params: { active: true } },
        {
          id: "fly",
          type: CAMERA_FLY_TO_NODE.type,
          position: { x: 0, y: 0 },
          params: { ...CAMERA_FLY_TO_NODE.defaultParams, duration: 2.0, arcHeight: 0 },
        },
      ],
      connections: [{ id: "a", fromNode: "camA", fromSocket: "matrix", toNode: "fly", toSocket: "cameraA" }],
    };

    const landed = flyAndLand(graph).get("fly")!;

    expect(consumeCameraHandoffRequest()).toBeNull();
    expect(landed.active).toBe(1);
  });

  test("stays parked (active) on the landing frame until the hand-off is applied", () => {
    // The 1-frame viewport artifact: Fly To used to drop out of contention on
    // the landing frame, a frame before activateCameraNode made the target
    // active, so the view flashed back to the start camera. It must stay
    // active (parked at the destination) while the hand-off is still queued.
    consumeCameraHandoffRequest();
    const graph = handoffGraph();
    const landed = flyAndLand(graph).get("fly")!;
    expect(landed.active).toBe(1);
    expect(landed.progress).toBeCloseTo(1);

    // Apply the hand-off the same way App.activateCameraNode does, then the
    // node must step aside — after the short park buffer has run out.
    const isCam = (t: string) => t === CAMERA_NODE.type || t === CAMERA_FLY_TO_NODE.type;
    const applied: Graph = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.id === "camB") return { ...n, params: { ...n.params, active: true } };
        if (isCam(n.type)) return { ...n, params: { ...n.params, active: false } };
        return n;
      }),
    };

    // Still parked for the first couple of frames after the hand-off (the
    // "offset léger" so the switch doesn't cut the settling movement).
    expect(evaluateGraph(applied, DEFAULT_REGISTRY, { time: 5, step: 300, nodeId: "" }).get("fly")!.active).toBe(1);

    const after = evaluateGraph(applied, DEFAULT_REGISTRY, { time: 8, step: 480, nodeId: "" }).get("fly")!;
    expect(after.active).toBe(0);
  });

  test("stays parked on landing even when a previous hand-off left params.active=false", () => {
    // A Fly To node that has been handed off before carries `params.active:
    // false` in its saved params (activateCameraNode writes it). The parking
    // signal must come from the landing itself, not from params.active —
    // otherwise it relinquishes a frame early and the viewport flashes back.
    consumeCameraHandoffRequest();
    const graph = handoffGraph();
    const fly = graph.nodes.find((n) => n.id === "fly")!;
    fly.params.active = false;

    const landed = flyAndLand(graph).get("fly")!;
    expect(landed.active).toBe(1);
    expect(landed.progress).toBeCloseTo(1);
  });
});
