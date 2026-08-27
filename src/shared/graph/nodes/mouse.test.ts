import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { MOUSE_NODE } from "./mouse";
import { registerPointerViewport, simulatePointerMove } from "../pointerStore";

/** A viewport 800x600 at the window's top-left, seen through a camera at +Z looking down -Z. */
function fakeViewport(camera: THREE.Camera) {
  const element = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
  } as unknown as HTMLElement;
  return registerPointerViewport({ element, getCamera: () => camera });
}

function makeCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

let unregister: (() => void) | null = null;
afterEach(() => {
  unregister?.();
  unregister = null;
});

const params = { ...MOUSE_NODE.defaultParams };

describe("MOUSE_NODE", () => {
  it("reports screen and NDC coordinates against the viewport under the pointer", () => {
    unregister = fakeViewport(makeCamera());
    simulatePointerMove(600, 150);

    const res = MOUSE_NODE.evaluate({}, params, { nodeId: "mouse_ndc" } as any);
    expect(res.screenX).toBe(600);
    expect(res.screenY).toBe(150);
    expect(res.ndcX).toBeCloseTo(0.5);
    expect(res.ndcY).toBeCloseTo(0.5);
    expect(res.inside).toBe(1);
  });

  it("estimates a 3D point with no Camera node and an empty scene", () => {
    unregister = fakeViewport(makeCamera());

    simulatePointerMove(400, 300);
    const center = MOUSE_NODE.evaluate({}, params, { nodeId: "mouse_plane" } as any);
    const centerPoint = center.point as THREE.Vector3;
    // Dead centre, camera at z=10 looking down -Z, plane 5 in front.
    expect(centerPoint.x).toBeCloseTo(0);
    expect(centerPoint.y).toBeCloseTo(0);
    expect(centerPoint.z).toBeCloseTo(5);
    expect(center.hit).toBe(0);
    expect(center.distanceOut).toBeCloseTo(5);

    // Moving the pointer has to move the point — the bug this node had was
    // everything but screenX/Y sitting frozen at zero.
    simulatePointerMove(700, 100);
    const offset = MOUSE_NODE.evaluate({}, params, { nodeId: "mouse_plane" } as any);
    const offsetPoint = offset.point as THREE.Vector3;
    expect(offsetPoint.x).toBeGreaterThan(0.5);
    expect(offsetPoint.y).toBeGreaterThan(0.5);
    expect(offsetPoint.z).toBeCloseTo(5);
  });

  it("hits scene geometry when Target is Scene", () => {
    unregister = fakeViewport(makeCamera());
    simulatePointerMove(400, 300);

    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    box.userData.nodeId = "obj_1";
    box.updateMatrixWorld(true);
    const scene = new THREE.Scene();
    scene.add(box);

    const res = MOUSE_NODE.evaluate({}, params, { nodeId: "mouse_scene", scene } as any);
    expect(res.hit).toBe(1);
    expect((res.point as THREE.Vector3).z).toBeCloseTo(1);
    expect((res.normal as THREE.Vector3).z).toBeCloseTo(1);
  });

  it("projects onto the ground plane when Target is Ground", () => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
    camera.position.set(0, 10, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    unregister = fakeViewport(camera);
    simulatePointerMove(400, 300);

    const res = MOUSE_NODE.evaluate({}, { ...params, target: "Ground" }, { nodeId: "mouse_ground" } as any);
    expect((res.point as THREE.Vector3).y).toBeCloseTo(0);
    expect((res.normal as THREE.Vector3).y).toBeCloseTo(1);
  });

  it("smoothing eases the point towards the pointer instead of snapping", () => {
    unregister = fakeViewport(makeCamera());
    simulatePointerMove(400, 300);
    const smooth = { ...params, smoothing: 0.8 };

    MOUSE_NODE.evaluate({}, smooth, { nodeId: "mouse_smooth" } as any); // seeds at centre
    simulatePointerMove(760, 300);
    const first = MOUSE_NODE.evaluate({}, smooth, { nodeId: "mouse_smooth" } as any);
    const second = MOUSE_NODE.evaluate({}, smooth, { nodeId: "mouse_smooth" } as any);

    const x1 = (first.point as THREE.Vector3).x;
    const x2 = (second.point as THREE.Vector3).x;
    expect(x1).toBeGreaterThan(0);
    expect(x2).toBeGreaterThan(x1);
  });

  it("falls back to zeroed outputs with no viewport and no camera pose", () => {
    const res = MOUSE_NODE.evaluate({}, params, { nodeId: "mouse_headless" } as any);
    expect(res.hit).toBe(0);
    expect((res.point as THREE.Vector3).lengthSq()).toBe(0);
  });
});
