import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SPAWN_NODE } from "./spawn";

describe("SPAWN_NODE", () => {
  it("spawns instances on a support plane", () => {
    const supportGeo = new THREE.PlaneGeometry(10, 10);
    const supportMesh = new THREE.Mesh(supportGeo);

    const itemMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));

    const res = SPAWN_NODE.evaluate(
      { support: supportMesh, items: [itemMesh] },
      { count: 10, seed: 42, alignToNormal: 1 },
      { nodeId: "spawn_1" } as any,
    );

    expect(res.geometry).toBeInstanceOf(THREE.Group);
    const group = res.geometry as THREE.Group;
    expect(group.children.length).toBe(10);
  });

  it("is deterministic when using the same seed", () => {
    const supportMesh = new THREE.Mesh(new THREE.PlaneGeometry(5, 5));
    const itemMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5));

    const res1 = SPAWN_NODE.evaluate(
      { support: supportMesh, items: [itemMesh] },
      { count: 5, seed: 100 },
      { nodeId: "spawn_test_1" } as any,
    );

    const res2 = SPAWN_NODE.evaluate(
      { support: supportMesh, items: [itemMesh] },
      { count: 5, seed: 100 },
      { nodeId: "spawn_test_2" } as any,
    );

    const group1 = res1.geometry as THREE.Group;
    const group2 = res2.geometry as THREE.Group;

    expect(group1.children.length).toBe(5);
    expect(group2.children.length).toBe(5);

    for (let i = 0; i < 5; i++) {
      expect(group1.children[i].position.x).toBeCloseTo(group2.children[i].position.x);
      expect(group1.children[i].position.y).toBeCloseTo(group2.children[i].position.y);
      expect(group1.children[i].position.z).toBeCloseTo(group2.children[i].position.z);
    }
  });

  it("returns empty group if support or items are missing", () => {
    const res = SPAWN_NODE.evaluate({}, {}, { nodeId: "spawn_empty" } as any);
    expect(res.geometry).toBeInstanceOf(THREE.Group);
    expect((res.geometry as THREE.Group).children.length).toBe(0);
  });

  it("preserves item local scale, rotation and location offset", () => {
    const supportMesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10));
    const itemMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    itemMesh.scale.set(0.5, 5, 0.5);
    itemMesh.position.set(0, 2, 0);
    itemMesh.updateMatrix();

    const res = SPAWN_NODE.evaluate(
      { support: supportMesh, items: [itemMesh] },
      { count: 1, seed: 1, scaleMin: 1, scaleMax: 1, alignToNormal: 0, rotXVar: 0, rotYVar: 0, rotZVar: 0 },
      { nodeId: "spawn_transform_test" } as any,
    );

    const group = res.geometry as THREE.Group;
    const instance = group.children[0];
    expect(instance.scale.y).toBeCloseTo(5);
  });
});

describe("SPAWN_NODE with graph-driven objects", () => {
  /**
   * How every object.ts primitive actually arrives: matrixAutoUpdate off and
   * `matrix` written directly by the node, with position/quaternion/scale
   * left at their untouched defaults. Anything that calls updateMatrix() on
   * one of these recomputes `matrix` from those defaults and so wipes the
   * transform the graph just set.
   */
  function graphDrivenMesh(matrix: THREE.Matrix4): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrix);
    return mesh;
  }

  it("honours an item's location/rotation/scale set the way the graph sets it", () => {
    const support = graphDrivenMesh(new THREE.Matrix4());
    support.geometry = new THREE.PlaneGeometry(10, 10);

    const itemMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 2, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(0.5, 5, 0.5),
    );
    const item = graphDrivenMesh(itemMatrix);

    const res = SPAWN_NODE.evaluate(
      { support, items: [item] },
      { count: 1, seed: 1, scaleMin: 1, scaleMax: 1, alignToNormal: 0, rotXVar: 0, rotYVar: 0, rotZVar: 0 },
      { nodeId: "spawn_graph_driven" } as any,
    );

    const instance = (res.geometry as THREE.Group).children[0];
    expect(instance.scale.y).toBeCloseTo(5);
    expect(instance.scale.x).toBeCloseTo(0.5);
  });

  it("never mutates the source item — it is a shared cached mesh, still drawn elsewhere", () => {
    const support = graphDrivenMesh(new THREE.Matrix4());
    support.geometry = new THREE.PlaneGeometry(10, 10);

    const itemMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(3, 1, -2),
      new THREE.Quaternion(),
      new THREE.Vector3(2, 2, 2),
    );
    const item = graphDrivenMesh(itemMatrix);

    SPAWN_NODE.evaluate(
      { support, items: [item] },
      { count: 3, seed: 7 },
      { nodeId: "spawn_no_mutate" } as any,
    );

    expect(item.matrix.equals(itemMatrix)).toBe(true);
  });

  it("never mutates the support — its own transform must survive sampling", () => {
    const supportMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 5, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 1, 1),
    );
    const support = graphDrivenMesh(supportMatrix);
    support.geometry = new THREE.PlaneGeometry(10, 10);

    SPAWN_NODE.evaluate(
      { support, items: [graphDrivenMesh(new THREE.Matrix4())] },
      { count: 5, seed: 3 },
      { nodeId: "spawn_no_mutate_support" } as any,
    );

    expect(support.matrix.equals(supportMatrix)).toBe(true);
  });

  it("samples on the support where the graph actually put it", () => {
    // PlaneGeometry lies in XY, so Z is the one axis every sample shares —
    // offsetting the support along it isolates whether the support's own
    // graph-set matrix reached the sampler at all.
    const supportMatrix = new THREE.Matrix4().makeTranslation(0, 0, 10);
    const support = graphDrivenMesh(supportMatrix);
    support.geometry = new THREE.PlaneGeometry(10, 10);

    const res = SPAWN_NODE.evaluate(
      { support, items: [graphDrivenMesh(new THREE.Matrix4())] },
      { count: 5, seed: 11, alignToNormal: 0, dispersion: 0 },
      { nodeId: "spawn_support_offset" } as any,
    );

    const children = (res.geometry as THREE.Group).children;
    expect(children.length).toBe(5);
    for (const instance of children) {
      expect(instance.position.z).toBeCloseTo(10);
    }
  });
});
