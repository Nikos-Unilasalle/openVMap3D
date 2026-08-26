import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { EvalContext, NodeInstance } from "../types";
import { OBJECT_GLTF_NODE } from "./gltfLoader";
import { evaluateGraph } from "../evaluate";
import { DEFAULT_REGISTRY } from "./index";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "gltf-test-1" };
const DUMMY_NODE: NodeInstance = { id: "gltf-test-1", type: "object/gltf", params: OBJECT_GLTF_NODE.defaultParams, position: { x: 0, y: 0 } };

// Khronos' minimal "Triangle" sample, built as a GLB (binary) blob rather
// than a .gltf JSON with a data-URI buffer: a data-URI buffer still goes
// through GLTFLoader's FileLoader, which dispatches `new ProgressEvent(...)`
// — undefined in this suite's Node test environment (no DOM). A GLB's binary
// chunk is read directly off the parsed ArrayBuffer with no FileLoader
// involved, matching how an actual .glb file loads through this node.
function buildTriangleGlb(): Uint8Array {
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: "VEC3", max: [1, 1, 0], min: [0, 0, 0] },
    ],
  });
  const jsonBytes = new TextEncoder().encode(json);
  const jsonPadded = (jsonBytes.length + 3) & ~3;

  const bin = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const binBytes = new Uint8Array(bin.buffer);
  const binPadded = (binBytes.length + 3) & ~3;

  const totalLength = 12 + 8 + jsonPadded + 8 + binPadded;
  const buf = new ArrayBuffer(totalLength);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let offset = 0;

  view.setUint32(offset, 0x46546c67, true); offset += 4; // magic 'glTF'
  view.setUint32(offset, 2, true); offset += 4; // version
  view.setUint32(offset, totalLength, true); offset += 4;

  view.setUint32(offset, jsonPadded, true); offset += 4;
  view.setUint32(offset, 0x4e4f534a, true); offset += 4; // 'JSON'
  bytes.set(jsonBytes, offset);
  for (let i = jsonBytes.length; i < jsonPadded; i++) bytes[offset + i] = 0x20; // space-pad
  offset += jsonPadded;

  view.setUint32(offset, binPadded, true); offset += 4;
  view.setUint32(offset, 0x004e4942, true); offset += 4; // 'BIN\0'
  bytes.set(binBytes, offset);
  offset += binPadded;

  return bytes;
}

describe("OBJECT_GLTF_NODE", () => {
  it("evaluates fallback mesh when no path is provided", () => {
    const res = OBJECT_GLTF_NODE.evaluate({}, OBJECT_GLTF_NODE.defaultParams, CTX);
    const group = res.geometry as THREE.Group;
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBeGreaterThan(0);
  });

  it("parses a valid .glb binary via onLoaded callback", async () => {
    const fields = OBJECT_GLTF_NODE.dynamicParamFields?.(DUMMY_NODE) ?? [];
    const fileFieldDef = fields.find((f) => f.id === "filePath") as any;
    expect(fileFieldDef).toBeDefined();

    fileFieldDef?.onLoaded?.("gltf-test-1", "triangle.glb", buildTriangleGlb());

    await vi.waitFor(() => {
      const res = OBJECT_GLTF_NODE.evaluate({}, OBJECT_GLTF_NODE.defaultParams, CTX);
      const group = res.geometry as THREE.Group;
      expect(group.children.length).toBe(1);
    });

    const res = OBJECT_GLTF_NODE.evaluate({}, OBJECT_GLTF_NODE.defaultParams, CTX);
    const group = res.geometry as THREE.Group;
    const scene = group.children[0] as THREE.Group;
    expect(scene).toBeInstanceOf(THREE.Object3D);

    let mesh: THREE.Mesh | null = null;
    scene.traverse((c) => {
      if (c instanceof THREE.Mesh) mesh = c;
    });
    expect(mesh).not.toBeNull();
    expect((mesh as unknown as THREE.Mesh).castShadow).toBe(true);
  });

  it("Visible param actually hides the object, end-to-end (evaluateGraph's generic visibility gate)", () => {
    const graph = {
      nodes: [{ id: "gltf-1", type: "object/gltf", position: { x: 0, y: 0 }, params: { ...OBJECT_GLTF_NODE.defaultParams, visible: 0 } }],
      connections: [],
    };
    const results = evaluateGraph(graph, DEFAULT_REGISTRY, { time: 0, step: 0, nodeId: "root" });
    const obj = results.get("gltf-1")?.geometry as THREE.Object3D;
    expect(obj).toBeInstanceOf(THREE.Object3D);
    expect(obj.visible).toBe(false);
  });
});
