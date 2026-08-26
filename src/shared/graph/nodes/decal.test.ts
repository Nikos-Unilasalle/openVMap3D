import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { DECAL_NODE, collectDecalTargets, decalSignature } from "./decal";
import { disposeNodeCaches } from "../nodeCaches";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "decal-test" };

/** A wall facing +Z, big enough for a unit projector to land well inside it. */
function wall() {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10, 8, 8), new THREE.MeshStandardMaterial());
  mesh.updateMatrixWorld(true);
  return mesh;
}

function meshesOf(object: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) found.push(child);
  });
  return found;
}

describe("collectDecalTargets", () => {
  it("finds every mesh under a group, which is what an imported model is", () => {
    const group = new THREE.Group();
    group.add(wall(), wall());
    expect(collectDecalTargets(group)).toHaveLength(2);
  });

  it("skips helper geometry, which is not surface anyone means to paint", () => {
    const group = new THREE.Group();
    const real = wall();
    const capHelper = wall();
    capHelper.userData.__clipCapHelper = true;
    const lightIcon = wall();
    lightIcon.userData.isHelper = true;
    group.add(real, capHelper, lightIcon);

    expect(collectDecalTargets(group)).toEqual([real]);
  });

  it("ignores objects with no positions to project onto", () => {
    const group = new THREE.Group();
    group.add(new THREE.Object3D(), new THREE.Mesh(new THREE.BufferGeometry()));
    expect(collectDecalTargets(group)).toHaveLength(0);
  });
});

describe("decalSignature", () => {
  const at = new THREE.Vector3(0, 0, 0);
  const rot = new THREE.Vector3(0, 0, 0);
  const size = new THREE.Vector3(1, 1, 1);

  it("changes when the projector moves, turns or resizes", () => {
    const base = decalSignature([wall()], at, rot, size);
    expect(decalSignature([wall()], new THREE.Vector3(1, 0, 0), rot, size)).not.toBe(base);
    expect(decalSignature([wall()], at, new THREE.Vector3(0, 1, 0), size)).not.toBe(base);
    expect(decalSignature([wall()], at, rot, new THREE.Vector3(2, 1, 1))).not.toBe(base);
  });

  it("changes when the target surface moves, since a decal is glued to it", () => {
    const mesh = wall();
    const before = decalSignature([mesh], at, rot, size);
    mesh.position.set(0, 3, 0);
    mesh.updateMatrixWorld(true);
    expect(decalSignature([mesh], at, rot, size)).not.toBe(before);
  });

  it("is stable when nothing moved, so a settled decal is not re-projected every frame", () => {
    const mesh = wall();
    expect(decalSignature([mesh], at, rot, size)).toBe(decalSignature([mesh], at.clone(), rot.clone(), size.clone()));
  });
});

