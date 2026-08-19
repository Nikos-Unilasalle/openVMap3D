import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TRAIL_NODE } from "./trail";
import { SQUASH_STRETCH_NODE } from "./squash";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "trail-test" };
/** Stands in for a wired Time socket, so the graph-clock fallback stays off. */
const wired = (nodeId: string, extra: Partial<EvalContext> = {}): EvalContext => ({
  ...CTX,
  nodeId,
  connectedInputs: new Set(["time"]),
  ...extra,
});

describe("TRAIL_NODE", () => {
  it("samples the object's world position as time advances", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.matrixAutoUpdate = false;
    box.matrix.makeTranslation(0, 0, 0);

    TRAIL_NODE.evaluate({ geometry: box, time: 0, history: 2, segments: 10 }, TRAIL_NODE.defaultParams, wired("trail-a"));
    box.matrix.makeTranslation(2, 0, 0);
    box.matrixWorldNeedsUpdate = true;
    const res = TRAIL_NODE.evaluate({ geometry: box, time: 1, history: 2, segments: 10 }, TRAIL_NODE.defaultParams, wired("trail-a"));

    const points = res.points as THREE.Vector3[];
    expect(points.length).toBe(2);
    expect(points[0].x).toBeCloseTo(0);
    expect(points[1].x).toBeCloseTo(2);
  });

  it("resets the trail when time rewinds", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.matrixAutoUpdate = false;
    box.matrix.makeTranslation(0, 0, 0);
    const nodeId = "trail-b";
    TRAIL_NODE.evaluate({ geometry: box, time: 0 }, TRAIL_NODE.defaultParams, wired(nodeId));
    box.matrix.makeTranslation(5, 0, 0);
    box.matrixWorldNeedsUpdate = true;
    TRAIL_NODE.evaluate({ geometry: box, time: 2 }, TRAIL_NODE.defaultParams, wired(nodeId));
    // Rewind: fresh trail starts at the current position.
    box.matrix.makeTranslation(-3, 0, 0);
    box.matrixWorldNeedsUpdate = true;
    const res = TRAIL_NODE.evaluate({ geometry: box, time: 0.1 }, TRAIL_NODE.defaultParams, wired(nodeId));
    const points = res.points as THREE.Vector3[];
    expect(points.length).toBe(1);
    expect(points[0].x).toBeCloseTo(-3);
  });

  it("drops samples left ahead of the playhead by a small scrub back", () => {
    // Under the 0.5s rewind threshold nothing is wiped, so the future samples
    // have to be pruned by age — they used to survive (a negative age passes a
    // "younger than history" test) and the trail drew the path still to come.
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.matrixAutoUpdate = false;
    const nodeId = "trail-scrub";
    box.matrix.makeTranslation(0, 0, 0);
    TRAIL_NODE.evaluate({ geometry: box, time: 0 }, TRAIL_NODE.defaultParams, wired(nodeId));
    box.matrix.makeTranslation(9, 0, 0);
    box.matrixWorldNeedsUpdate = true;
    TRAIL_NODE.evaluate({ geometry: box, time: 0.4 }, TRAIL_NODE.defaultParams, wired(nodeId));

    box.matrix.makeTranslation(1, 0, 0);
    box.matrixWorldNeedsUpdate = true;
    const res = TRAIL_NODE.evaluate({ geometry: box, time: 0.2 }, TRAIL_NODE.defaultParams, wired(nodeId));
    const points = res.points as THREE.Vector3[];
    expect(points.every((p) => Math.abs(p.x - 9) > 1e-6)).toBe(true);
  });

  it("runs on the graph clock when Time is unwired", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.matrixAutoUpdate = false;
    box.matrix.makeTranslation(0, 0, 0);
    const nodeId = "trail-autoclock";
    TRAIL_NODE.evaluate({ geometry: box }, TRAIL_NODE.defaultParams, { ...CTX, nodeId, time: 0 });
    box.matrix.makeTranslation(4, 0, 0);
    box.matrixWorldNeedsUpdate = true;
    // Only ctx.time advances — the socket keeps reading its default of 0.
    const res = TRAIL_NODE.evaluate({ geometry: box }, TRAIL_NODE.defaultParams, { ...CTX, nodeId, time: 1 });
    expect((res.points as THREE.Vector3[]).length).toBe(2);
  });
});

