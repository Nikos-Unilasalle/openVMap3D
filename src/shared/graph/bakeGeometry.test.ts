import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { bakeMeshesToGeometry, geometryToFrozenData } from "./bakeGeometry";
import { freezeObjectToGeometryData, OBJECT_FROZEN_NODE } from "./nodes/frozenGeometry";
import { OBJECT_BOX_NODE } from "./nodes/object";
import { ARRAY_NODE } from "./nodes/array";
import { EDIT_MESH_POINTS_NODE } from "./nodes/editMeshPoints";
import { EvalContext } from "./types";
import { serializeProject, deserializeProject } from "./storage";
import { DEFAULT_REGISTRY } from "./nodes";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "" };

function boxAt(x: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeTranslation(x, 0, 0);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe("bakeMeshesToGeometry", () => {
  it("bakes world position in, so the parts land where they were placed", () => {
    const merged = bakeMeshesToGeometry([boxAt(0), boxAt(6)])!;
    merged.computeBoundingBox();
    // Two unit boxes six apart span -0.5..6.5 — proof the matrices were
    // applied rather than both parts sitting at the origin.
    expect(merged.boundingBox!.min.x).toBeCloseTo(-0.5, 4);
    expect(merged.boundingBox!.max.x).toBeCloseTo(6.5, 4);
  });

  it("merges parts whose attribute sets differ, instead of refusing them", () => {
    const bare = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    bare.geometry.deleteAttribute("uv");
    bare.updateMatrixWorld(true);
    const merged = bakeMeshesToGeometry([bare, boxAt(3)]);
    expect(merged).not.toBeNull();
    expect(merged!.getAttribute("uv")).toBeTruthy();
  });

  it("returns null for nothing to bake, rather than an empty geometry", () => {
    expect(bakeMeshesToGeometry([])).toBeNull();
  });
});

describe("geometryToFrozenData", () => {
  it("hands back plain arrays, not typed ones", () => {
    // Params are saved with JSON.parse(JSON.stringify(...)), and a
    // Float32Array serializes to an object keyed by index — {"0": 1, "1": 2} —
    // which reloads as something no attribute constructor accepts.
    const data = geometryToFrozenData(new THREE.BoxGeometry(1, 1, 1));
    expect(Array.isArray(data.positions)).toBe(true);
    expect(Array.isArray(data.normals)).toBe(true);
    expect(Array.isArray(data.uvs)).toBe(true);
    expect(data.positions.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(data.positions))).toEqual(data.positions);
  });
});

describe("freezeObjectToGeometryData", () => {
  it("freezes every instance of an Array into one mesh's worth of data", () => {
    const box = OBJECT_BOX_NODE.evaluate({}, OBJECT_BOX_NODE.defaultParams, { ...CTX, nodeId: "src" });
    const arr = ARRAY_NODE.evaluate(
      { geometry: box.geometry },
      { ...ARRAY_NODE.defaultParams, mode: "linear", axis: "X", count: 5, spacing: 2, visible: 1 },
      { ...CTX, nodeId: "arr" },
    );
    const data = freezeObjectToGeometryData(arr.geometry as THREE.Object3D)!;
    const oneBox = (box.geometry as THREE.Mesh).geometry.getAttribute("position").count;
    // All five, not just the first — the bug this whole path exists to avoid.
    expect(data.positions.length / 3).toBe(oneBox * 5);
  });

  it("returns null for a point cloud, which has no faces to bake", () => {
    const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    expect(freezeObjectToGeometryData(points)).toBeNull();
  });

  it("captures the pose, so a frozen copy sits where the original was", () => {
    const moved = OBJECT_BOX_NODE.evaluate(
      {},
      { ...OBJECT_BOX_NODE.defaultParams, location: new THREE.Vector3(4, 1, 0) },
      { ...CTX, nodeId: "moved" },
    );
    const data = freezeObjectToGeometryData(moved.geometry as THREE.Object3D)!;
    let minX = Infinity;
    for (let i = 0; i < data.positions.length; i += 3) minX = Math.min(minX, data.positions[i]);
    expect(minX).toBeCloseTo(3.5, 3);
  });
});

describe("a frozen node", () => {
  function frozenFrom(source: THREE.Object3D) {
    const data = freezeObjectToGeometryData(source)!;
    return { ...OBJECT_FROZEN_NODE.defaultParams, ...data } as Record<string, unknown>;
  }

  it("rebuilds a real Mesh from its stored arrays", () => {
    const box = OBJECT_BOX_NODE.evaluate({}, OBJECT_BOX_NODE.defaultParams, { ...CTX, nodeId: "b1" });
    const params = frozenFrom(box.geometry as THREE.Object3D);
    const res = OBJECT_FROZEN_NODE.evaluate({}, params, { ...CTX, nodeId: "frozen1" });
    const mesh = res.geometry as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.geometry.getAttribute("position").count).toBeGreaterThan(0);
  });

  it("is editable — Edit Mesh Points accepts it", () => {
    const box = OBJECT_BOX_NODE.evaluate({}, OBJECT_BOX_NODE.defaultParams, { ...CTX, nodeId: "b2" });
    const frozen = OBJECT_FROZEN_NODE.evaluate({}, frozenFrom(box.geometry as THREE.Object3D), { ...CTX, nodeId: "frozen2" });
    const edited = EDIT_MESH_POINTS_NODE.evaluate(
      { basis: frozen.geometry },
      { ...EDIT_MESH_POINTS_NODE.defaultParams },
      { ...CTX, nodeId: "edit" },
    );
    expect((edited.geometry as THREE.Mesh).geometry.getAttribute("position").count).toBeGreaterThan(0);
  });

  it("survives a save/reload round trip through the .tsuji", () => {
    // The whole reason the geometry is stored as params rather than a live
    // object: it has to come back from a file byte for byte.
    const box = OBJECT_BOX_NODE.evaluate({}, OBJECT_BOX_NODE.defaultParams, { ...CTX, nodeId: "b3" });
    const params = frozenFrom(box.geometry as THREE.Object3D);
    const project = {
      canvases: [
        { nodes: [{ id: "f", type: OBJECT_FROZEN_NODE.type, position: { x: 0, y: 0 }, params }], connections: [], keyframes: {}, markers: [], exposedParams: [] },
      ],
      activeCanvas: 0,
    };
    const reloaded = deserializeProject(serializeProject(project as never), DEFAULT_REGISTRY);
    const back = reloaded.canvases[0].nodes[0].params as Record<string, unknown>;
    expect(back.positions).toEqual(params.positions);
    expect(back.index).toEqual(params.index);

    const res = OBJECT_FROZEN_NODE.evaluate({}, back, { ...CTX, nodeId: "frozen3" });
    expect((res.geometry as THREE.Mesh).geometry.getAttribute("position").count).toBe(
      (params.positions as number[]).length / 3,
    );
  });
});
