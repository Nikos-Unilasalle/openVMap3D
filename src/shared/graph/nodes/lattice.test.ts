import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import {
  buildLatticeControlPoints,
  createLatticeCageGeometry,
  evaluateFFDPoint,
  evaluateLatticeControlPoint,
  LATTICE_DEFORM_NODE,
  LatticeGridConfig,
} from "./lattice";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "lattice-test-node" };

describe("LATTICE DEFORM NODE", () => {
  const baseConfig: LatticeGridConfig = {
    sizeX: 2.0,
    sizeY: 2.0,
    sizeZ: 2.0,
    subdivU: 2,
    subdivV: 2,
    subdivW: 2,
    interpolation: "linear",
    strength: 1.0,
    deformAxis: "y",
    bulge: 0.0,
    twist: 0.0,
    taper: 0.0,
    bend: 0.0,
    shearX: 0.0,
    shearZ: 0.0,
  };

  it("builds an undeformed 2x2x2 control points grid correctly", () => {
    const grid = buildLatticeControlPoints(baseConfig);
    expect(grid.length).toBe(2);
    expect(grid[0].length).toBe(2);
    expect(grid[0][0].length).toBe(2);

    expect(grid[0][0][0].x).toBeCloseTo(-1.0);
    expect(grid[1][1][1].x).toBeCloseTo(1.0);
  });

  it("evaluates linear FFD at center without modification on identity grid", () => {
    const grid = buildLatticeControlPoints(baseConfig);
    const center = evaluateFFDPoint(grid, 0.5, 0.5, 0.5, "linear");
    expect(center.x).toBeCloseTo(0);
    expect(center.y).toBeCloseTo(0);
    expect(center.z).toBeCloseTo(0);
  });

  it("applies taper deformation narrowing the base/top", () => {
    const taperConfig: LatticeGridConfig = {
      ...baseConfig,
      taper: -0.4,
    };
    const ptTop = evaluateLatticeControlPoint(0.5, 0.5, 0.5, taperConfig, 0);
    const ptBot = evaluateLatticeControlPoint(0.5, -0.5, 0.5, taperConfig, 0);

    // Top should have smaller radius than bottom
    expect(Math.abs(ptTop.x)).toBeLessThan(Math.abs(ptBot.x));
  });

  it("applies twist deformation rotating vertices as a function of height", () => {
    const twistConfig: LatticeGridConfig = {
      ...baseConfig,
      twist: 90,
    };
    const ptTop = evaluateLatticeControlPoint(0.5, 0.5, 0.0, twistConfig, 0);
    // At height 0.5 (angle = 90 deg), x moves to z
    expect(ptTop.x).toBeCloseTo(0, 1);
    expect(ptTop.z).toBeCloseTo(1.0, 1);
  });

  it("applies bulge deformation expanding the center", () => {
    const bulgeConfig: LatticeGridConfig = {
      ...baseConfig,
      bulge: 0.5,
    };
    const ptCenter = evaluateLatticeControlPoint(0.1, 0.1, 0.1, bulgeConfig, 0);
    const ptUndeformed = evaluateLatticeControlPoint(0.1, 0.1, 0.1, baseConfig, 0);
    expect(ptCenter.length()).toBeGreaterThan(ptUndeformed.length());
  });

  it("generates valid cage line geometry", () => {
    const grid = buildLatticeControlPoints(baseConfig);
    const cageGeom = createLatticeCageGeometry(grid);
    expect(cageGeom).toBeInstanceOf(THREE.BufferGeometry);
    expect(cageGeom.attributes.position.count).toBeGreaterThan(0);
  });

  it("deforms a 3D box mesh and recalculates normals", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, 4, 4, 4), new THREE.MeshStandardMaterial());
    const res = LATTICE_DEFORM_NODE.evaluate(
      { geometry: box, twist: 45, bulge: 0.3 },
      LATTICE_DEFORM_NODE.defaultParams,
      CTX
    );

    const group = res.geometry as THREE.Group;
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBeGreaterThanOrEqual(1);

    const deformedMesh = group.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    expect(deformedMesh).toBeDefined();
    expect(deformedMesh.geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(deformedMesh.geometry.attributes.normal).toBeDefined();
  });
});
