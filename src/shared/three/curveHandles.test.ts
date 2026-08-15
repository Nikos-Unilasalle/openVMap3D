import * as THREE from "three";
import { beforeEach, describe, expect, test } from "vitest";
import { createCurvePointHandles } from "./curveHandles";

const POINTS = [new THREE.Vector3(-2, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(2, 0, 0)];

describe("curve point handles", () => {
  let handles: ReturnType<typeof createCurvePointHandles>;

  beforeEach(() => {
    handles = createCurvePointHandles();
  });

  test("handles sit at the control points when the curve is drawn at the origin", () => {
    handles.sync(POINTS, new THREE.Matrix4(), null, null);

    const world = new THREE.Vector3();
    POINTS.forEach((point, idx) => {
      handles.handleAt(idx)!.getWorldPosition(world);
      expect(world.distanceTo(point)).toBeLessThan(1e-6);
    });
  });

  test("handles follow the object that draws the curve", () => {
    // The whole point of the group matrix: control points are stored in the
    // curve's own space, so moving the mesh has to move the handles with it.
    const spaceMatrix = new THREE.Matrix4().makeTranslation(10, 5, -3);
    handles.sync(POINTS, spaceMatrix, null, null);

    const world = new THREE.Vector3();
    handles.handleAt(0)!.getWorldPosition(world);
    expect(world.distanceTo(new THREE.Vector3(8, 5, -3))).toBeLessThan(1e-6);
  });

  test("a handle's local position is what goes back into pointsList, unrotated", () => {
    // A drag sets handle.position; TransformControls resolves world space
    // against the parent, so what lands in the param is curve-space already.
    const spaceMatrix = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(1, 2, 3);
    handles.sync(POINTS, spaceMatrix, null, null);

    expect(handles.handleAt(1)!.position.distanceTo(POINTS[1])).toBeLessThan(1e-6);
  });

  test("handles keep their size under a scaled object", () => {
    // Children of the curve's space, so the object's scale would otherwise
    // stretch them into ellipsoids (or shrink them to unclickable specks).
    handles.sync(POINTS, new THREE.Matrix4().makeScale(4, 0.5, 2), null, null);

    const worldScale = new THREE.Vector3();
    handles.handleAt(0)!.getWorldScale(worldScale);
    expect(worldScale.distanceTo(new THREE.Vector3(1, 1, 1))).toBeLessThan(1e-6);
  });

  test("a degenerate (zero) scale leaves handles at unit size rather than collapsing them", () => {
    handles.sync(POINTS, new THREE.Matrix4().makeScale(1, 0, 1), null, null);

    expect(Number.isFinite(handles.handleAt(0)!.scale.y)).toBe(true);
    expect(handles.handleAt(0)!.scale.y).toBe(1);
  });

  test("the handle being dragged keeps its own position for that frame", () => {
    handles.sync(POINTS, new THREE.Matrix4(), 1, null);
    handles.handleAt(1)!.position.set(0, 9, 0);

    handles.sync(POINTS, new THREE.Matrix4(), 1, 1);

    expect(handles.handleAt(1)!.position.y).toBe(9);
    expect(handles.handleAt(0)!.position.distanceTo(POINTS[0])).toBeLessThan(1e-6);
  });

  test("rebuilds when the point count changes, and clear() empties the group", () => {
    handles.sync(POINTS, new THREE.Matrix4(), null, null);
    expect(handles.count()).toBe(3);

    handles.sync(POINTS.slice(0, 2), new THREE.Matrix4(), null, null);
    expect(handles.count()).toBe(2);
    expect(handles.handleAt(2)).toBeNull();

    handles.clear();
    expect(handles.count()).toBe(0);
    expect(handles.group.children).toHaveLength(0);
  });

  test("picks the handle under the pointer and nothing when the pointer is elsewhere", () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    handles.sync(POINTS, new THREE.Matrix4(), null, null);

    const target = new THREE.Vector3().copy(POINTS[2]).project(camera);
    expect(handles.pick(new THREE.Vector2(target.x, target.y), camera, 800, 600)).toBe(2);
    expect(handles.pick(new THREE.Vector2(-1, -1), camera, 800, 600)).toBeNull();
  });

  test("handleAt(null) is null — nothing picked means the gizmo belongs to the object", () => {
    handles.sync(POINTS, new THREE.Matrix4(), null, null);

    expect(handles.handleAt(null)).toBeNull();
  });

  test("computes centroid position for multiple selected handles", () => {
    handles.sync(POINTS, new THREE.Matrix4(), new Set([0, 2]), null);

    const centroid = handles.getCentroidHandle()!;
    expect(centroid).toBeDefined();
    // Points 0 (-2, 0, 0) and 2 (2, 0, 0) -> centroid at (0, 0, 0)
    expect(centroid.position.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(1e-6);
  });

  test("pickRect finds all handles inside a 2D screen bounding box", () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    handles.sync(POINTS, new THREE.Matrix4(), null, null);

    // Bounding box covering the center point (0, 1, 0) and right point (2, 0, 0)
    const matches = handles.pickRect({ minX: 350, minY: 0, maxX: 800, maxY: 600 }, camera, 800, 600);
    expect(matches).toContain(1);
    expect(matches).toContain(2);
    expect(matches).not.toContain(0);
  });
});
