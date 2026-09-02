import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { OBJECT_LASER_BEAM_NODE } from "./laserBeam";

const CTX: EvalContext = { time: 0, step: 0.016, nodeId: "laser-test" };

describe("OBJECT_LASER_BEAM_NODE", () => {
  it("creates a laser beam group with pan/tilt head, transform matrix and beam geometry", () => {
    const res = OBJECT_LASER_BEAM_NODE.evaluate(
      { pan: 45, tilt: -20, color: new THREE.Color(0xff0055), length: 30 },
      OBJECT_LASER_BEAM_NODE.defaultParams,
      CTX,
    ) as any;
    expect(res.geometry).toBeInstanceOf(THREE.Group);
    expect(res.direction).toBeInstanceOf(THREE.Vector3);
    expect(res.hitPosition).toBeInstanceOf(THREE.Vector3);
    expect(res.matrix).toBeInstanceOf(THREE.Matrix4);

    const group = res.geometry as THREE.Group;
    expect(group.children.length).toBeGreaterThan(0);
    expect(group.visible).toBe(true);
  });

  it("calculates forward direction vector from pan and tilt angles", () => {
    const res = OBJECT_LASER_BEAM_NODE.evaluate(
      { pan: 0, tilt: 0 },
      OBJECT_LASER_BEAM_NODE.defaultParams,
      CTX,
    ) as any;
    const dir = res.direction as THREE.Vector3;
    expect(dir.z).toBeCloseTo(1.0);
    expect(dir.x).toBeCloseTo(0);
    expect(dir.y).toBeCloseTo(0);
  });

  it("dynamically updates beam length and radius when params change", () => {
    const res1 = OBJECT_LASER_BEAM_NODE.evaluate(
      { length: 15.0, radius: 0.02 },
      OBJECT_LASER_BEAM_NODE.defaultParams,
      { ...CTX, nodeId: "laser-dynamic" },
    ) as any;
    const headGroup = (res1.geometry as THREE.Group).children.find((c) => c instanceof THREE.Group) as THREE.Group;
    const beamMesh = headGroup.children[1] as THREE.Mesh;
    expect(beamMesh.geometry).toBeInstanceOf(THREE.CylinderGeometry);

    // Re-evaluate with new length
    const res2 = OBJECT_LASER_BEAM_NODE.evaluate(
      { length: 40.0, radius: 0.05 },
      OBJECT_LASER_BEAM_NODE.defaultParams,
      { ...CTX, nodeId: "laser-dynamic" },
    ) as any;
    expect(res2.geometry).toBe(res1.geometry);
    const hitPos = res2.hitPosition as THREE.Vector3;
    expect(hitPos.length()).toBeCloseTo(40.0, 0);
  });

  it("toggles visibility correctly", () => {
    const res = OBJECT_LASER_BEAM_NODE.evaluate(
      { visible: 0 },
      OBJECT_LASER_BEAM_NODE.defaultParams,
      { ...CTX, nodeId: "laser-vis" },
    ) as any;
    expect((res.geometry as THREE.Group).visible).toBe(false);
  });
});
