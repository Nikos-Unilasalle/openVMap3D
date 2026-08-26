import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext, NodeInstance } from "../types";
import { OBJECT_PLY_NODE, decimateGeometry } from "./plyLoader";
import { evaluateGraph } from "../evaluate";
import { DEFAULT_REGISTRY } from "./index";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "ply-test-1" };
const DUMMY_NODE: NodeInstance = { id: "ply-test-1", type: "object/ply_point_cloud", params: OBJECT_PLY_NODE.defaultParams, position: { x: 0, y: 0 } };

// Two colored vertices, binary little-endian PLY — the format an actual
// large point-cloud export uses (ASCII would just be slower to parse, not a
// different code path).
function buildTwoPointPly(): Uint8Array {
  const header =
    "ply\n" +
    "format binary_little_endian 1.0\n" +
    "element vertex 2\n" +
    "property float x\n" +
    "property float y\n" +
    "property float z\n" +
    "property uchar red\n" +
    "property uchar green\n" +
    "property uchar blue\n" +
    "end_header\n";
  const headerBytes = new TextEncoder().encode(header);

  const body = new ArrayBuffer(2 * 15);
  const view = new DataView(body);
  // vertex 0: (0,0,0) red
  view.setFloat32(0, 0, true);
  view.setFloat32(4, 0, true);
  view.setFloat32(8, 0, true);
  view.setUint8(12, 255);
  view.setUint8(13, 0);
  view.setUint8(14, 0);
  // vertex 1: (1,2,3) green
  view.setFloat32(15, 1, true);
  view.setFloat32(19, 2, true);
  view.setFloat32(23, 3, true);
  view.setUint8(27, 0);
  view.setUint8(28, 255);
  view.setUint8(29, 0);

  const out = new Uint8Array(headerBytes.length + body.byteLength);
  out.set(headerBytes, 0);
  out.set(new Uint8Array(body), headerBytes.length);
  return out;
}

