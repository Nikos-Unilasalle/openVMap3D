import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { ARRAY_NODE } from "./array";
import { GEOMETRY_TRANSFORM_NODE, GET_INSTANCE_NODE, SET_INSTANCE_COLOR_NODE, SET_INSTANCE_TRANSFORM_NODE } from "./instance";
import { COMBINE_VECTOR_LISTS_NODE, SPLIT_VECTOR_LIST_NODE } from "./list";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "inst-test" };

describe("GEOMETRY TRANSFORM NODE", () => {
  it("GEOMETRY_TRANSFORM_NODE transforms geometry with location, rotX, scale inputs", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = GEOMETRY_TRANSFORM_NODE.evaluate(
      { geometry: box, posX: 5, posY: 10, rotY: 90, scaleZ: 2 },
      {},
      CTX
    );

    const group = res.geometry as THREE.Group;
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(1);

    const wrapper = group.children[0] as THREE.Group;
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    wrapper.matrix.decompose(pos, quat, scale);

    expect(pos.x).toBe(5);
    expect(pos.y).toBe(10);
    expect(scale.z).toBe(2);
  });

  it("GEOMETRY_TRANSFORM_NODE applies Matrix4 transformation", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const matrix = new THREE.Matrix4().makeTranslation(3, 4, 5);

    const res = GEOMETRY_TRANSFORM_NODE.evaluate(
      { geometry: box, matrix },
      {},
      CTX
    );

    const group = res.geometry as THREE.Group;
    const wrapper = group.children[0] as THREE.Group;
    const pos = new THREE.Vector3();
    wrapper.matrix.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());

    expect(pos.x).toBe(3);
    expect(pos.y).toBe(4);
    expect(pos.z).toBe(5);
  });
});

