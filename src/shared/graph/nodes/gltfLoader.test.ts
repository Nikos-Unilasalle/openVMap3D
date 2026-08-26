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

/** A GLB whose header declares `required`, so GLTFLoader must have that decoder wired to get past parse. */
function buildGlbRequiring(required: string, extras: Record<string, unknown>): Uint8Array {
  const json = JSON.stringify({
    asset: { version: "2.0" },
    extensionsRequired: [required],
    extensionsUsed: [required],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: 4 }],
    ...extras,
  });
  const jsonBytes = new TextEncoder().encode(json);
  const jsonPadded = (jsonBytes.length + 3) & ~3;
  const binBytes = new Uint8Array(4);
  const binPadded = 4;
  const totalLength = 12 + 8 + jsonPadded + 8 + binPadded;
  const buf = new ArrayBuffer(totalLength);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let offset = 0;
  view.setUint32(offset, 0x46546c67, true); offset += 4;
  view.setUint32(offset, 2, true); offset += 4;
  view.setUint32(offset, totalLength, true); offset += 4;
  view.setUint32(offset, jsonPadded, true); offset += 4;
  view.setUint32(offset, 0x4e4f534a, true); offset += 4;
  bytes.set(jsonBytes, offset);
  for (let i = jsonBytes.length; i < jsonPadded; i++) bytes[offset + i] = 0x20;
  offset += jsonPadded;
  view.setUint32(offset, binPadded, true); offset += 4;
  view.setUint32(offset, 0x004e4942, true); offset += 4;
  bytes.set(binBytes, offset);
  return bytes;
}

const DRACO_GLB = () => buildGlbRequiring("KHR_draco_mesh_compression", {
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, extensions: { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } } } }] }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
  accessors: [{ componentType: 5126, count: 1, type: "VEC3" }],
});

const MESHOPT_GLB = () => buildGlbRequiring("EXT_meshopt_compression", {
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4, extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: 0, byteLength: 4, count: 1, byteStride: 4, mode: "ATTRIBUTES" } } }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: "VEC3" }],
});

function fieldsOf(nodeId: string) {
  const node: NodeInstance = { id: nodeId, type: "object/gltf", params: OBJECT_GLTF_NODE.defaultParams, position: { x: 0, y: 0 } };
  return OBJECT_GLTF_NODE.dynamicParamFields?.(node) ?? [];
}

function fileFieldOf(nodeId: string) {
  return fieldsOf(nodeId).find((f) => f.id === "filePath") as any;
}

/** The warn note the panel shows when a pick failed, or undefined when it didn't. */
function errorNoteOf(nodeId: string): string | undefined {
  return fieldsOf(nodeId).find((f) => f.id === "loadError")?.label;
}

describe("OBJECT_GLTF_NODE compressed-glTF support", () => {
  it("gets a Draco file past parse instead of throwing out of it", () => {
    // Draco rejects at parse() *synchronously* when no decoder is wired, which
    // is what made this failure look like "nothing happened" before.
    const field = fileFieldOf("gltf-draco");
    expect(() => field.onLoaded("gltf-draco", "d.glb", DRACO_GLB())).not.toThrow();

    expect(errorNoteOf("gltf-draco")).toBeUndefined();
  });

  it("gets a meshopt file past parse instead of erroring on a missing decoder", () => {
    const field = fileFieldOf("gltf-meshopt");
    field.onLoaded("gltf-meshopt", "m.glb", MESHOPT_GLB());
    expect(errorNoteOf("gltf-meshopt")).toBeUndefined();
  });

  it("surfaces a failure as a readable note, not just a console line", () => {
    const field = fileFieldOf("gltf-broken");
    field.onLoaded("gltf-broken", "broken.glb", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));

    const note = errorNoteOf("gltf-broken");
    expect(note).toMatch(/⚠/);
    // The raw message survives: an unanticipated cause is the one worth
    // reading word for word, and a label would have clipped it.
    expect((note ?? "").length).toBeGreaterThan(20);
    expect(fieldsOf("gltf-broken").find((f) => f.id === "loadError")?.kind).toBe("note");
  });

  it("clears a previous error once a good file loads", async () => {
    fileFieldOf("gltf-recover").onLoaded("gltf-recover", "broken.glb", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(errorNoteOf("gltf-recover")).toMatch(/⚠/);

    fileFieldOf("gltf-recover").onLoaded("gltf-recover", "triangle.glb", buildTriangleGlb());
    await vi.waitFor(() => {
      expect(errorNoteOf("gltf-recover")).toBeUndefined();
    });
  });
});

