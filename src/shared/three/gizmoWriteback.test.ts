import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { computeGizmoWriteback } from "./gizmoWriteback";

/** An object posed by matrix only, the way every graph-driven node poses one. */
function draggedTo(matrix: THREE.Matrix4) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return { matrix, position, quaternion, scale };
}

const NOTHING_WIRED = new Set<string>();

describe("computeGizmoWriteback — native target (the object owns its own pose)", () => {
  test("a translate drag writes the dragged position back, not zeros", () => {
    // This is the Camera case: nothing upstream, so the object's own matrix
    // IS the pose that belongs in its location param.
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(4, 1, -2),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 1, 1),
    );

    const patch = computeGizmoWriteback({
      target: { kind: "native", objectNodeId: "cam", deltaSourceNodeId: null },
      mode: "translate",
      object: draggedTo(matrix),
      upstreamMatrix: null,
      wiredSockets: NOTHING_WIRED,
    });

    expect(patch.location?.x).toBeCloseTo(4);
    expect(patch.location?.y).toBeCloseTo(1);
    expect(patch.location?.z).toBeCloseTo(-2);
    expect(patch.rotation).toBeUndefined();
    expect(patch.scale).toBeUndefined();
  });

  test("a rotate drag writes rotation and leaves location alone", () => {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(1, 2, 3), quaternion, new THREE.Vector3(1, 1, 1));

    const patch = computeGizmoWriteback({
      target: { kind: "native", objectNodeId: "cam", deltaSourceNodeId: null },
      mode: "rotate",
      object: draggedTo(matrix),
      upstreamMatrix: null,
      wiredSockets: NOTHING_WIRED,
    });

    expect(patch.location).toBeUndefined();
    expect(patch.rotation?.y).toBeCloseTo(Math.PI / 2);
  });

  test("an upstream delta is divided out, so the base written back excludes it", () => {
    // final = base × delta, and the node's params ARE the base.
    const base = new THREE.Matrix4().makeTranslation(5, 0, 0);
    const delta = new THREE.Matrix4().makeTranslation(2, 0, 0);
    const final = base.clone().multiply(delta);

    const patch = computeGizmoWriteback({
      target: { kind: "native", objectNodeId: "obj", deltaSourceNodeId: "mtx" },
      mode: "translate",
      object: draggedTo(final),
      upstreamMatrix: delta,
      wiredSockets: NOTHING_WIRED,
    });

    expect(patch.location?.x).toBeCloseTo(5);
  });

  test("a wired channel is never written — the param is only the unconnected fallback", () => {
    const matrix = new THREE.Matrix4().makeTranslation(9, 9, 9);

    const patch = computeGizmoWriteback({
      target: { kind: "native", objectNodeId: "cam", deltaSourceNodeId: null },
      mode: "translate",
      object: draggedTo(matrix),
      upstreamMatrix: null,
      wiredSockets: new Set(["location"]),
    });

    expect(patch.location).toBeUndefined();
  });
});

describe("computeGizmoWriteback — absolute target (an upstream Transform node)", () => {
  test("writes the gizmo's own pose straight through", () => {
    const matrix = new THREE.Matrix4().makeTranslation(7, 8, 9);

    const patch = computeGizmoWriteback({
      target: { kind: "absolute", transformNodeId: "t" },
      mode: "translate",
      object: draggedTo(matrix),
      upstreamMatrix: null,
      wiredSockets: NOTHING_WIRED,
    });

    expect(patch.location?.x).toBeCloseTo(7);
    expect(patch.location?.z).toBeCloseTo(9);
  });
});

describe("computeGizmoWriteback — offset target (a Matrix Transform node)", () => {
  test("solves for the delta so the base is not double-counted", () => {
    const base = new THREE.Matrix4().makeTranslation(10, 0, 0);
    const delta = new THREE.Matrix4().makeTranslation(3, 0, 0);
    const final = base.clone().multiply(delta);

    const patch = computeGizmoWriteback({
      target: { kind: "offset", transformNodeId: "mtx", baseSourceNodeId: "up" },
      mode: "translate",
      object: draggedTo(final),
      upstreamMatrix: base,
      wiredSockets: NOTHING_WIRED,
    });

    expect(patch.location?.x).toBeCloseTo(3);
  });

  test("no base wired treats upstream as identity, so the delta is the full pose", () => {
    const final = new THREE.Matrix4().makeTranslation(6, 0, 0);

    const patch = computeGizmoWriteback({
      target: { kind: "offset", transformNodeId: "mtx", baseSourceNodeId: null },
      mode: "translate",
      object: draggedTo(final),
      upstreamMatrix: null,
      wiredSockets: NOTHING_WIRED,
    });

    expect(patch.location?.x).toBeCloseTo(6);
  });

  test("allows assigning position and axis directly on TransformPatch", () => {
    const patch: import("./gizmoWriteback").TransformPatch = {
      position: new THREE.Vector3(1, 2, 3),
      axis: new THREE.Vector3(0, 1, 0),
    };
    expect(patch.position?.toArray()).toEqual([1, 2, 3]);
    expect(patch.axis?.toArray()).toEqual([0, 1, 0]);
  });
});
