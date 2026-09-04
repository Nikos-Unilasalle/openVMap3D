import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { evaluateGraph } from "./evaluate";
import { DEFAULT_REGISTRY } from "./nodes/index";
import { Graph } from "./types";

describe("disconnect behavior test", () => {
  it("tests disconnecting material from a box", () => {
    // 1. Box connected to a material node
    const graphWithMat: Graph = {
      nodes: [
        { id: "box_1", type: "object/box", params: { color: new THREE.Color(0xffffff) }, position: { x: 0, y: 0 } },
        { id: "mat_1", type: "material/standard", params: { color: new THREE.Color(0xff0000) }, position: { x: 0, y: 0 } },
      ],
      connections: [
        { id: "c1", fromNode: "mat_1", fromSocket: "material", toNode: "box_1", toSocket: "material" },
      ],
    };

    const ctx = { time: 0, step: 0, nodeId: "" } as any;
    const res1 = evaluateGraph(graphWithMat, DEFAULT_REGISTRY, ctx);
    const boxMesh1 = res1.get("box_1")?.geometry as THREE.Mesh;
    const mat1 = boxMesh1.material as THREE.MeshStandardMaterial;
    expect(mat1.color.getHexString()).toBe("ff0000");

    // 2. Disconnect the material node
    const graphDisconnected: Graph = {
      nodes: [
        { id: "box_1", type: "object/box", params: { color: new THREE.Color(0xffffff) }, position: { x: 0, y: 0 } },
        { id: "mat_1", type: "material/standard", params: { color: new THREE.Color(0xff0000) }, position: { x: 0, y: 0 } },
      ],
      connections: [],
    };

    const res2 = evaluateGraph(graphDisconnected, DEFAULT_REGISTRY, ctx);
    const boxMesh2 = res2.get("box_1")?.geometry as THREE.Mesh;
    const mat2 = boxMesh2.material as THREE.MeshStandardMaterial;
    expect(mat2.color.getHexString()).toBe("ffffff");

    // 3. What about custom material (e.g. iridescent or hologram)?
    const graphWithShaderMat: Graph = {
      nodes: [
        { id: "box_1", type: "object/box", params: { color: new THREE.Color(0xffffff) }, position: { x: 0, y: 0 } },
        { id: "holo_1", type: "material/hologram", params: {}, position: { x: 0, y: 0 } },
      ],
      connections: [
        { id: "c2", fromNode: "holo_1", fromSocket: "material", toNode: "box_1", toSocket: "material" },
      ],
    };
    const res3 = evaluateGraph(graphWithShaderMat, DEFAULT_REGISTRY, ctx);
    const boxMesh3 = res3.get("box_1")?.geometry as THREE.Mesh;
    expect(boxMesh3.material).toBeInstanceOf(THREE.ShaderMaterial);

    // Now disconnect hologram -> reverts cleanly to MeshStandardMaterial with default white color!
    const res4 = evaluateGraph(graphDisconnected, DEFAULT_REGISTRY, ctx);
    const boxMesh4 = res4.get("box_1")?.geometry as THREE.Mesh;
    expect(boxMesh4.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((boxMesh4.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("ffffff");
  });

  it("tests disconnecting compose matrix from grease pencil", () => {
    const graphWithMatrix: Graph = {
      nodes: [
        { id: "comp_1", type: "transform", params: { location: new THREE.Vector3(10, 20, 30) }, position: { x: 0, y: 0 } },
        { id: "gp_1", type: "curve/grease-pencil", params: { location: new THREE.Vector3(0, 0, 0) }, position: { x: 0, y: 0 } },
      ],
      connections: [
        { id: "c1", fromNode: "comp_1", fromSocket: "matrix", toNode: "gp_1", toSocket: "matrix" },
      ],
    };

    const ctx = { time: 0, step: 0, nodeId: "" } as any;
    const res1 = evaluateGraph(graphWithMatrix, DEFAULT_REGISTRY, ctx);
    const gp1 = res1.get("gp_1")?.geometry as THREE.Group;
    const translation1 = new THREE.Vector3().setFromMatrixPosition(gp1.matrix);
    expect(translation1.x).toBe(10);
    expect(translation1.y).toBe(20);
    expect(translation1.z).toBe(30);

    const graphDisconnected: Graph = {
      nodes: [
        { id: "comp_1", type: "transform", params: { location: new THREE.Vector3(10, 20, 30) }, position: { x: 0, y: 0 } },
        { id: "gp_1", type: "curve/grease-pencil", params: { location: new THREE.Vector3(0, 0, 0) }, position: { x: 0, y: 0 } },
      ],
      connections: [],
    };

    const res2 = evaluateGraph(graphDisconnected, DEFAULT_REGISTRY, ctx);
    const gp2 = res2.get("gp_1")?.geometry as THREE.Group;
    const translation2 = new THREE.Vector3().setFromMatrixPosition(gp2.matrix);
    expect(translation2.x).toBe(0);
    expect(translation2.y).toBe(0);
    expect(translation2.z).toBe(0);
  });
});