describe("OBJECT_PLY_NODE", () => {
  it("evaluates an empty Points object when no file is loaded", () => {
    const res = OBJECT_PLY_NODE.evaluate({}, OBJECT_PLY_NODE.defaultParams, CTX);
    const points = res.geometry as THREE.Points;
    expect(points).toBeInstanceOf(THREE.Points);
    expect(points.geometry.getAttribute("position")).toBeUndefined();
  });

  it("parses a binary PLY's positions and per-vertex color via onLoaded", () => {
    const fields = OBJECT_PLY_NODE.dynamicParamFields?.(DUMMY_NODE) ?? [];
    const fileFieldDef = fields.find((f) => f.id === "filePath") as any;
    expect(fileFieldDef).toBeDefined();

    fileFieldDef?.onLoaded?.("ply-test-1", "cloud.ply", buildTwoPointPly());

    // autoCenter off — this test checks raw parse correctness; centering has
    // its own dedicated test below.
    const res = OBJECT_PLY_NODE.evaluate({}, { ...OBJECT_PLY_NODE.defaultParams, autoCenter: 0 }, CTX);
    const points = res.geometry as THREE.Points;
    const position = points.geometry.getAttribute("position");
    const color = points.geometry.getAttribute("color");

    expect(position.count).toBe(2);
    expect(position.getX(1)).toBeCloseTo(1);
    expect(position.getY(1)).toBeCloseTo(2);
    expect(position.getZ(1)).toBeCloseTo(3);

    expect(color).toBeDefined();
    expect(color.getX(0)).toBeCloseTo(1); // red vertex, normalized 255 -> 1.0
    expect(color.getY(0)).toBeCloseTo(0);

    const material = points.material as THREE.PointsMaterial;
    expect(material.vertexColors).toBe(true);
    // PointsMaterial multiplies vertex colors BY material.color — anything
    // but white here tints every real per-vertex color.
    expect(material.color.getHex()).toBe(0xffffff);
  });

  it("resets material.color to white once real vertex colors load — regression for the green/blue tint bug", () => {
    // The bug: evaluate() only ever touched material.color in the
    // no-vertex-colors branch (to apply the Fallback Color param), so
    // loading a file WITH colors left material.color at whatever it was
    // set to before — e.g. the default Fallback Color (0x38bdf8, a light
    // blue) from an evaluate() that ran before any file was loaded.
    // PointsMaterial multiplies vertex colors by material.color, so every
    // real color got tinted through a low-red/high-blue-green multiplier —
    // reading as "the whole cloud is green/blue" regardless of its actual
    // per-vertex colors.
    const nodeId = "ply-test-tint";
    const node: NodeInstance = { id: nodeId, type: "object/ply_point_cloud", params: OBJECT_PLY_NODE.defaultParams, position: { x: 0, y: 0 } };
    const ctx: EvalContext = { time: 0, step: 0, nodeId };

    // Evaluate once with no file loaded yet — this is what set material.color
    // to the (non-white) Fallback Color default in the original bug.
    OBJECT_PLY_NODE.evaluate({}, OBJECT_PLY_NODE.defaultParams, ctx);

    const fields = OBJECT_PLY_NODE.dynamicParamFields?.(node) ?? [];
    const fileFieldDef = fields.find((f) => f.id === "filePath") as any;
    fileFieldDef?.onLoaded?.(nodeId, "cloud.ply", buildTwoPointPly());

    const res = OBJECT_PLY_NODE.evaluate({}, OBJECT_PLY_NODE.defaultParams, ctx);
    const material = (res.geometry as THREE.Points).material as THREE.PointsMaterial;
    expect(material.color.getHex()).toBe(0xffffff);
  });

  it("auto-centers raw survey-scale coordinates on origin by default, and can be turned off", () => {
    // Positions offset far from the origin, as a real LiDAR/photogrammetry
    // export in absolute survey coordinates would be — this is the actual
    // "viewport looks empty" bug: the cloud loads fine but sits thousands of
    // units away from where the camera starts framed.
    const header =
      "ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nend_header\n" +
      "500000 4000000 100\n" +
      "500002 4000004 104\n";
    const bytes = new TextEncoder().encode(header);

    const fields = OBJECT_PLY_NODE.dynamicParamFields?.(DUMMY_NODE) ?? [];
    const fileFieldDef = fields.find((f) => f.id === "filePath") as any;
    fileFieldDef?.onLoaded?.("ply-test-center", "survey.ply", bytes);

    const centered = OBJECT_PLY_NODE.evaluate({}, OBJECT_PLY_NODE.defaultParams, { ...CTX, nodeId: "ply-test-center" });
    const centeredPos = (centered.geometry as THREE.Points).geometry.getAttribute("position");
    // Centroid of (500000,4000000,100) and (500002,4000004,104) is
    // (500001,4000002,102) — after recentering, points sit at +/-(1,2,2).
    expect(centeredPos.getX(0)).toBeCloseTo(-1);
    expect(centeredPos.getY(0)).toBeCloseTo(-2);

    const uncentered = OBJECT_PLY_NODE.evaluate(
      {},
      { ...OBJECT_PLY_NODE.defaultParams, autoCenter: 0 },
      { ...CTX, nodeId: "ply-test-center" },
    );
    const rawPos = (uncentered.geometry as THREE.Points).geometry.getAttribute("position");
    expect(rawPos.getX(0)).toBeCloseTo(500000);
    expect(rawPos.getY(0)).toBeCloseTo(4000000);
  });

  it("decimateGeometry leaves a cloud under the cap untouched", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 1]), 3));
    const result = decimateGeometry(geometry, 10);
    expect(result).toBe(geometry);
    expect(result.getAttribute("position").count).toBe(2);
  });

  it("decimateGeometry stride-subsamples position AND color together when a cloud exceeds the cap", () => {
    const count = 100;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = i; // index encoded in x, so we can verify stride alignment below
      colors[i * 3] = i / count; // matching value in color's red channel
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const result = decimateGeometry(geometry, 10);
    expect(result).not.toBe(geometry);
    const pos = result.getAttribute("position");
    const col = result.getAttribute("color");
    expect(pos.count).toBeLessThanOrEqual(10);
    expect(pos.count).toBeGreaterThan(0);
    // Every kept point's color must still correspond to the SAME original
    // vertex as its position (stride applied consistently across attributes,
    // not decimated independently — which would decouple color from shape).
    for (let i = 0; i < pos.count; i++) {
      const originalIndex = pos.getX(i);
      expect(col.getX(i)).toBeCloseTo(originalIndex / count);
    }
  });

  it("Visible param actually hides the object, end-to-end (evaluateGraph's generic visibility gate)", () => {
    const graph = {
      nodes: [{ id: "ply-1", type: "object/ply_point_cloud", position: { x: 0, y: 0 }, params: { ...OBJECT_PLY_NODE.defaultParams, visible: 0 } }],
      connections: [],
    };
    const results = evaluateGraph(graph, DEFAULT_REGISTRY, { time: 0, step: 0, nodeId: "root" });
    const obj = results.get("ply-1")?.geometry as THREE.Object3D;
    expect(obj).toBeInstanceOf(THREE.Object3D);
    expect(obj.visible).toBe(false);
  });
});
