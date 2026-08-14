import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { createSceneMembership, isSelfOrDescendantOf } from "./sceneMembership";

function obj(): THREE.Object3D {
  return new THREE.Object3D();
}

describe("createSceneMembership", () => {
  test("adds the desired objects to the parent", () => {
    const scene = new THREE.Scene();
    const membership = createSceneMembership(scene);
    const a = obj();

    membership.sync(new Map([["a", a]]));

    expect(a.parent).toBe(scene);
  });

  test("removes an object once it drops out of the desired set", () => {
    const scene = new THREE.Scene();
    const membership = createSceneMembership(scene);
    const a = obj();

    membership.sync(new Map([["a", a]]));
    membership.sync(new Map());

    expect(a.parent).toBeNull();
    expect(scene.children).not.toContain(a);
  });

  test("empty desired set clears everything — a graph replaced by New leaves nothing behind", () => {
    const scene = new THREE.Scene();
    const membership = createSceneMembership(scene);
    const camHelper = obj();
    const emptyAnchor = obj();

    membership.sync(new Map([["cam", camHelper], ["empty", emptyAnchor]]));
    membership.sync(new Map());

    expect(scene.children).toHaveLength(0);
  });

  test("swaps the object held under a key when the node hands back a new instance", () => {
    const scene = new THREE.Scene();
    const membership = createSceneMembership(scene);
    const first = obj();
    const second = obj();

    membership.sync(new Map([["a", first]]));
    membership.sync(new Map([["a", second]]));

    expect(first.parent).toBeNull();
    expect(second.parent).toBe(scene);
    expect(scene.children).toEqual([second]);
  });

  test("re-syncing the same object is idempotent, not a duplicate add", () => {
    const scene = new THREE.Scene();
    const membership = createSceneMembership(scene);
    const a = obj();

    membership.sync(new Map([["a", a]]));
    membership.sync(new Map([["a", a]]));
    membership.sync(new Map([["a", a]]));

    expect(scene.children).toEqual([a]);
  });

  test("leaves an object alone once something else has reparented it", () => {
    // A Merge node pulls objects into its own group, and the split view's
    // second Viewport adds the same module-cached instance to its own scene.
    const scene = new THREE.Scene();
    const otherParent = new THREE.Group();
    const membership = createSceneMembership(scene);
    const a = obj();

    membership.sync(new Map([["a", a]]));
    otherParent.add(a);
    membership.sync(new Map());

    expect(a.parent).toBe(otherParent);
  });

  test("clear() takes back everything it still owns", () => {
    const scene = new THREE.Scene();
    const membership = createSceneMembership(scene);
    const a = obj();
    const b = obj();

    membership.sync(new Map([["a", a], ["b", b]]));
    membership.clear();

    expect(scene.children).toHaveLength(0);
    expect(a.parent).toBeNull();
    expect(b.parent).toBeNull();
  });

  test("clear() is safe to call twice and does not resurrect anything", () => {
    const scene = new THREE.Scene();
    const membership = createSceneMembership(scene);
    membership.sync(new Map([["a", obj()]]));

    membership.clear();
    expect(() => membership.clear()).not.toThrow();
    expect(scene.children).toHaveLength(0);
  });

  test("an Empty already inside the render output is left in place, not re-parented out of it", () => {
    // Adding it to the scene again would tear it out of the merge group
    // that legitimately holds it — three.js allows a single parent.
    const scene = new THREE.Scene();
    const renderOutput = new THREE.Group();
    const emptyAnchor = obj();
    renderOutput.add(emptyAnchor);

    expect(isSelfOrDescendantOf(emptyAnchor, renderOutput)).toBe(true);

    const membership = createSceneMembership(scene);
    membership.sync(new Map([["render", renderOutput]]));

    expect(emptyAnchor.parent).toBe(renderOutput);
  });

  test("does not disturb objects the membership never added", () => {
    const scene = new THREE.Scene();
    const preexisting = obj();
    scene.add(preexisting);
    const membership = createSceneMembership(scene);

    membership.sync(new Map([["a", obj()]]));
    membership.clear();

    expect(preexisting.parent).toBe(scene);
  });
});
