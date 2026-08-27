import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { INVERT_NORMALS_NODE, applyInversion, collectInvertTargets } from "./invertNormals";
import { disposeNodeCaches } from "../nodeCaches";
import { resetMeshWarnings } from "../meshRequired";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "invert-test" };

function boxMesh() {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
}

/** An unindexed mesh — the branch where corners are consecutive attribute entries. */
function unindexedMesh() {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), new THREE.MeshStandardMaterial());
}

function snapshot(geometry: THREE.BufferGeometry) {
  return {
    index: geometry.getIndex() ? Array.from(geometry.getIndex()!.array) : null,
    normal: Array.from(geometry.getAttribute("normal").array),
    position: Array.from(geometry.getAttribute("position").array),
    uv: geometry.getAttribute("uv") ? Array.from(geometry.getAttribute("uv").array) : null,
  };
}

beforeEach(() => resetMeshWarnings());

describe("applyInversion", () => {
  it("reverses each triangle's winding", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const before = Array.from(geometry.getIndex()!.array);
    applyInversion(geometry, "winding");
    const after = Array.from(geometry.getIndex()!.array);

    // b and c swap; a stays put.
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[2]);
    expect(after[2]).toBe(before[1]);
  });

  it("negates every normal", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const before = Array.from(geometry.getAttribute("normal").array);
    applyInversion(geometry, "normals");
    const after = Array.from(geometry.getAttribute("normal").array);
    expect(after).toEqual(before.map((n) => -n));
  });

  it("is exactly self-inverse, which is what undoing on teardown relies on", () => {
    for (const mode of ["both", "normals", "winding"] as const) {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const before = snapshot(geometry);
      applyInversion(geometry, mode);
      applyInversion(geometry, mode);
      expect(snapshot(geometry)).toEqual(before);
    }
  });

  it("keeps an unindexed mesh's attributes in step with each other", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const before = snapshot(geometry);
    applyInversion(geometry, "winding");
    const after = snapshot(geometry);

    // Positions moved...
    expect(after.position).not.toEqual(before.position);
    // ...and so did the UVs, by the same swap. Moving one without the other
    // would tear the texture off the geometry.
    expect(after.uv).not.toEqual(before.uv);
    const size = 3;
    expect(after.position.slice(size, size * 2)).toEqual(before.position.slice(size * 2, size * 3));
    expect(after.uv!.slice(2, 4)).toEqual(before.uv!.slice(4, 6));

    applyInversion(geometry, "winding");
    expect(snapshot(geometry)).toEqual(before);
  });

  it("survives a geometry with no normals at all", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    expect(() => applyInversion(geometry, "both")).not.toThrow();
  });
});

describe("collectInvertTargets", () => {
  it("finds every mesh, not just the first — an imported model is many", () => {
    const group = new THREE.Group();
    group.add(boxMesh(), boxMesh(), boxMesh());
    expect(collectInvertTargets(group)).toHaveLength(3);
  });

  it("leaves helper geometry alone, which is there to do a job flipping would break", () => {
    const group = new THREE.Group();
    const real = boxMesh();
    const capHelper = boxMesh();
    capHelper.userData.__clipCapHelper = true;
    const icon = boxMesh();
    icon.userData.isHelper = true;
    group.add(real, capHelper, icon);
    expect(collectInvertTargets(group)).toEqual([real]);
  });

  it("ignores objects that carry no vertices", () => {
    const group = new THREE.Group();
    group.add(new THREE.Object3D(), new THREE.Points(new THREE.BufferGeometry()));
    expect(collectInvertTargets(group)).toHaveLength(0);
  });
});

