import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TRAIL_NODE } from "./trail";
import { SQUASH_STRETCH_NODE } from "./squash";
import { EvalContext } from "../types";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "trail-test" };

describe("TRAIL_NODE", () => {
  it("samples the object's world position as time advances", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.matrixAutoUpdate = false;
    box.matrix.makeTranslation(0, 0, 0);

    TRAIL_NODE.evaluate({ geometry: box, time: 0, history: 2, segments: 10 }, TRAIL_NODE.defaultParams, { ...CTX, nodeId: "trail-a" });
    box.matrix.makeTranslation(2, 0, 0);
    box.matrixWorldNeedsUpdate = true;
    const res = TRAIL_NODE.evaluate({ geometry: box, time: 1, history: 2, segments: 10 }, TRAIL_NODE.defaultParams, { ...CTX, nodeId: "trail-a" });

    const line = res.geometry as THREE.LineSegments;
    const geo = line.geometry as LineGeometry;
    const start = geo.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    // Two samples → one segment; its start is the first position, end the last.
    expect(start.count).toBe(1);
    const end = geo.attributes.instanceEnd as THREE.InterleavedBufferAttribute;
    expect(end.getX(0)).toBeCloseTo(2);

    // The world points are exposed as a list.
    const points = res.points as THREE.Vector3[];
    expect(points.length).toBe(2);
    expect(points[points.length - 1].x).toBeCloseTo(2);
  });

  it("resets the trail when time rewinds", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.matrixAutoUpdate = false;
    box.matrix.makeTranslation(0, 0, 0);
    const nodeId = "trail-b";
    TRAIL_NODE.evaluate({ geometry: box, time: 0 }, TRAIL_NODE.defaultParams, { ...CTX, nodeId });
    box.matrix.makeTranslation(5, 0, 0);
    box.matrixWorldNeedsUpdate = true;
    TRAIL_NODE.evaluate({ geometry: box, time: 2 }, TRAIL_NODE.defaultParams, { ...CTX, nodeId });
    // Rewind: fresh trail starts at the current position.
    box.matrix.makeTranslation(-3, 0, 0);
    box.matrixWorldNeedsUpdate = true;
    const res = TRAIL_NODE.evaluate({ geometry: box, time: 0.1 }, TRAIL_NODE.defaultParams, { ...CTX, nodeId });
    const geo = (res.geometry as THREE.LineSegments).geometry as LineGeometry;
    const start = geo.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    expect(start.count).toBe(0); // single sample, no segment yet
  });
});

describe("SQUASH_STRETCH_NODE", () => {
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
