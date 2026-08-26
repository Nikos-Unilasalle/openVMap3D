import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { CLIP_BOX_NODE, VISUAL_SLICE_NODE } from "./visualSlice";
import { clipCapHelperCount, clipCapMeshes } from "./clipCaps";
import { disposeNodeCaches } from "../nodeCaches";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "slice-test" };

/** A closed mesh the clip nodes can chew on, plus the params for a given cap state. */
function boxMesh() {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
}

describe("VISUAL_SLICE_NODE", () => {
  it("assigns a clipping plane to every mesh material in the subtree", () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const group = new THREE.Group();
    group.add(meshA, meshB);

    VISUAL_SLICE_NODE.evaluate(
      { geometry: group, point: new THREE.Vector3(0, 0, 0), direction: new THREE.Vector3(0, 1, 0) },
      VISUAL_SLICE_NODE.defaultParams,
      CTX,
    );

    expect(meshA.material.clippingPlanes).toHaveLength(1);
    expect(meshB.material.clippingPlanes).toHaveLength(1);
    expect(meshA.material.clippingPlanes![0].normal.y).toBeCloseTo(1);
  });

  it("invert flips the plane normal", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    VISUAL_SLICE_NODE.evaluate(
      { geometry: mesh, point: new THREE.Vector3(0, 0, 0), direction: new THREE.Vector3(0, 1, 0) },
      { ...VISUAL_SLICE_NODE.defaultParams, invert: 1 },
      CTX,
    );
    expect(mesh.material.clippingPlanes![0].normal.y).toBeCloseTo(-1);
  });

  it("falls back to the default normal when a degenerate zero vector is given", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    VISUAL_SLICE_NODE.evaluate(
      { geometry: mesh, point: new THREE.Vector3(0, 0, 0), direction: new THREE.Vector3(0, 0, 0) },
      VISUAL_SLICE_NODE.defaultParams,
      CTX,
    );
    const n = mesh.material.clippingPlanes![0].normal;
    expect(n.length()).toBeCloseTo(1);
  });

  it("plane sits at the given point along the given normal", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    VISUAL_SLICE_NODE.evaluate(
      { geometry: mesh, point: new THREE.Vector3(0, 2.5, 0), direction: new THREE.Vector3(0, 1, 0) },
      VISUAL_SLICE_NODE.defaultParams,
      CTX,
    );
    const plane = mesh.material.clippingPlanes![0];
    expect(plane.distanceToPoint(new THREE.Vector3(0, 2.5, 0))).toBeCloseTo(0);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 10, 0))).toBeGreaterThan(0);
    expect(plane.distanceToPoint(new THREE.Vector3(0, -10, 0))).toBeLessThan(0);
  });

  it("turns on renderer.localClippingEnabled when a renderer is present", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const fakeRenderer = { localClippingEnabled: false } as unknown as THREE.WebGLRenderer;
    VISUAL_SLICE_NODE.evaluate(
      { geometry: mesh },
      VISUAL_SLICE_NODE.defaultParams,
      { ...CTX, renderer: fakeRenderer },
    );
    expect(fakeRenderer.localClippingEnabled).toBe(true);
  });

  it("passes through null when nothing is wired", () => {
    const res = VISUAL_SLICE_NODE.evaluate({}, VISUAL_SLICE_NODE.defaultParams, CTX);
    expect(res.geometry).toBeNull();
  });

  it("builds one cap (two stencil draws) when capping is on, and drops it when off", () => {
    const ctx = { ...CTX, nodeId: "slice-cap" };
    const mesh = boxMesh();

    VISUAL_SLICE_NODE.evaluate({ geometry: mesh }, { ...VISUAL_SLICE_NODE.defaultParams, capEnabled: 1 }, ctx);
    expect(clipCapHelperCount("slice-cap")).toEqual({ stencil: 2, caps: 1 });

    VISUAL_SLICE_NODE.evaluate({ geometry: mesh }, { ...VISUAL_SLICE_NODE.defaultParams, capEnabled: 0 }, ctx);
    expect(clipCapHelperCount("slice-cap")).toEqual({ stencil: 0, caps: 0 });
    expect(mesh.children).toHaveLength(0);
  });
});

