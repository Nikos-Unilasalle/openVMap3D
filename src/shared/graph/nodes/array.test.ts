import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { ARRAY_NODE } from "./array";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "arr-1" };

function getChildPosition(wrapper: THREE.Object3D): THREE.Vector3 {
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  wrapper.matrix.decompose(pos, rot, scale);
  return pos;
}

describe("ARRAY_NODE", () => {
  it("duplicates geometry in linear mode along X axis", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const res = ARRAY_NODE.evaluate(
      { geometry: box },
      { count: 4, mode: "linear", axis: "X", spacing: 2.0 },
      CTX
    );

    const group = res.geometry as THREE.Group;
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(4);

    expect(getChildPosition(group.children[0]).x).toBeCloseTo(0);
    expect(getChildPosition(group.children[1]).x).toBeCloseTo(2.0);
    expect(getChildPosition(group.children[2]).x).toBeCloseTo(4.0);
    expect(getChildPosition(group.children[3]).x).toBeCloseTo(6.0);
  });

  it("duplicates geometry in circular mode on XZ plane", () => {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5));
    const res = ARRAY_NODE.evaluate(
      { geometry: sphere },
      { count: 4, mode: "circular", radius: 5.0, plane: "XZ", totalAngle: 360, orient: true },
      CTX
    );

    const group = res.geometry as THREE.Group;
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(4);

    // Instance 0 (angle = 0): cos(0)*5 = 5, sin(0)*5 = 0
    expect(getChildPosition(group.children[0]).x).toBeCloseTo(5.0);
    expect(getChildPosition(group.children[0]).z).toBeCloseTo(0.0);

    // Instance 1 (angle = PI/2 = 90 deg): cos(PI/2)*5 = 0, sin(PI/2)*5 = 5
    expect(getChildPosition(group.children[1]).x).toBeCloseTo(0.0);
    expect(getChildPosition(group.children[1]).z).toBeCloseTo(5.0);
  });

  it("returns empty group if no geometry is input", () => {
    const res = ARRAY_NODE.evaluate({}, { count: 5 }, CTX);
    const group = res.geometry as THREE.Group;
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(0);
  });
});
