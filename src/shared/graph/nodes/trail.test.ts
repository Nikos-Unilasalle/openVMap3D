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
      { geometry: box, squash: 0, stretch: 0 },
      SQUASH_STRETCH_NODE.defaultParams,
      { ...CTX, nodeId: "squash-0" },
    );
    const group = res.geometry as THREE.Group;
    const v = new THREE.Vector3(0, 2, 0).applyMatrix4(group.matrix);
    expect(v.y).toBeCloseTo(2);
  });

  it("squashes along the axis and stretches perpendicularly", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.matrixAutoUpdate = false;
    const res = SQUASH_STRETCH_NODE.evaluate(
      { geometry: box, squash: 1, stretch: 0.5 },
      SQUASH_STRETCH_NODE.defaultParams,
      { ...CTX, nodeId: "squash-1" },
    );
    const group = res.geometry as THREE.Group;
    // Axis Y squashed to 40%; X widened by 1 + 0.5*0.5 = 1.25.
    const along = new THREE.Vector3(0, 1, 0).applyMatrix4(group.matrix);
    expect(along.y).toBeCloseTo(0.4);
    const perp = new THREE.Vector3(1, 0, 0).applyMatrix4(group.matrix);
    expect(perp.x).toBeCloseTo(1.25);
  });
});