describe("OBJECT_GLTF_NODE malformed-file diagnostics", () => {
  it("names the shortfall when a .glb header declares more bytes than arrived", () => {
    // A real, valid GLB with its tail cut off — the truncated-download case.
    const full = buildTriangleGlb();
    const truncated = full.slice(0, full.length - 20);

    fileFieldOf("gltf-truncated").onLoaded("gltf-truncated", "cut.glb", truncated);

    const note = errorNoteOf("gltf-truncated") ?? "";
    expect(note).toMatch(/truncated/i);
    // The actual numbers, not just "something went wrong".
    expect(note).toContain(String(truncated.length));
    expect(note).toContain(full.length.toLocaleString());
    // Never the raw engine wording, which is what sent us round in circles.
    expect(note).not.toMatch(/Length out of range/i);
  });

  it("names the shortfall when a chunk overruns the file", () => {
    const glb = buildTriangleGlb();
    // Keep the declared total honest, but blow up the JSON chunk's length so
    // the chunk table itself is what overruns.
    new DataView(glb.buffer, glb.byteOffset).setUint32(12, 0xffff, true);

    fileFieldOf("gltf-badchunk").onLoaded("gltf-badchunk", "bad.glb", glb);
    expect(errorNoteOf("gltf-badchunk") ?? "").toMatch(/chunk at byte .* runs past the end/i);
  });

  it("calls a near-empty file too short rather than blaming its contents", () => {
    fileFieldOf("gltf-tiny").onLoaded("gltf-tiny", "tiny.glb", new Uint8Array(3));
    expect(errorNoteOf("gltf-tiny") ?? "").toMatch(/only 3 bytes/i);
  });

  it("leaves a well-formed .glb alone", () => {
    fileFieldOf("gltf-intact").onLoaded("gltf-intact", "ok.glb", buildTriangleGlb());
    expect(errorNoteOf("gltf-intact")).toBeUndefined();
  });
});

describe("OBJECT_GLTF_NODE glTF-level buffer diagnostics", () => {
  /** A GLB whose container is perfectly valid but whose JSON overreaches its BIN chunk. */
  function buildGlbWithJson(gltfJson: object, binLength: number): Uint8Array {
    const jsonBytes = new TextEncoder().encode(JSON.stringify(gltfJson));
    const jsonPadded = (jsonBytes.length + 3) & ~3;
    const binPadded = (binLength + 3) & ~3;
    const totalLength = 12 + 8 + jsonPadded + 8 + binPadded;
    const buf = new ArrayBuffer(totalLength);
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);
    let offset = 0;
    view.setUint32(offset, 0x46546c67, true); offset += 4;
    view.setUint32(offset, 2, true); offset += 4;
    view.setUint32(offset, totalLength, true); offset += 4;
    view.setUint32(offset, jsonPadded, true); offset += 4;
    view.setUint32(offset, 0x4e4f534a, true); offset += 4;
    bytes.set(jsonBytes, offset);
    for (let i = jsonBytes.length; i < jsonPadded; i++) bytes[offset + i] = 0x20;
    offset += jsonPadded;
    view.setUint32(offset, binPadded, true); offset += 4;
    view.setUint32(offset, 0x004e4942, true); offset += 4;
    return bytes;
  }

  it("names the bufferView that reads past the end of the binary chunk", () => {
    // Container is intact — only the glTF-level numbers disagree, which is the
    // case the container check alone reported as clean.
    const glb = buildGlbWithJson({
      asset: { version: "2.0" },
      scene: 0, scenes: [{ nodes: [] }],
      buffers: [{ byteLength: 64 }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 32 },
        { buffer: 0, byteOffset: 32, byteLength: 9999 },
      ],
    }, 64);

    fileFieldOf("gltf-badview").onLoaded("gltf-badview", "bad.glb", glb);

    const note = errorNoteOf("gltf-badview") ?? "";
    expect(note).toMatch(/bufferView #1/);
    expect(note).toMatch(/corrupt/i);
    expect(note).not.toMatch(/Length out of range/i);
  });

  it("reports a binary buffer smaller than the JSON claims", () => {
    const glb = buildGlbWithJson({
      asset: { version: "2.0" },
      scene: 0, scenes: [{ nodes: [] }],
      buffers: [{ byteLength: 4096 }],
      bufferViews: [],
    }, 64);

    fileFieldOf("gltf-shortbin").onLoaded("gltf-shortbin", "short.glb", glb);
    expect(errorNoteOf("gltf-shortbin") ?? "").toMatch(/binary buffer is 4,096 bytes, but the file only carries 64/);
  });

  it("does not flag a uri-backed buffer it cannot see", () => {
    const glb = buildGlbWithJson({
      asset: { version: "2.0" },
      scene: 0, scenes: [{ nodes: [] }],
      buffers: [{ byteLength: 999999, uri: "data:application/octet-stream;base64,AAAA" }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 999999 }],
    }, 64);

    fileFieldOf("gltf-uribuf").onLoaded("gltf-uribuf", "uri.glb", glb);
    expect(errorNoteOf("gltf-uribuf") ?? "").not.toMatch(/corrupt|incomplete/i);
  });

  it("still leaves a well-formed .glb alone", () => {
    fileFieldOf("gltf-intact2").onLoaded("gltf-intact2", "ok.glb", buildTriangleGlb());
    expect(errorNoteOf("gltf-intact2")).toBeUndefined();
  });
});
