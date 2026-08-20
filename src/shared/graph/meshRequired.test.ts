import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMeshWarning, findFirstMesh, resetMeshWarnings, warnMeshRequired } from "./meshRequired";
import { isFatLine, isRealMesh } from "../three/objectKinds";
import { SUBDIVIDE_NODE } from "./nodes/subdivide";
import { EvalContext } from "./types";

const CTX = (id: string): EvalContext => ({ time: 0, step: 0, nodeId: id });

function fatLine(): LineSegments2 {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array([0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 0, 2]));
  return new LineSegments2(geometry, new LineMaterial({}));
}

function realMesh(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
}

function particlePoints(count = 8): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  return new THREE.Points(geometry, new THREE.ShaderMaterial());
}

beforeEach(() => resetMeshWarnings());
afterEach(() => vi.restoreAllMocks());

describe("isFatLine / isRealMesh", () => {
  it("a fat line passes a bare instanceof THREE.Mesh — the trap this exists for", () => {
    expect(fatLine() instanceof THREE.Mesh).toBe(true);
  });

  it("but is not a real mesh", () => {
    const line = fatLine();
    expect(isFatLine(line)).toBe(true);
    expect(isRealMesh(line)).toBe(false);
  });

  it("an ordinary mesh is a real mesh and not a fat line", () => {
    const mesh = realMesh();
    expect(isFatLine(mesh)).toBe(false);
    expect(isRealMesh(mesh)).toBe(true);
  });

  it("points are neither", () => {
    expect(isRealMesh(particlePoints())).toBe(false);
  });
});

describe("findFirstMesh", () => {
  it("finds a real mesh, at the root or nested", () => {
    expect(findFirstMesh(realMesh())).not.toBeNull();
    const group = new THREE.Group();
    group.add(realMesh());
    expect(findFirstMesh(group)).not.toBeNull();
  });

  it("refuses a fat line rather than mistaking it for geometry", () => {
    expect(findFirstMesh(fatLine())).toBeNull();
    const group = new THREE.Group();
    group.add(fatLine());
    expect(findFirstMesh(group)).toBeNull();
  });

  it("refuses points and an empty group", () => {
    expect(findFirstMesh(particlePoints())).toBeNull();
    expect(findFirstMesh(new THREE.Group())).toBeNull();
  });
});

describe("Subdivide no longer destroys a fat line", () => {
  it("passes a Capture Trails-style line through with its instance attributes intact", () => {
    // The regression: LineSegments2 extends Mesh, so findFirstMesh used to
    // accept it and rebuild a plain BufferGeometry from its 8-vertex quad
    // *template*, dropping instanceStart/instanceEnd — destroying the line
    // rather than leaving it alone.
    const line = fatLine();
    const res = SUBDIVIDE_NODE.evaluate({ geometry: line }, SUBDIVIDE_NODE.defaultParams, CTX("sub-fatline"));
    const out = res.geometry as THREE.Object3D;

    expect(out).toBe(line);
    expect((out as THREE.Mesh).geometry.attributes.instanceStart).toBeDefined();
  });
});

describe("warnMeshRequired", () => {
  it("warns once per node, not once per frame", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 5; i++) warnMeshRequired("n1", "Subdivide", particlePoints());
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("names the node and what it actually received", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnMeshRequired("n2", "Lattice Deform", particlePoints());
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain("Lattice Deform");
    expect(message).toContain("THREE.Points");
  });

  it("describes a fat line as a line, not as a mesh", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnMeshRequired("n3", "Boolean", fatLine());
    expect(warn.mock.calls[0][0] as string).toContain("LineSegments2");
  });

  it("warns again after the operator rewires the node", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnMeshRequired("n4", "Subdivide", particlePoints());
    clearMeshWarning("n4"); // a mesh arrived
    warnMeshRequired("n4", "Subdivide", particlePoints()); // then it went away again
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("keeps separate nodes' warnings independent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnMeshRequired("a", "Subdivide", particlePoints());
    warnMeshRequired("b", "Subdivide", particlePoints());
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
