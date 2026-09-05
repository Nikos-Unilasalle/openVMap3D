import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PAINT_ON_GEOMETRY_NODE } from "./paintOnGeometry";
import { DEFAULT_REGISTRY } from "./index";
import { GIZMO_SELECTABLE_TYPES } from "../transformLookup";
import { projectScreenToTargetGeometry } from "../../three/greasePencilDrawing";
import { buildStrokesRibbonGeometry } from "./greasePencil";

describe("PAINT_ON_GEOMETRY_NODE", () => {
  it("is properly registered in DEFAULT_REGISTRY and GIZMO_SELECTABLE_TYPES", () => {
    expect(DEFAULT_REGISTRY.get("curve/paint-on-geometry")).toBeDefined();
    expect(DEFAULT_REGISTRY.get("curve/paint-on-geometry")?.label).toBe("Paint on geometry");
    expect(GIZMO_SELECTABLE_TYPES).toContain("curve/paint-on-geometry");
  });

  it("declares ownership on geometry input socket", () => {
    const geomInput = PAINT_ON_GEOMETRY_NODE.inputs.find((i) => i.id === "geometry");
    expect(geomInput).toBeDefined();
    expect(geomInput?.type).toBe("geometry");
    expect(geomInput?.owns).toBe(true);
  });

  it("evaluates and parents connected input geometry into output group", () => {
    const boxGeo = new THREE.BoxGeometry(2, 2, 2);
    const boxMat = new THREE.MeshBasicMaterial();
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);

    const ctx = {
      nodeId: "paint_test_1",
      currentFrame: 0,
    };

    const result = PAINT_ON_GEOMETRY_NODE.evaluate(
      { geometry: boxMesh },
      { ...PAINT_ON_GEOMETRY_NODE.defaultParams },
      ctx as any,
    );

    expect(result.geometry).toBeInstanceOf(THREE.Group);
    const group = result.geometry as THREE.Group;
    expect(group.children).toContain(boxMesh);
  });

  it("evaluates strokes and builds activeMesh with correct renderOrder and depth settings", () => {
    const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const ctx = {
      nodeId: "paint_test_2",
      currentFrame: 0,
    };

    const testStrokes = [
      {
        id: "stroke_1",
        points: [
          { x: 0, y: 0, z: 0.5, pressure: 0.8, nx: 0, ny: 0, nz: 1 },
          { x: 0.2, y: 0.2, z: 0.5, pressure: 0.7, nx: 0, ny: 0, nz: 1 },
          { x: 0.4, y: 0, z: 0.5, pressure: 0.6, nx: 0, ny: 0, nz: 1 },
        ],
        color: "#ff0055",
        brushType: "ink_pen" as const,
        fill: true,
        fillColor: "#00ff55",
      },
    ];

    const result = PAINT_ON_GEOMETRY_NODE.evaluate(
      { geometry: boxMesh },
      {
        ...PAINT_ON_GEOMETRY_NODE.defaultParams,
        frames: [{ frame: 0, strokes: testStrokes }],
      },
      ctx as any,
    );

    const group = result.geometry as THREE.Group;
    const meshes = group.children.filter((c) => c instanceof THREE.Mesh) as THREE.Mesh[];

    // Should have boxMesh, fillMesh, and activeMesh
    expect(meshes.length).toBe(3);

    const activeMesh = meshes.find((m) => m.renderOrder === 10);
    const fillMesh = meshes.find((m) => m.renderOrder === 8);

    expect(activeMesh).toBeDefined();
    expect(fillMesh).toBeDefined();

    const activeMat = activeMesh?.material as THREE.MeshBasicMaterial;
    expect(activeMat.depthWrite).toBe(false);
    expect(activeMat.transparent).toBe(true);
    expect(activeMat.polygonOffset).toBe(true);

    const fillMat = fillMesh?.material as THREE.MeshBasicMaterial;
    expect(fillMat.depthWrite).toBe(false);
    expect(fillMat.transparent).toBe(true);
    expect(fillMat.polygonOffset).toBe(true);
  });

  it("respects visible: false", () => {
    const ctx = {
      nodeId: "paint_test_3",
      currentFrame: 0,
    };

    const result = PAINT_ON_GEOMETRY_NODE.evaluate(
      {},
      { ...PAINT_ON_GEOMETRY_NODE.defaultParams, visible: false },
      ctx as any,
    );

    expect(result.geometry).toBeNull();
  });
});

describe("projectScreenToTargetGeometry", () => {
  it("raycasts onto 3D box surface and computes valid intersection and normal", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    box.position.set(0, 0, 0);
    box.updateMatrixWorld(true);

    // Camera looking directly down -Z at the box at (0, 0, 0)
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const domElement = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 800,
      }),
    } as HTMLElement;

    // Click in center of screen (400, 400) -> raycast hits center of box front face (Z = 1)
    const hit = projectScreenToTargetGeometry(400, 400, camera, domElement, box, null);

    expect(hit).not.toBeNull();
    expect(hit?.mesh).toBe(box);
    // Hit normal should be along +Z
    expect(hit?.normal.z).toBeCloseTo(1);
    expect(hit?.normal.x).toBeCloseTo(0);
    expect(hit?.normal.y).toBeCloseTo(0);
    // Point should be near Z = 1 + normal offset (0.003)
    expect(hit?.point.z).toBeCloseTo(1.003, 2);
    expect(hit?.point.x).toBeCloseTo(0, 2);
    expect(hit?.point.y).toBeCloseTo(0, 2);
  });

  it("returns null when ray misses the geometry", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    box.position.set(0, 0, 0);
    box.updateMatrixWorld(true);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const domElement = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 800,
      }),
    } as HTMLElement;

    // Click at corner of screen far away from box
    const hit = projectScreenToTargetGeometry(10, 10, camera, domElement, box, null);
    expect(hit).toBeNull();
  });
});

describe("buildStrokesRibbonGeometry with surface normals", () => {
  it("builds geometry aligned with custom surface normal", () => {
    const strokes = [
      {
        id: "s1",
        points: [
          { x: 0, y: 0, z: 1, pressure: 0.5, nx: 0, ny: 0, nz: 1 },
          { x: 1, y: 0, z: 1, pressure: 0.5, nx: 0, ny: 0, nz: 1 },
        ],
        color: "#38bdf8",
      },
    ];

    const geo = buildStrokesRibbonGeometry(strokes, "#38bdf8", 4);
    const pos = geo.getAttribute("position");
    expect(pos).toBeDefined();
    expect(pos.count).toBeGreaterThan(0);

    // Tangent is (1, 0, 0), normal is (0, 0, 1). Side vector is tangent x normal = (0, -1, 0).
    // Therefore ribbon width offsets are along Y!
    const y0 = pos.getY(0);
    const y1 = pos.getY(1);
    expect(Math.abs(y0 - y1)).toBeGreaterThan(0);
  });
});