describe("CLIP_BOX_NODE", () => {
  const params = CLIP_BOX_NODE.defaultParams;

  it("inside mode points all six planes inward, so the box interior survives", () => {
    const mesh = boxMesh();
    CLIP_BOX_NODE.evaluate({ geometry: mesh, size: new THREE.Vector3(2, 2, 2) }, params, CTX);

    const planes = mesh.material.clippingPlanes!;
    expect(planes).toHaveLength(6);
    expect(mesh.material.clipIntersection).toBe(false);
    // A point at the box's centre is kept only if it is on the positive side
    // of every plane — the thing that was broken when the normals faced out.
    for (const plane of planes) {
      expect(plane.distanceToPoint(new THREE.Vector3(0, 0, 0))).toBeGreaterThan(0);
    }
    // ...and a point well outside fails at least one.
    expect(planes.some((p) => p.distanceToPoint(new THREE.Vector3(5, 0, 0)) < 0)).toBe(true);
  });

  it("cavity mode flips the normals outward and unions the half-spaces", () => {
    const mesh = boxMesh();
    CLIP_BOX_NODE.evaluate(
      { geometry: mesh, size: new THREE.Vector3(2, 2, 2) },
      { ...params, clipMode: "cavity" },
      CTX,
    );

    const planes = mesh.material.clippingPlanes!;
    expect(mesh.material.clipIntersection).toBe(true);
    // Inverted: the centre is now rejected by every plane, so it is carved out.
    for (const plane of planes) {
      expect(plane.distanceToPoint(new THREE.Vector3(0, 0, 0))).toBeLessThan(0);
    }
  });

  it("box rotation carries into the plane normals", () => {
    const mesh = boxMesh();
    CLIP_BOX_NODE.evaluate(
      { geometry: mesh, rotation: new THREE.Vector3(0, Math.PI / 2, 0), size: new THREE.Vector3(2, 2, 2) },
      params,
      CTX,
    );
    // The +X face's inward normal (-1,0,0) rotated 90° about Y lands on -Z.
    const planes = mesh.material.clippingPlanes!;
    expect(planes.some((p) => Math.abs(p.normal.z) > 0.99)).toBe(true);
  });

  it("caps every face, and each cap quad lands on its own plane", () => {
    const ctx = { ...CTX, nodeId: "box-cap" };
    const mesh = boxMesh();
    CLIP_BOX_NODE.evaluate(
      { geometry: mesh, size: new THREE.Vector3(2, 2, 2) },
      { ...params, capEnabled: 1 },
      ctx,
    );

    // Six planes × (one source mesh × back + front).
    expect(clipCapHelperCount("box-cap")).toEqual({ stencil: 12, caps: 6 });

    const caps = clipCapMeshes("box-cap");
    expect(caps).toHaveLength(6);
    // Both the caps and the stencil draws hang off the clipped mesh here.
    expect(mesh.children.filter((c) => c.userData.__clipCapHelper)).toHaveLength(18);
    const planes = mesh.material.clippingPlanes!;
    for (let i = 0; i < caps.length; i++) {
      const centre = new THREE.Vector3().setFromMatrixPosition(caps[i].matrixWorld);
      expect(planes[i].distanceToPoint(centre)).toBeCloseTo(0);
      // Trimmed by the other five faces, never by its own.
      expect((caps[i].material as THREE.Material).clippingPlanes).toHaveLength(5);
    }

    CLIP_BOX_NODE.evaluate({ geometry: mesh, size: new THREE.Vector3(2, 2, 2) }, { ...params, capEnabled: 0 }, ctx);
    expect(clipCapHelperCount("box-cap")).toEqual({ stencil: 0, caps: 0 });
  });

  it("reuses the same helper meshes across frames instead of rebuilding them", () => {
    const ctx = { ...CTX, nodeId: "box-cap-stable" };
    const mesh = boxMesh();
    const run = () => CLIP_BOX_NODE.evaluate({ geometry: mesh }, { ...params, capEnabled: 1 }, ctx);

    run();
    const firstCap = mesh.children.find((c) => c.userData.__clipCapHelper);
    run();
    run();
    expect(clipCapHelperCount("box-cap-stable")).toEqual({ stencil: 12, caps: 6 });
    expect(mesh.children.find((c) => c.userData.__clipCapHelper)).toBe(firstCap);
  });

  it("never treats its own cap helpers as geometry to clip", () => {
    const ctx = { ...CTX, nodeId: "box-cap-nore" };
    const mesh = boxMesh();
    const run = () => CLIP_BOX_NODE.evaluate({ geometry: mesh }, { ...params, capEnabled: 1 }, ctx);

    run();
    run();
    // A helper picked up as a source mesh would spawn helpers of its own and
    // multiply every frame; the count staying put is what proves it doesn't.
    expect(clipCapHelperCount("box-cap-nore")).toEqual({ stencil: 12, caps: 6 });
  });

  it("passes through null when nothing is wired", () => {
    const res = CLIP_BOX_NODE.evaluate({}, params, CTX);
    expect(res.geometry).toBeNull();
  });

  it("double-sided is opt-in and restores the material's original side when switched back off", () => {
    const mesh = boxMesh();
    mesh.material.side = THREE.FrontSide;

    CLIP_BOX_NODE.evaluate({ geometry: mesh }, params, CTX);
    expect(mesh.material.side).toBe(THREE.FrontSide);

    CLIP_BOX_NODE.evaluate({ geometry: mesh }, { ...params, doubleSided: 1 }, CTX);
    expect(mesh.material.side).toBe(THREE.DoubleSide);

    CLIP_BOX_NODE.evaluate({ geometry: mesh }, { ...params, doubleSided: 0 }, CTX);
    expect(mesh.material.side).toBe(THREE.FrontSide);
  });

  it("un-clips the geometry when the node is deleted", () => {
    const ctx = { ...CTX, nodeId: "box-deleted" };
    const mesh = boxMesh();
    mesh.material.side = THREE.FrontSide;

    CLIP_BOX_NODE.evaluate({ geometry: mesh }, { ...params, capEnabled: 1, doubleSided: 1 }, ctx);
    expect(mesh.material.clippingPlanes).toHaveLength(6);

    // What App.tsx runs for every node that left the graph.
    disposeNodeCaches(["box-deleted"]);

    expect(mesh.material.clippingPlanes).toBeNull();
    expect(mesh.material.clipIntersection).toBe(false);
    expect(mesh.material.clipShadows).toBe(false);
    expect(mesh.material.side).toBe(THREE.FrontSide);
    // The cap helpers go with it, rather than hanging off an uncut mesh.
    expect(clipCapHelperCount("box-deleted")).toEqual({ stencil: 0, caps: 0 });
    expect(mesh.children).toHaveLength(0);
  });

  it("releases the old geometry when the input is rewired to another object", () => {
    const ctx = { ...CTX, nodeId: "box-rewired" };
    const first = boxMesh();
    const second = boxMesh();

    CLIP_BOX_NODE.evaluate({ geometry: first }, params, ctx);
    expect(first.material.clippingPlanes).toHaveLength(6);

    CLIP_BOX_NODE.evaluate({ geometry: second }, params, ctx);
    expect(second.material.clippingPlanes).toHaveLength(6);
    expect(first.material.clippingPlanes).toBeNull();
  });

  it("releases the geometry when the input is unwired", () => {
    const ctx = { ...CTX, nodeId: "box-unwired" };
    const mesh = boxMesh();

    CLIP_BOX_NODE.evaluate({ geometry: mesh }, params, ctx);
    expect(mesh.material.clippingPlanes).toHaveLength(6);

    CLIP_BOX_NODE.evaluate({}, params, ctx);
    expect(mesh.material.clippingPlanes).toBeNull();
  });

  it("deleting one of two chained clips leaves the other still cutting", () => {
    const upstream = { ...CTX, nodeId: "chain-a" };
    const downstream = { ...CTX, nodeId: "chain-b" };
    const mesh = boxMesh();

    // Both run every frame, downstream last — the same order the evaluator uses.
    const frame = () => {
      CLIP_BOX_NODE.evaluate({ geometry: mesh }, params, upstream);
      VISUAL_SLICE_NODE.evaluate({ geometry: mesh }, VISUAL_SLICE_NODE.defaultParams, downstream);
    };
    frame();
    expect(mesh.material.clippingPlanes).toHaveLength(1);

    disposeNodeCaches(["chain-b"]);
    // Restores what it found: the upstream node's planes, not "unclipped".
    expect(mesh.material.clippingPlanes).toHaveLength(6);

    CLIP_BOX_NODE.evaluate({ geometry: mesh }, params, upstream);
    expect(mesh.material.clippingPlanes).toHaveLength(6);

    disposeNodeCaches(["chain-a"]);
    expect(mesh.material.clippingPlanes).toBeNull();
  });

  it("remembers the pre-clip side from the first touch, not from a double-sided frame", () => {
    const mesh = boxMesh();
    mesh.material.side = THREE.BackSide;

    // Several double-sided frames in a row must not latch DoubleSide as "the original".
    for (let i = 0; i < 3; i++) {
      CLIP_BOX_NODE.evaluate({ geometry: mesh }, { ...params, doubleSided: 1 }, CTX);
    }
    CLIP_BOX_NODE.evaluate({ geometry: mesh }, { ...params, doubleSided: 0 }, CTX);
    expect(mesh.material.side).toBe(THREE.BackSide);
  });
});