describe("INVERT_NORMALS_NODE", () => {
  it("flips the mesh it is given and passes the same object through", () => {
    const mesh = boxMesh();
    const before = snapshot(mesh.geometry);

    const res = INVERT_NORMALS_NODE.evaluate({ geometry: mesh }, INVERT_NORMALS_NODE.defaultParams, {
      ...CTX,
      nodeId: "invert-basic",
    });

    expect(res.geometry).toBe(mesh);
    expect(snapshot(mesh.geometry)).not.toEqual(before);
  });

  it("flips once and stays flipped, however many frames run", () => {
    const ctx = { ...CTX, nodeId: "invert-stable" };
    const mesh = boxMesh();
    const original = snapshot(mesh.geometry);

    INVERT_NORMALS_NODE.evaluate({ geometry: mesh }, INVERT_NORMALS_NODE.defaultParams, ctx);
    const flipped = snapshot(mesh.geometry);

    // Re-flipping every frame would strobe between the two states.
    for (let i = 0; i < 5; i++) {
      INVERT_NORMALS_NODE.evaluate({ geometry: mesh }, INVERT_NORMALS_NODE.defaultParams, ctx);
    }
    expect(snapshot(mesh.geometry)).toEqual(flipped);
    expect(snapshot(mesh.geometry)).not.toEqual(original);
  });

  it("flips every mesh under a group", () => {
    const group = new THREE.Group();
    const a = boxMesh();
    const b = boxMesh();
    group.add(a, b);
    const beforeA = snapshot(a.geometry);
    const beforeB = snapshot(b.geometry);

    INVERT_NORMALS_NODE.evaluate({ geometry: group }, INVERT_NORMALS_NODE.defaultParams, {
      ...CTX,
      nodeId: "invert-group",
    });

    expect(snapshot(a.geometry)).not.toEqual(beforeA);
    expect(snapshot(b.geometry)).not.toEqual(beforeB);
  });

  it("restores the mesh when the node is deleted", () => {
    const ctx = { ...CTX, nodeId: "invert-deleted" };
    const mesh = boxMesh();
    const original = snapshot(mesh.geometry);

    INVERT_NORMALS_NODE.evaluate({ geometry: mesh }, INVERT_NORMALS_NODE.defaultParams, ctx);
    expect(snapshot(mesh.geometry)).not.toEqual(original);

    // The lesson the clip nodes taught: this mutates geometry an upstream node
    // owns and caches, so nothing else will ever put it back.
    disposeNodeCaches(["invert-deleted"]);
    expect(snapshot(mesh.geometry)).toEqual(original);
  });

  it("restores the mesh when its input is unwired", () => {
    const ctx = { ...CTX, nodeId: "invert-unwired" };
    const mesh = boxMesh();
    const original = snapshot(mesh.geometry);

    INVERT_NORMALS_NODE.evaluate({ geometry: mesh }, INVERT_NORMALS_NODE.defaultParams, ctx);
    INVERT_NORMALS_NODE.evaluate({}, INVERT_NORMALS_NODE.defaultParams, ctx);
    expect(snapshot(mesh.geometry)).toEqual(original);
  });

  it("releases the old mesh when the input is rewired to another", () => {
    const ctx = { ...CTX, nodeId: "invert-rewired" };
    const first = boxMesh();
    const second = boxMesh();
    const firstOriginal = snapshot(first.geometry);
    const secondOriginal = snapshot(second.geometry);

    INVERT_NORMALS_NODE.evaluate({ geometry: first }, INVERT_NORMALS_NODE.defaultParams, ctx);
    INVERT_NORMALS_NODE.evaluate({ geometry: second }, INVERT_NORMALS_NODE.defaultParams, ctx);

    expect(snapshot(first.geometry)).toEqual(firstOriginal);
    expect(snapshot(second.geometry)).not.toEqual(secondOriginal);
  });

  it("re-applies cleanly when the mode changes, rather than stacking the two", () => {
    const ctx = { ...CTX, nodeId: "invert-mode" };
    const mesh = boxMesh();
    const original = snapshot(mesh.geometry);

    INVERT_NORMALS_NODE.evaluate({ geometry: mesh }, { mode: "winding" }, ctx);
    INVERT_NORMALS_NODE.evaluate({ geometry: mesh }, { mode: "normals" }, ctx);

    // Switching modes must undo the old one first: leaving the winding flipped
    // and adding a normal flip would be "both", which is not what was asked.
    const normalsOnly = boxMesh();
    applyInversion(normalsOnly.geometry, "normals");
    expect(snapshot(mesh.geometry).index).toEqual(snapshot(normalsOnly.geometry).index);
    expect(snapshot(mesh.geometry).normal).toEqual(snapshot(normalsOnly.geometry).normal);
    expect(snapshot(mesh.geometry)).not.toEqual(original);
  });

  it("handles an unindexed mesh end to end", () => {
    const ctx = { ...CTX, nodeId: "invert-unindexed" };
    const mesh = unindexedMesh();
    const original = snapshot(mesh.geometry);

    INVERT_NORMALS_NODE.evaluate({ geometry: mesh }, INVERT_NORMALS_NODE.defaultParams, ctx);
    expect(snapshot(mesh.geometry)).not.toEqual(original);

    disposeNodeCaches(["invert-unindexed"]);
    expect(snapshot(mesh.geometry)).toEqual(original);
  });

  it("passes a mesh-less input through and says so, rather than failing silently", () => {
    const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    const res = INVERT_NORMALS_NODE.evaluate({ geometry: points }, INVERT_NORMALS_NODE.defaultParams, {
      ...CTX,
      nodeId: "invert-points",
    });
    expect(res.geometry).toBe(points);
  });

  it("passes through null when nothing is wired", () => {
    const res = INVERT_NORMALS_NODE.evaluate({}, INVERT_NORMALS_NODE.defaultParams, {
      ...CTX,
      nodeId: "invert-null",
    });
    expect(res.geometry).toBeNull();
  });
});