describe("INSTANCE MANIPULATION NODES", () => {
  it("SET_INSTANCE_COLOR_NODE colors instances individually from a List", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, spacing: 2 }, CTX);

    const colors = [new THREE.Color(0xff0000), new THREE.Color(0x00ff00), new THREE.Color(0x0000ff)];
    const coloredRes = SET_INSTANCE_COLOR_NODE.evaluate(
      { geometry: arrayRes.geometry, colors },
      {},
      CTX
    );

    const group = coloredRes.geometry as THREE.Group;
    expect(group.children.length).toBe(3);

    // Instance 0 (Red)
    const child0Mesh = (group.children[0] as THREE.Group).children[0] as THREE.Mesh;
    const color0 = (child0Mesh.material as THREE.MeshStandardMaterial).color;
    expect(color0.r).toBe(1);
    expect(color0.g).toBe(0);

    // Instance 1 (Green)
    const child1Mesh = (group.children[1] as THREE.Group).children[0] as THREE.Mesh;
    const color1 = (child1Mesh.material as THREE.MeshStandardMaterial).color;
    expect(color1.g).toBe(1);
    expect(color1.r).toBe(0);
  });

  it("SET_INSTANCE_TRANSFORM_NODE applies per-instance position offsets", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 2, spacing: 2 }, CTX);

    const positions = [new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, 10, 0)];
    const transformedRes = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry, positions },
      {},
      CTX
    );

    const group = transformedRes.geometry as THREE.Group;
    expect(group.children.length).toBe(2);
  });

  it("SET_INSTANCE_TRANSFORM_NODE aligns instances to direction vectors (rotationMode = align)", () => {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: disc }, { count: 2, spacing: 0 }, CTX);

    const directions = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)];
    const transformedRes = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry, rotations: directions },
      { rotationMode: "align", alignAxis: "Z" },
      { ...CTX, connectedInputs: new Set(["rotations"]) } as never
    );

    const group = transformedRes.geometry as THREE.Group;
    expect(group.children.length).toBe(2);

    const fwd = new THREE.Vector3(0, 0, 1);
    group.children.forEach((child, i) => {
      const q = new THREE.Quaternion().setFromRotationMatrix((child as THREE.Group).matrix);
      const dir = fwd.clone().applyQuaternion(q).normalize();
      expect(dir.dot(directions[i].clone().normalize())).toBeCloseTo(1, 5);
    });
  });

  it("SET_INSTANCE_TRANSFORM_NODE aligns in world space under an individual pivot", () => {
    // An instance whose *placement* already carries a rotation. Under the
    // individual pivot the delta is applied on the right (placement x delta),
    // i.e. read in the instance's own frame — so a world-space align
    // quaternion dropped in as-is pointed it somewhere else entirely.
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16));
    disc.matrixAutoUpdate = false;
    disc.matrix.makeRotationY(Math.PI / 2);

    const direction = new THREE.Vector3(0, 1, 0);
    const res = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: disc, rotations: [direction] },
      { rotationMode: "align", alignAxis: "Z", pivot: "individual" },
      { ...CTX, connectedInputs: new Set(["rotations"]) } as never
    );

    const group = res.geometry as THREE.Group;
    const child = group.children[0];
    child.updateWorldMatrix(true, false, true);
    const q = new THREE.Quaternion();
    child.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
    expect(dir.dot(direction)).toBeCloseTo(1, 5);
  });

  it("SET_INSTANCE_COLOR_NODE reuses its cloned materials across frames", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, spacing: 1 }, CTX);
    const ctx = { ...CTX, nodeId: "inst-color-cache" };

    const meshesOf = (result: Record<string, unknown>) => {
      const found: THREE.Mesh[] = [];
      (result.geometry as THREE.Group).traverse((o) => {
        if (o instanceof THREE.Mesh) found.push(o);
      });
      return found;
    };
    const materialsOf = (result: Record<string, unknown>) =>
      meshesOf(result).map((mesh) => (mesh.material as THREE.Material).uuid);

    const first = SET_INSTANCE_COLOR_NODE.evaluate(
      { geometry: arrayRes.geometry, colors: [new THREE.Color(0xff0000)] },
      SET_INSTANCE_COLOR_NODE.defaultParams,
      ctx as never,
    );
    const second = SET_INSTANCE_COLOR_NODE.evaluate(
      { geometry: arrayRes.geometry, colors: [new THREE.Color(0x00ff00)] },
      SET_INSTANCE_COLOR_NODE.defaultParams,
      ctx as never,
    );

    // Same material objects, second frame — the node used to allocate a fresh
    // (and never disposed) clone per instance per frame.
    expect(materialsOf(first)).toHaveLength(3);
    expect(materialsOf(second)).toEqual(materialsOf(first));
    const mesh = meshesOf(second)[0];
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x00ff00);
  });

  it("SET_INSTANCE_TRANSFORM_NODE align mode handles the anti-parallel case", () => {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: disc }, { count: 1, spacing: 0 }, CTX);

    const transformedRes = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry, rotations: [new THREE.Vector3(0, 0, -1)] },
      { rotationMode: "align", alignAxis: "Z" },
      { ...CTX, connectedInputs: new Set(["rotations"]) } as never
    );

    const group = transformedRes.geometry as THREE.Group;
    const q = new THREE.Quaternion().setFromRotationMatrix((group.children[0] as THREE.Group).matrix);
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
    expect(dir.dot(new THREE.Vector3(0, 0, -1))).toBeCloseTo(1, 5);
  });

  it("SET_INSTANCE_TRANSFORM_NODE orients every instance toward a wired Target (look-at)", () => {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: disc }, { count: 2, spacing: 0 }, CTX);

    const positions = [new THREE.Vector3(0, 5, 0), new THREE.Vector3(5, 0, 0)];
    const target = new THREE.Vector3(0, 0, 0);
    const transformedRes = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry, positions, target },
      { alignAxis: "Z" },
      { ...CTX, connectedInputs: new Set(["positions", "target"]) } as never
    );

    const group = transformedRes.geometry as THREE.Group;
    expect(group.children.length).toBe(2);
    const fwd = new THREE.Vector3(0, 0, 1);
    const expected = [new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0)];
    group.children.forEach((child, i) => {
      const q = new THREE.Quaternion().setFromRotationMatrix((child as THREE.Group).matrix);
      const dir = fwd.clone().applyQuaternion(q).normalize();
      expect(dir.dot(expected[i])).toBeCloseTo(1, 5);
    });
  });

  it("SET_INSTANCE_TRANSFORM_NODE applies default single scalar X, Y, Z transforms to all instances", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, spacing: 2 }, CTX);

    const transformedRes = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry },
      { posX: 1.5, posY: 3.0, posZ: 4.5, scaleX: 2.0 },
      CTX
    );

    const group = transformedRes.geometry as THREE.Group;
    expect(group.children.length).toBe(3);

    group.children.forEach((child) => {
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      (child as THREE.Group).matrix.decompose(pos, quat, scale);

      expect(pos.x).toBeCloseTo(1.5);
      expect(pos.y).toBeCloseTo(3.0);
      expect(pos.z).toBeCloseTo(4.5);
      expect(scale.x).toBeCloseTo(2.0);
    });
  });

  it("GET_INSTANCE_NODE extracts single instance by index", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 5, spacing: 2 }, CTX);

    const singleRes = GET_INSTANCE_NODE.evaluate(
      { geometry: arrayRes.geometry, index: 2 },
      {},
      CTX
    );

    expect(singleRes.count).toBe(5);
    const group = singleRes.geometry as THREE.Group;
    expect(group.children.length).toBe(1);
  });

  it("SET_INSTANCE_COLOR_NODE colors THREE.Light instances individually from a List", () => {
    const light = new THREE.PointLight(0xffffff, 2.0);
    const arrayRes = ARRAY_NODE.evaluate({ geometry: light }, { count: 2, spacing: 5 }, CTX);

    const colors = [new THREE.Color(0xff0000), new THREE.Color(0x00ff00)];
    const coloredRes = SET_INSTANCE_COLOR_NODE.evaluate(
      { geometry: arrayRes.geometry, colors },
      {},
      CTX
    );

    const group = coloredRes.geometry as THREE.Group;
    expect(group.children.length).toBe(2);

    const light0 = (group.children[0] as THREE.Group).children[0] as THREE.PointLight;
    expect(light0).toBeInstanceOf(THREE.PointLight);
    expect(light0.color.r).toBe(1);
    expect(light0.color.g).toBe(0);

    const light1 = (group.children[1] as THREE.Group).children[0] as THREE.PointLight;
    expect(light1).toBeInstanceOf(THREE.PointLight);
    expect(light1.color.g).toBe(1);
    expect(light1.color.r).toBe(0);
  });

  it("SET_INSTANCE_TRANSFORM_NODE accepts separated posX, posY, posZ, rotX, scaleY lists", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, spacing: 2 }, CTX);

    const posX = [10, 20, 30];
    const posY = [1, 2, 3];
    const scaleY = [0.5, 1.5, 2.5];

    const transformedRes = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry, posX, posY, scaleY },
      {},
      CTX
    );

    const group = transformedRes.geometry as THREE.Group;
    expect(group.children.length).toBe(3);

    const wrapper0 = group.children[0] as THREE.Group;
    const pos0 = new THREE.Vector3();
    const quat0 = new THREE.Quaternion();
    const scale0 = new THREE.Vector3();
    wrapper0.matrix.decompose(pos0, quat0, scale0);

    expect(pos0.x).toBe(10);
    expect(pos0.y).toBe(1);
    expect(scale0.y).toBe(0.5);
  });

  it("SET_INSTANCE_TRANSFORM_NODE transforms only the instance named by the Index input", () => {
    // Arrange — a linear array of 3 boxes at x = 0, 2, 4.
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, spacing: 2 }, CTX);

    // Act — lift the middle one.
    const res = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry, index: 1 },
      { posY: 5 },
      CTX
    );

    // Assert — instance 1 sits in a wrapper carrying the offset, the others
    // come through with their original array matrix untouched.
    const group = res.geometry as THREE.Group;
    expect(group.children.length).toBe(3);

    const positionOf = (child: THREE.Object3D) => {
      const pos = new THREE.Vector3();
      child.matrix.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
      return pos;
    };

    expect(positionOf(group.children[1]).y).toBeCloseTo(5);
    expect(positionOf(group.children[0]).x).toBeCloseTo(0);
    expect(positionOf(group.children[0]).y).toBeCloseTo(0);
    expect(positionOf(group.children[2]).x).toBeCloseTo(4);
    expect(positionOf(group.children[2]).y).toBeCloseTo(0);
  });

  it("SET_INSTANCE_TRANSFORM_NODE targets exactly the instances named by the 1-based ids list", () => {
    // Arrange — a linear array of 4 boxes at x = 0, 2, 4, 6.
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 4, spacing: 2 }, CTX);

    // Act — lift instances 1 and 3 (1-based -> array indices 0 and 2), leave 2 and 4 alone.
    const res = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry, ids: [1, 3] },
      { posY: 5 },
      CTX
    );

    const group = res.geometry as THREE.Group;
    const yOf = (i: number) => {
      const pos = new THREE.Vector3();
      group.children[i].matrix.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
      return pos.y;
    };

    expect(yOf(0)).toBeCloseTo(5);
    expect(yOf(1)).toBeCloseTo(0);
    expect(yOf(2)).toBeCloseTo(5);
    expect(yOf(3)).toBeCloseTo(0);
  });

  it("SET_INSTANCE_TRANSFORM_NODE ids list: each targeted instance still pulls its own list item, not one shared item", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, spacing: 2 }, CTX);

    // Instances 1 and 3 targeted; posY has one entry per instance in the pack
    // (own-index lookup), not one shared entry the way a scalar `index` cycles.
    const res = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry, ids: [1, 3], posY: [10, 20, 30] },
      {},
      CTX
    );

    const group = res.geometry as THREE.Group;
    const yOf = (i: number) => {
      const pos = new THREE.Vector3();
      group.children[i].matrix.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
      return pos.y;
    };

    expect(yOf(0)).toBeCloseTo(10);
    expect(yOf(1)).toBeCloseTo(0); // untargeted — untouched
    expect(yOf(2)).toBeCloseTo(30);
  });

  it("SET_INSTANCE_TRANSFORM_NODE ids list takes priority over a wired scalar Index", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, spacing: 2 }, CTX);

    const res = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry, index: 0, ids: [2] },
      { posY: 5 },
      CTX
    );

    const group = res.geometry as THREE.Group;
    const yOf = (i: number) => {
      const pos = new THREE.Vector3();
      group.children[i].matrix.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
      return pos.y;
    };

    expect(yOf(0)).toBeCloseTo(0); // Index=0 alone would have lifted this one — ids wins instead
    expect(yOf(1)).toBeCloseTo(5);
    expect(yOf(2)).toBeCloseTo(0);
  });

  it("SET_INSTANCE_COLOR_NODE colors only the instance named by the Index input", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, spacing: 2 }, CTX);

    const res = SET_INSTANCE_COLOR_NODE.evaluate(
      { geometry: arrayRes.geometry, color: new THREE.Color(0xff0000), index: 2 },
      {},
      CTX
    );

    const group = res.geometry as THREE.Group;
    const colorOf = (i: number) => {
      const mesh = (group.children[i] as THREE.Group).children[0] as THREE.Mesh;
      return (mesh.material as THREE.MeshStandardMaterial).color;
    };

    expect(colorOf(2).r).toBe(1);
    expect(colorOf(2).g).toBe(0);
    expect(colorOf(0).g).toBe(1);
    expect(colorOf(1).g).toBe(1);
  });

  it("SET_INSTANCE_COLOR_NODE targets exactly the instances named by the 1-based ids list, each pulling its own colour", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, spacing: 2 }, CTX);

    const res = SET_INSTANCE_COLOR_NODE.evaluate(
      {
        geometry: arrayRes.geometry,
        ids: [1, 3],
        colors: [new THREE.Color(0xff0000), new THREE.Color(0x00ff00), new THREE.Color(0x0000ff)],
      },
      {},
      CTX
    );

    const group = res.geometry as THREE.Group;
    const colorOf = (i: number) => {
      const mesh = (group.children[i] as THREE.Group).children[0] as THREE.Mesh;
      return (mesh.material as THREE.MeshStandardMaterial).color;
    };

    expect(colorOf(0).r).toBe(1); // instance 1 -> own colors[0], red
    expect(colorOf(0).g).toBe(0);
    expect(colorOf(1).r).toBe(1); // instance 2 untargeted — default white, untouched
    expect(colorOf(1).g).toBe(1);
    expect(colorOf(1).b).toBe(1);
    expect(colorOf(2).b).toBe(1); // instance 3 -> own colors[2], blue
    expect(colorOf(2).r).toBe(0);
  });

  it("SET_INSTANCE_COLOR_NODE ids list takes priority over a wired scalar Index", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, spacing: 2 }, CTX);

    const res = SET_INSTANCE_COLOR_NODE.evaluate(
      { geometry: arrayRes.geometry, index: 0, ids: [2], color: new THREE.Color(0xff0000) },
      {},
      CTX
    );

    const group = res.geometry as THREE.Group;
    const colorOf = (i: number) => {
      const mesh = (group.children[i] as THREE.Group).children[0] as THREE.Mesh;
      return (mesh.material as THREE.MeshStandardMaterial).color;
    };

    expect(colorOf(0).g).toBe(1); // Index=0 alone would have painted this one — ids wins instead
    expect(colorOf(1).g).toBe(0); // instance 2 (1-based id 2 -> array index 1) painted red
    expect(colorOf(2).g).toBe(1);
  });

  it("SET_INSTANCE_TRANSFORM_NODE targets every instance when Index is -1 or unwired", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, spacing: 2 }, CTX);

    const res = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry },
      { ...SET_INSTANCE_TRANSFORM_NODE.defaultParams, posY: 5 },
      CTX
    );

    const group = res.geometry as THREE.Group;
    group.children.forEach((child) => {
      const pos = new THREE.Vector3();
      child.matrix.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
      expect(pos.y).toBeCloseTo(5);
    });
  });

  it("SET_INSTANCE_TRANSFORM_NODE leaves the pack untouched when Index is past the last instance", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, spacing: 2 }, CTX);

    const res = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry, index: 7 },
      { posY: 5 },
      CTX
    );

    const group = res.geometry as THREE.Group;
    expect(group.children.length).toBe(3);
    group.children.forEach((child) => {
      const pos = new THREE.Vector3();
      child.matrix.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
      expect(pos.y).toBeCloseTo(0);
    });
  });

  it("SET_INSTANCE_TRANSFORM_NODE accepts single scalar inputs when Index is provided", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 4, spacing: 2 }, CTX);

    const res = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry, index: 1, scaleX: 0.2, scaleY: 0.5 },
      {},
      CTX
    );

    const group = res.geometry as THREE.Group;
    expect(group.children.length).toBe(4);

    const scaleOf = (child: THREE.Object3D) => {
      const scale = new THREE.Vector3();
      child.matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      return scale;
    };

    expect(scaleOf(group.children[1]).x).toBeCloseTo(0.2);
    expect(scaleOf(group.children[1]).y).toBeCloseTo(0.5);
    expect(scaleOf(group.children[0]).x).toBeCloseTo(1);
    expect(scaleOf(group.children[2]).x).toBeCloseTo(1);
  });

  it("SET_INSTANCE_TRANSFORM_NODE accepts a single Matrix4 on matrix input", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const arrayRes = ARRAY_NODE.evaluate({ geometry: box }, { count: 3, spacing: 2 }, CTX);
    const customMat = new THREE.Matrix4().makeTranslation(0, 10, 0);

    const res = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: arrayRes.geometry, index: 2, matrix: customMat },
      { mode: "absolute" },
      CTX
    );

    const group = res.geometry as THREE.Group;
    const pos = new THREE.Vector3();
    group.children[2].matrix.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    expect(pos.y).toBeCloseTo(10);
  });
});

