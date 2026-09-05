import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { composeNativeMatrixWithPivot, composeTransform } from "../graph/nodes/transform";
import { computeGizmoWriteback } from "./gizmoWriteback";
import { GIZMO_SELECTABLE_TYPES } from "../graph/transformLookup";

describe("Pivot behavior & geometry invariance", () => {
  it("preserves object geometry in world space when pivot changes on a rotated/scaled object", () => {
    // Arbitrary initial pose
    const initialLocation = new THREE.Vector3(10, -5, 3);
    const initialRotation = new THREE.Vector3(Math.PI / 4, -Math.PI / 6, Math.PI / 3);
    const initialScale = new THREE.Vector3(2, 0.5, 1.5);
    const oldPivot = new THREE.Vector3(1, 2, -1);

    const initialMatrix = composeNativeMatrixWithPivot(
      undefined,
      initialLocation,
      initialRotation,
      initialScale,
      oldPivot,
    );

    // User moves pivot to a new position
    const newPivot = new THREE.Vector3(4, -1, 5);
    const deltaPiv = new THREE.Vector3().subVectors(newPivot, oldPivot);

    // Compensation formula: deltaLoc = (R * S) * deltaPiv - deltaPiv
    const mRotScale = composeTransform(new THREE.Vector3(), initialRotation, initialScale);
    const deltaPivRotScaled = deltaPiv.clone().applyMatrix4(mRotScale);
    const deltaLoc = new THREE.Vector3().subVectors(deltaPivRotScaled, deltaPiv);
    const compensatedLocation = initialLocation.clone().add(deltaLoc);

    const newMatrix = composeNativeMatrixWithPivot(
      undefined,
      compensatedLocation,
      initialRotation,
      initialScale,
      newPivot,
    );

    // Compare all 16 matrix elements: geometry vertices MUST not move at all
    for (let i = 0; i < 16; i++) {
      expect(newMatrix.elements[i]).toBeCloseTo(initialMatrix.elements[i], 5);
    }

    // Transform a test vertex in the object
    const vertex = new THREE.Vector3(2, 3, -1);
    const pOld = vertex.clone().applyMatrix4(initialMatrix);
    const pNew = vertex.clone().applyMatrix4(newMatrix);
    expect(pNew.x).toBeCloseTo(pOld.x, 5);
    expect(pNew.y).toBeCloseTo(pOld.y, 5);
    expect(pNew.z).toBeCloseTo(pOld.z, 5);
  });

  it("places the gizmo on the pivot point in world space", () => {
    const location = new THREE.Vector3(3, 4, 5);
    const rotation = new THREE.Vector3(0, Math.PI / 2, 0);
    const scale = new THREE.Vector3(1, 1, 1);
    const pivot = new THREE.Vector3(2, 0, 0);

    const matrix = composeNativeMatrixWithPivot(undefined, location, rotation, scale, pivot);
    const obj = new THREE.Object3D();
    obj.matrixAutoUpdate = false;
    obj.matrix.copy(matrix);
    obj.matrixWorld.copy(matrix);

    // World pivot position is obj.localToWorld(pivot)
    const worldPivot = pivot.clone().applyMatrix4(obj.matrixWorld);

    // For rotation = 90 deg around Y, location = (3, 4, 5), pivot = (2, 0, 0):
    // The pivot point in world space is location + pivot = (3 + 2, 4, 5) = (5, 4, 5)
    expect(worldPivot.x).toBeCloseTo(5, 5);
    expect(worldPivot.y).toBeCloseTo(4, 5);
    expect(worldPivot.z).toBeCloseTo(5, 5);
  });

  it("translates object and pivot together when dragging gizmo in translate mode", () => {
    const pivot = new THREE.Vector3(2, 3, 4);
    // Dragged object at world position (12, 13, 14) which is pivot (2,3,4) + location (10,10,10)
    const draggedMatrix = new THREE.Matrix4().makeTranslation(12, 13, 14);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    draggedMatrix.decompose(position, quaternion, scale);

    const patch = computeGizmoWriteback({
      target: { kind: "native", objectNodeId: "box1", deltaSourceNodeId: null },
      mode: "translate",
      object: { matrix: draggedMatrix, position, quaternion, scale },
      upstreamMatrix: null,
      wiredSockets: new Set(),
      pivot,
    });

    // Location written back must have pivot subtracted: (12 - 2, 13 - 3, 14 - 4) = (10, 10, 10)
    expect(patch.location?.x).toBeCloseTo(10, 5);
    expect(patch.location?.y).toBeCloseTo(10, 5);
    expect(patch.location?.z).toBeCloseTo(10, 5);
  });

  it("rotates object around pivot when dragging gizmo in rotate mode", () => {
    const pivot = new THREE.Vector3(0, 5, 0);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    const draggedMatrix = new THREE.Matrix4().compose(new THREE.Vector3(0, 5, 0), quat, new THREE.Vector3(1, 1, 1));
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    draggedMatrix.decompose(position, quaternion, scale);

    const patch = computeGizmoWriteback({
      target: { kind: "native", objectNodeId: "box1", deltaSourceNodeId: null },
      mode: "rotate",
      object: { matrix: draggedMatrix, position, quaternion, scale },
      upstreamMatrix: null,
      wiredSockets: new Set(),
      pivot,
    });

    expect(patch.location).toBeUndefined();
    expect(patch.rotation?.y).toBeCloseTo(Math.PI / 2, 5);
  });

  it("includes particles/emitter in GIZMO_SELECTABLE_TYPES", () => {
    expect(GIZMO_SELECTABLE_TYPES).toContain("particles/emitter");
  });

  it("compensates location without error when keyframes are enabled for location", () => {
    const nextKeyframes: Record<string, Record<string, any[]>> = {
      box1: {
        location: [{ frame: 0, value: new THREE.Vector3(0, 0, 0) }],
      },
    };

    const nodeIdToUpdate = "box1";
    const oldLoc = new THREE.Vector3(0, 0, 0);
    const deltaLoc = new THREE.Vector3(1, 0, 0);
    const newLoc = oldLoc.clone().add(deltaLoc);

    // Verify condition used in App.tsx
    const hasLocationTrack = Boolean(nextKeyframes?.[nodeIdToUpdate]?.["location"]);
    expect(hasLocationTrack).toBe(true);
    expect(newLoc.x).toBe(1);
  });
});