describe("SQUASH_STRETCH_NODE", () => {
  it("holds its deformation when a second pane re-evaluates the same instant", () => {
    // SplitViewport runs the editor pane and the camera-preview pane off one
    // clock, so this node is evaluated twice per frame with the same `time` —
    // and they share the cached Group, so whichever ran last decided what both
    // scenes showed. The second pass used to reset the stretch to identity.
    const ball = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    ball.matrixAutoUpdate = false;
    const nodeId = "squash-dual-pane";
    const stretchOf = (res: Record<string, unknown>) => {
      const scale = new THREE.Vector3();
      (res.geometry as THREE.Group).matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      return scale.x;
    };
    const evalAt = (time: number) =>
      SQUASH_STRETCH_NODE.evaluate(
        { geometry: ball, time, intensity: 1 },
        SQUASH_STRETCH_NODE.defaultParams,
        { ...CTX, nodeId, connectedInputs: new Set(["time"]) } as EvalContext,
      );

    ball.matrix.makeTranslation(0, 0, 0);
    evalAt(0);
    ball.matrix.makeTranslation(0.5, 0, 0);
    ball.matrixWorldNeedsUpdate = true;

    const paneA = stretchOf(evalAt(1 / 60));
    const paneB = stretchOf(evalAt(1 / 60));
    expect(paneA).toBeGreaterThan(1);
    expect(paneB).toBeCloseTo(paneA);
  });

  it("responds to Intensity even when the clock has not moved", () => {
    const ball = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    ball.matrixAutoUpdate = false;
    const nodeId = "squash-live-intensity";
    const stretchOf = (intensity: number) => {
      const res = SQUASH_STRETCH_NODE.evaluate(
        { geometry: ball, time: 1 / 60, intensity },
        SQUASH_STRETCH_NODE.defaultParams,
        { ...CTX, nodeId, connectedInputs: new Set(["time"]) } as EvalContext,
      );
      const scale = new THREE.Vector3();
      (res.geometry as THREE.Group).matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      return scale.x;
    };
    ball.matrix.makeTranslation(0, 0, 0);
    SQUASH_STRETCH_NODE.evaluate(
      { geometry: ball, time: 0, intensity: 1 },
      SQUASH_STRETCH_NODE.defaultParams,
      { ...CTX, nodeId, connectedInputs: new Set(["time"]) } as EvalContext,
    );
    ball.matrix.makeTranslation(0.5, 0, 0);
    ball.matrixWorldNeedsUpdate = true;
    // Caching the measured speed rather than the finished factor is what keeps
    // this knob live on a paused timeline.
    expect(stretchOf(1)).toBeGreaterThan(stretchOf(0.2));
  });


  it("applies no deformation at rest", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.matrixAutoUpdate = false;
    const res = SQUASH_STRETCH_NODE.evaluate(
      { geometry: box, time: 0 },
      SQUASH_STRETCH_NODE.defaultParams,
      { ...CTX, nodeId: "squash-0" },
    );
    const group = res.geometry as THREE.Group;
    const v = new THREE.Vector3(0, 2, 0).applyMatrix4(group.matrix);
    expect(v.y).toBeCloseTo(2);
  });

  it("stretches along the motion direction and stays pinned at the object", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.matrixAutoUpdate = false;
    box.matrix.makeTranslation(0, 0, 0);
    const nodeId = "squash-1";
    SQUASH_STRETCH_NODE.evaluate(
      { geometry: box, time: 0, intensity: 1, maxSpeed: 3 },
      { ...SQUASH_STRETCH_NODE.defaultParams, intensity: 1, maxSpeed: 3 },
      { ...CTX, nodeId },
    );
    // Move +3 units in 1 s → speed = maxSpeed → stretch factor 1.5 along +X.
    box.matrix.makeTranslation(3, 0, 0);
    box.matrixWorldNeedsUpdate = true;
    const res = SQUASH_STRETCH_NODE.evaluate(
      { geometry: box, time: 1, intensity: 1, maxSpeed: 3 },
      { ...SQUASH_STRETCH_NODE.defaultParams, intensity: 1, maxSpeed: 3 },
      { ...CTX, nodeId },
    );
    const group = res.geometry as THREE.Group;
    // The object's origin stays pinned.
    const origin = new THREE.Vector3(3, 0, 0).applyMatrix4(group.matrix);
    expect(origin.x).toBeCloseTo(3, 3);
    // A point in front of it stretches along the motion.
    const front = new THREE.Vector3(3.5, 0, 0).applyMatrix4(group.matrix);
    expect(front.x).toBeCloseTo(3.75, 3);
    // A point above it squashes perpendicularly (volume-preserving inverse).
    const top = new THREE.Vector3(3, 0.5, 0).applyMatrix4(group.matrix);
    expect(top.y).toBeCloseTo(0.5 / Math.sqrt(1.5), 3);
  });
});
