import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { MATRIX_DELAY_NODE } from "./transform";
import { disposeNodeCaches } from "../nodeCaches";
import { EvalContext } from "../types";

/**
 * The probe pose. Deliberately NOT linear in the frame: with `x = frame`, a
 * blend between *any* two samples lands on the right answer, so a test could
 * not tell a correct history from one with a hole torn in it.
 */
function poseAtFrame(frame: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(frame * frame, 0, 0);
}

/** What the delay should hand back for a whole-frame lookup. */
function expectedAt(frame: number): number {
  return x(poseAtFrame(frame));
}

function ctx(frame: number, nodeId = "delay-1", sessionId?: string): EvalContext {
  return { time: frame / 30, step: frame, nodeId, currentFrame: frame, sessionId };
}

function run(frame: number, frames: number, nodeId = "delay-1", sessionId?: string): THREE.Matrix4 {
  const res = MATRIX_DELAY_NODE.evaluate(
    { matrix: poseAtFrame(frame), frames },
    MATRIX_DELAY_NODE.defaultParams,
    ctx(frame, nodeId, sessionId),
  );
  return res.matrix as THREE.Matrix4;
}

function x(m: THREE.Matrix4): number {
  return new THREE.Vector3().setFromMatrixPosition(m).x;
}

describe("MATRIX_DELAY_NODE", () => {
  beforeEach(() => {
    // Node ids are stable across save/undo, so a leaked history would be
    // picked back up by the next test using the same id.
    disposeNodeCaches(["delay-1", "delay-2", "leader"]);
  });

  it("plays back the pose from N frames ago once it has seen them", () => {
    for (let f = 0; f <= 20; f++) run(f, 5);
    // Frame 20 with a 5-frame delay reads the pose recorded at frame 15.
    expect(x(run(20, 5))).toBeCloseTo(expectedAt(15), 6);
  });

  it("passes through undelayed until the history covers the delay", () => {
    // The documented cost of recording rather than re-evaluating upstream:
    // frame 0 has nothing behind it, so it holds at the oldest pose it has.
    expect(x(run(0, 5))).toBeCloseTo(expectedAt(0), 6);
    expect(x(run(1, 5))).toBeCloseTo(expectedAt(0), 6);
    expect(x(run(2, 5))).toBeCloseTo(expectedAt(0), 6);
    // ...and catches up exactly once enough frames have gone by.
    for (let f = 3; f <= 10; f++) run(f, 5);
    expect(x(run(10, 5))).toBeCloseTo(expectedAt(5), 6);
  });

  it("interpolates a fractional delay", () => {
    for (let f = 0; f <= 20; f++) run(f, 2.5);
    // Halfway between the poses at frames 17 and 18.
    expect(x(run(20, 2.5))).toBeCloseTo((expectedAt(17) + expectedAt(18)) / 2, 6);
  });

  it("a zero delay is a pass-through", () => {
    for (let f = 0; f <= 10; f++) run(f, 0);
    expect(x(run(10, 0))).toBeCloseTo(expectedAt(10), 6);
  });

  it("keeps sessions apart when their clocks disagree", () => {
    // The hazard sessionId exists for: panes run on their own clocks, so a
    // live editor frame and a deterministic export frame are rarely the same
    // number. Sharing one buffer, the export's lower frame trips the
    // scrub-back trim and wipes the history the editor just recorded — each
    // pane then destroys the other's past every frame.
    for (let f = 0; f <= 20; f++) run(f, 5, "delay-1", "editor");
    for (let f = 0; f <= 20; f++) run(f, 5, "delay-1", "export");

    // Both panes are now 20 frames in on their own timelines, interleaved.
    for (let f = 21; f <= 30; f++) {
      run(f, 5, "delay-1", "editor");
      run(f - 15, 5, "delay-1", "export"); // export lags far behind
    }

    expect(x(run(30, 5, "delay-1", "editor"))).toBeCloseTo(expectedAt(25), 6);
    expect(x(run(15, 5, "delay-1", "export"))).toBeCloseTo(expectedAt(10), 6);
  });

  it("re-evaluating the same frame does not advance the history", () => {
    for (let f = 0; f <= 20; f++) run(f, 5);
    // A redraw on the frame already recorded — the delay must not slide.
    run(20, 5);
    run(20, 5);
    expect(x(run(20, 5))).toBeCloseTo(expectedAt(15), 6);
  });

  it("drops samples ahead of the playhead after a scrub backwards", () => {
    for (let f = 0; f <= 30; f++) run(f, 5);
    // Jump back to 10: frames 11..30 are the future now, not the past.
    for (let f = 10; f <= 20; f++) run(f, 5);
    expect(x(run(20, 5))).toBeCloseTo(expectedAt(15), 6);
  });

  it("still reads correctly after a long play, so the bounded buffer keeps enough", () => {
    // The history is trimmed every frame to keep it from growing without
    // limit; this pins that the trim leaves the delay's own window intact.
    for (let f = 0; f <= 500; f++) run(f, 4);
    expect(x(run(500, 4))).toBeCloseTo(expectedAt(496), 6);
  });

  it("interpolates rotation as a turn, not as a shear", () => {
    // Element-wise blending of two rotated matrices does not produce a
    // rotation; decomposing and slerping does.
    const spin = (f: number) =>
      new THREE.Matrix4().makeRotationY((f * Math.PI) / 2);
    for (let f = 0; f <= 10; f++) {
      MATRIX_DELAY_NODE.evaluate({ matrix: spin(f), frames: 1.5 }, MATRIX_DELAY_NODE.defaultParams, ctx(f));
    }
    const out = MATRIX_DELAY_NODE.evaluate(
      { matrix: spin(10), frames: 1.5 },
      MATRIX_DELAY_NODE.defaultParams,
      ctx(10),
    ).matrix as THREE.Matrix4;

    const scale = new THREE.Vector3();
    out.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect(scale.x).toBeCloseTo(1, 5);
    expect(scale.y).toBeCloseTo(1, 5);
    expect(scale.z).toBeCloseTo(1, 5);
  });

  it("does not hand out the matrix it stored, so a downstream mutation cannot rewrite history", () => {
    for (let f = 0; f <= 20; f++) run(f, 5);
    const got = run(20, 5);
    got.makeTranslation(999, 999, 999); // a downstream node mutating its input
    expect(x(run(20, 5))).toBeCloseTo(expectedAt(15), 6);
  });

  it("records a copy, so an upstream node reusing one matrix cannot rewrite the past", () => {
    // Many nodes keep a single Matrix4 and rewrite it in place each frame
    // rather than allocating — that is what primitiveOutputs clones against.
    // Storing the reference here would make every recorded sample point at
    // the same object, so the whole history would read as the current pose.
    const reused = new THREE.Matrix4();
    for (let f = 0; f <= 20; f++) {
      reused.copy(poseAtFrame(f));
      MATRIX_DELAY_NODE.evaluate(
        { matrix: reused, frames: 5 },
        MATRIX_DELAY_NODE.defaultParams,
        ctx(f),
      );
    }
    reused.copy(poseAtFrame(20));
    const out = MATRIX_DELAY_NODE.evaluate(
      { matrix: reused, frames: 5 },
      MATRIX_DELAY_NODE.defaultParams,
      ctx(20),
    ).matrix as THREE.Matrix4;

    expect(x(out)).toBeCloseTo(expectedAt(15), 6);
  });

  it("passes through when there is no timeline frame to index by", () => {
    // A headless call has no currentFrame; inventing a history there would
    // make the node non-deterministic.
    const res = MATRIX_DELAY_NODE.evaluate(
      { matrix: poseAtFrame(7), frames: 5 },
      MATRIX_DELAY_NODE.defaultParams,
      { time: 0, step: 0, nodeId: "delay-2" },
    );
    expect(x(res.matrix as THREE.Matrix4)).toBeCloseTo(expectedAt(7), 6);
  });
});