describe("COMBINE & SPLIT VECTOR LIST NODES", () => {
  it("COMBINE_VECTOR_LISTS_NODE composes 3 number lists into a list of THREE.Vector3", () => {
    const xList = [1, 2, 3];
    const yList = [10, 20, 30];
    const res = COMBINE_VECTOR_LISTS_NODE.evaluate({ xList, yList }, { zDefault: 5 }, CTX);
    const vecList = res.vectorList as THREE.Vector3[];

    expect(vecList.length).toBe(3);
    expect(vecList[0]).toEqual(new THREE.Vector3(1, 10, 5));
    expect(vecList[1]).toEqual(new THREE.Vector3(2, 20, 5));
    expect(vecList[2]).toEqual(new THREE.Vector3(3, 30, 5));
  });

  it("SPLIT_VECTOR_LIST_NODE decomposes vector list into X, Y, Z lists", () => {
    const vectorList = [new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 5, 6)];
    const res = SPLIT_VECTOR_LIST_NODE.evaluate({ vectorList }, {}, CTX);

    expect(res.xList).toEqual([1, 4]);
    expect(res.yList).toEqual([2, 5]);
    expect(res.zList).toEqual([3, 6]);
  });
});

describe("SET_INSTANCE_TRANSFORM_NODE pivot", () => {
  /** World position of instance `i` in the node's output pack. */
  function worldPositionOf(group: THREE.Object3D, i: number): THREE.Vector3 {
    group.updateMatrixWorld(true);
    const entry = group.children[i];
    // "shared" wraps the clone in a delta group; "individual" folds the
    // delta into the clone itself. Either way the leaf is what's drawn.
    const leaf = entry.children.length > 0 && !(entry as THREE.Mesh).isMesh ? entry.children[0] : entry;
    return new THREE.Vector3().setFromMatrixPosition(leaf.matrixWorld);
  }

  function arrayOfThree() {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    return ARRAY_NODE.evaluate(
      { geometry: plane },
      { mode: "linear", axis: "X", count: 3, spacing: 10 },
      { ...CTX, nodeId: "arr-pivot" },
    ).geometry as THREE.Object3D;
  }

  it("individual pivot spins each instance in place, leaving its position untouched", () => {
    const source = arrayOfThree();
    const before = [0, 1, 2].map((i) => worldPositionOf(source, i));

    const res = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: source },
      { ...SET_INSTANCE_TRANSFORM_NODE.defaultParams, pivot: "individual", rotY: 90 },
      { ...CTX, nodeId: "set-individual" },
    );
    const after = [0, 1, 2].map((i) => worldPositionOf(res.geometry as THREE.Object3D, i));

    for (let i = 0; i < 3; i++) {
      expect(after[i].x).toBeCloseTo(before[i].x);
      expect(after[i].z).toBeCloseTo(before[i].z);
    }
  });

  it("shared pivot swings the whole pack about the source's origin", () => {
    const source = arrayOfThree();
    const before = [0, 1, 2].map((i) => worldPositionOf(source, i));
    // The array runs along X, so a 90° turn about Y should carry the
    // off-centre instances onto Z.
    expect(Math.abs(before[2].x)).toBeGreaterThan(1);

    const res = SET_INSTANCE_TRANSFORM_NODE.evaluate(
      { geometry: source },
      { ...SET_INSTANCE_TRANSFORM_NODE.defaultParams, pivot: "shared", rotY: 90 },
      { ...CTX, nodeId: "set-shared" },
    );
    const after = [0, 1, 2].map((i) => worldPositionOf(res.geometry as THREE.Object3D, i));

    expect(after[2].x).toBeCloseTo(0);
    expect(Math.abs(after[2].z)).toBeCloseTo(Math.abs(before[2].x));
  });

  it("defaults to shared, so graphs saved before the option existed are unchanged", () => {
    expect(SET_INSTANCE_TRANSFORM_NODE.defaultParams.pivot).toBe("shared");
  });
});