describe("DECAL_NODE", () => {
  it("projects geometry onto the surface it is given", () => {
    const res = DECAL_NODE.evaluate(
      { geometry: wall() },
      { ...DECAL_NODE.defaultParams, scale: new THREE.Vector3(2, 2, 2) },
      { ...CTX, nodeId: "decal-basic" },
    );
    const decals = meshesOf(res.geometry as THREE.Object3D);
    expect(decals).toHaveLength(1);
    expect(decals[0].geometry.getAttribute("position").count).toBeGreaterThan(0);
  });

  it("leaves the target itself untouched — a decal adds to a scene, it doesn't consume it", () => {
    const target = wall();
    const before = target.geometry.uuid;
    DECAL_NODE.evaluate({ geometry: target }, DECAL_NODE.defaultParams, { ...CTX, nodeId: "decal-target" });
    expect(target.geometry.uuid).toBe(before);
    expect(target.parent).toBeNull();
  });

  it("produces nothing when the projector misses the surface entirely", () => {
    const res = DECAL_NODE.evaluate(
      { geometry: wall() },
      { ...DECAL_NODE.defaultParams, location: new THREE.Vector3(0, 0, 50) },
      { ...CTX, nodeId: "decal-miss" },
    );
    // A draw call per miss would be most of them on a model with many parts.
    expect(meshesOf(res.geometry as THREE.Object3D)).toHaveLength(0);
  });

  it("crosses several meshes with one projector", () => {
    const group = new THREE.Group();
    const left = wall();
    left.position.set(-1, 0, 0);
    const right = wall();
    right.position.set(1, 0, 0);
    group.add(left, right);
    group.updateMatrixWorld(true);

    const res = DECAL_NODE.evaluate(
      { geometry: group },
      { ...DECAL_NODE.defaultParams, scale: new THREE.Vector3(4, 4, 4) },
      { ...CTX, nodeId: "decal-multi" },
    );
    expect(meshesOf(res.geometry as THREE.Object3D)).toHaveLength(2);
  });

  it("re-projects when the target moves, rather than leaving the decal behind in mid-air", () => {
    const ctx = { ...CTX, nodeId: "decal-follow" };
    const params = { ...DECAL_NODE.defaultParams, scale: new THREE.Vector3(2, 2, 2) };
    const target = wall();

    const first = DECAL_NODE.evaluate({ geometry: target }, params, ctx);
    const firstGeometry = meshesOf(first.geometry as THREE.Object3D)[0].geometry;

    target.position.set(0, 0.5, 0);
    const second = DECAL_NODE.evaluate({ geometry: target }, params, ctx);
    expect(meshesOf(second.geometry as THREE.Object3D)[0].geometry).not.toBe(firstGeometry);
  });

  it("does not re-project a settled decal, since that means re-clipping every triangle", () => {
    const ctx = { ...CTX, nodeId: "decal-stable" };
    const params = { ...DECAL_NODE.defaultParams, scale: new THREE.Vector3(2, 2, 2) };
    const target = wall();

    const first = meshesOf(DECAL_NODE.evaluate({ geometry: target }, params, ctx).geometry as THREE.Object3D)[0];
    const second = meshesOf(DECAL_NODE.evaluate({ geometry: target }, params, ctx).geometry as THREE.Object3D)[0];
    expect(second).toBe(first);
    expect(second.geometry).toBe(first.geometry);
  });

  it("carries no transform of its own, because the projection is already in world space", () => {
    const res = DECAL_NODE.evaluate(
      { geometry: wall() },
      { ...DECAL_NODE.defaultParams, scale: new THREE.Vector3(2, 2, 2) },
      { ...CTX, nodeId: "decal-world" },
    );
    const decal = meshesOf(res.geometry as THREE.Object3D)[0];
    expect(decal.matrixAutoUpdate).toBe(false);
    expect(decal.matrix.equals(new THREE.Matrix4())).toBe(true);
  });

  it("takes a zero-sized projector without collapsing to nothing usable", () => {
    expect(() =>
      DECAL_NODE.evaluate(
        { geometry: wall() },
        { ...DECAL_NODE.defaultParams, scale: new THREE.Vector3(0, 0, 0) },
        { ...CTX, nodeId: "decal-zero" },
      ),
    ).not.toThrow();
  });

  it("empties out when its target is unwired", () => {
    const ctx = { ...CTX, nodeId: "decal-unwired" };
    const params = { ...DECAL_NODE.defaultParams, scale: new THREE.Vector3(2, 2, 2) };
    DECAL_NODE.evaluate({ geometry: wall() }, params, ctx);
    const res = DECAL_NODE.evaluate({}, params, ctx);
    expect(meshesOf(res.geometry as THREE.Object3D)).toHaveLength(0);
  });

  it("offsets its material off the surface, or the two z-fight into stripes", () => {
    const res = DECAL_NODE.evaluate({ geometry: wall() }, DECAL_NODE.defaultParams, { ...CTX, nodeId: "decal-mat" });
    const decalGroup = res.geometry as THREE.Object3D;
    DECAL_NODE.evaluate(
      { geometry: wall() },
      { ...DECAL_NODE.defaultParams, scale: new THREE.Vector3(2, 2, 2) },
      { ...CTX, nodeId: "decal-mat" },
    );
    const material = meshesOf(decalGroup)[0].material as THREE.MeshStandardMaterial;
    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBeLessThan(0);
    expect(material.depthWrite).toBe(false);
  });

  it("releases its projected geometry when the node is deleted", () => {
    const ctx = { ...CTX, nodeId: "decal-deleted" };
    const first = DECAL_NODE.evaluate(
      { geometry: wall() },
      { ...DECAL_NODE.defaultParams, scale: new THREE.Vector3(2, 2, 2) },
      ctx,
    ).geometry;
    disposeNodeCaches(["decal-deleted"]);
    const second = DECAL_NODE.evaluate(
      { geometry: wall() },
      { ...DECAL_NODE.defaultParams, scale: new THREE.Vector3(2, 2, 2) },
      ctx,
    ).geometry;
    expect(second).not.toBe(first);
  });
});
