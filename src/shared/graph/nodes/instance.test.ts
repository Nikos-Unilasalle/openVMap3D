import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { ARRAY_NODE } from "./array";
import { GET_INSTANCE_NODE, SET_INSTANCE_COLOR_NODE, SET_INSTANCE_TRANSFORM_NODE } from "./instance";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "inst-test" };

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
});