describe("GEOMETRY_TRANSFORM_NODE vector inputs", () => {
  const box = () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const worldPos = (res: Record<string, unknown>) => {
    const group = res.geometry as THREE.Group;
    group.updateWorldMatrix(true, true);
    let found = new THREE.Vector3();
    group.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) found = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
    });
    return found;
  };

  it("honours a wired Location vector", () => {
    // Regression: posX/posY/posZ default to 0, and the evaluator fills every
    // unconnected socket from defaultParams — so the axis sockets used to
    // read as "provided" always and silently zeroed any wired Location.
    const res = GEOMETRY_TRANSFORM_NODE.evaluate(
      { geometry: box(), location: new THREE.Vector3(0.5, 1.8, -2), posX: 0, posY: 0, posZ: 0 },
      { ...GEOMETRY_TRANSFORM_NODE.defaultParams },
      { ...CTX, connectedInputs: new Set(["geometry", "location"]) },
    );
    const p = worldPos(res);
    expect([p.x, p.y, p.z]).toEqual([0.5, 1.8, -2]);
  });

  it("lets a wired axis override the wired vector", () => {
    const res = GEOMETRY_TRANSFORM_NODE.evaluate(
      { geometry: box(), location: new THREE.Vector3(0.5, 1.8, -2), posY: 9 },
      { ...GEOMETRY_TRANSFORM_NODE.defaultParams },
      { ...CTX, connectedInputs: new Set(["geometry", "location", "posY"]) },
    );
    const p = worldPos(res);
    expect([p.x, p.y, p.z]).toEqual([0.5, 9, -2]);
  });

  it("still uses the panel's axis numbers when nothing is wired", () => {
    const res = GEOMETRY_TRANSFORM_NODE.evaluate(
      { geometry: box(), posX: 3, posY: 0, posZ: 0 },
      { ...GEOMETRY_TRANSFORM_NODE.defaultParams, posX: 3 },
      { ...CTX, connectedInputs: new Set(["geometry"]) },
    );
    expect(worldPos(res).x).toBe(3);
  });
});
