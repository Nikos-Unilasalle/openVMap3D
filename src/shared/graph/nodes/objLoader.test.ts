import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext, NodeInstance } from "../types";
import { OBJECT_OBJ_NODE } from "./objLoader";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "obj-test-1" };
const DUMMY_NODE: NodeInstance = { id: "obj-test-1", type: "object/obj", params: OBJECT_OBJ_NODE.defaultParams, position: { x: 0, y: 0 } };

const SAMPLE_CUBE_OBJ = `
v -0.5 -0.5  0.5
v  0.5 -0.5  0.5
v  0.5  0.5  0.5
v -0.5  0.5  0.5
vt 0.0 0.0
vt 1.0 0.0
vt 1.0 1.0
vt 0.0 1.0
f 1/1 2/2 3/3
f 1/1 3/3 4/4
`;

describe("OBJECT_OBJ_NODE", () => {
  it("evaluates fallback mesh when no path is provided", () => {
    const res = OBJECT_OBJ_NODE.evaluate({}, OBJECT_OBJ_NODE.defaultParams, CTX);
    const group = res.geometry as THREE.Group;
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBeGreaterThan(0);
  });

  it("parses valid OBJ string content via onLoaded callback", () => {
    const fields = OBJECT_OBJ_NODE.dynamicParamFields?.(DUMMY_NODE) ?? [];
    const fileFieldDef = fields.find((f) => f.id === "filePath") as any;
    expect(fileFieldDef).toBeDefined();

    // Trigger onLoaded with sample OBJ text
    fileFieldDef?.onLoaded?.("obj-test-1", "cube.obj", SAMPLE_CUBE_OBJ);

    const res = OBJECT_OBJ_NODE.evaluate({}, OBJECT_OBJ_NODE.defaultParams, CTX);
    const group = res.geometry as THREE.Group;
    expect(group.children.length).toBe(1);

    const parsedGroup = group.children[0] as THREE.Group;
    expect(parsedGroup).toBeInstanceOf(THREE.Group);
    expect(parsedGroup.children.length).toBeGreaterThan(0);

    const mesh = parsedGroup.children[0] as THREE.Mesh;
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
  });

  it("applies connected diffuse and normal texture maps", () => {
    const diffTex = new THREE.Texture();
    diffTex.image = { width: 100, height: 100 };
    const normTex = new THREE.Texture();
    normTex.image = { width: 100, height: 100 };

    const res = OBJECT_OBJ_NODE.evaluate(
      { diffuse: diffTex, normal: normTex },
      OBJECT_OBJ_NODE.defaultParams,
      { ...CTX, nodeId: "obj-test-diff-norm" }
    );

    const group = res.geometry as THREE.Group;
    const mesh = group.children[0] as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;

    expect(mat.map).toBe(diffTex);
    expect(mat.normalMap).toBe(normTex);
  });
});
