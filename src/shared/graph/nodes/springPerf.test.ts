import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { SPRING_VECTOR_NODE } from "./spring";

/**
 * Guards the invariants that keep Individual Points mode viable on a real
 * mesh (an 80k-face OBJ is ~240k independent springs). These are cheap
 * structural assertions, not timing benchmarks — a timing threshold would
 * be flaky on shared CI hardware, whereas "does it still allocate a fresh
 * array of clones every frame" is exactly the regression worth catching and
 * is deterministic.
 */
function ctx(nodeId: string): EvalContext {
  return { time: 0, step: 0, nodeId };
}

function makePoints(n: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = new Array(n);
  for (let i = 0; i < n; i++) pts[i] = new THREE.Vector3(i * 0.01, 0, 0);
  return pts;
}

describe("SPRING_VECTOR_NODE — Individual Points performance invariants", () => {
  it("reuses the same output vector objects frame to frame instead of allocating a new set", () => {
    const nodeId = "perf1";
    const params = SPRING_VECTOR_NODE.defaultParams;
    const pts = makePoints(64);

    const first = SPRING_VECTOR_NODE.evaluate({ points: pts, time: 0 }, params, ctx(nodeId));
    const firstPoints = first.points as THREE.Vector3[];
    const firstRefs = [...firstPoints];

    const second = SPRING_VECTOR_NODE.evaluate({ points: pts, time: 1 / 60 }, params, ctx(nodeId));
    const secondPoints = second.points as THREE.Vector3[];

    expect(secondPoints).toBe(firstPoints); // same array
    for (let i = 0; i < firstRefs.length; i++) {
      expect(secondPoints[i]).toBe(firstRefs[i]); // and the same Vector3 instances
    }
  });

  it("still reseeds correctly when the point count changes, growing the reused buffers", () => {
    const nodeId = "perf2";
    const params = SPRING_VECTOR_NODE.defaultParams;

    SPRING_VECTOR_NODE.evaluate({ points: makePoints(8), time: 0 }, params, ctx(nodeId));
    const grown = SPRING_VECTOR_NODE.evaluate({ points: makePoints(32), time: 1 / 60 }, params, ctx(nodeId));
    const grownPoints = grown.points as THREE.Vector3[];
    expect(grownPoints).toHaveLength(32);
    // Reseeded, so every point sits exactly on its target.
    expect(grownPoints[31].x).toBeCloseTo(31 * 0.01, 6);

    const shrunk = SPRING_VECTOR_NODE.evaluate({ points: makePoints(4), time: 2 / 60 }, params, ctx(nodeId));
    expect(shrunk.points as THREE.Vector3[]).toHaveLength(4);
  });

  it("reuses one cached Mesh and its geometry across frames rather than re-cloning per frame", () => {
    const nodeId = "perf3";
    const params = SPRING_VECTOR_NODE.defaultParams;
    const n = 24;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    geom.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial());
    const group = new THREE.Group();
    group.add(mesh);

    const pts = makePoints(n);
    const first = SPRING_VECTOR_NODE.evaluate({ points: pts, geometry: group, time: 0 }, params, ctx(nodeId));
    const firstMesh = first.geometry as THREE.Mesh;
    const firstGeom = firstMesh.geometry;
    const firstPosArray = firstGeom.attributes.position.array;
    const firstUvArray = firstGeom.attributes.uv.array;
    const firstPosVersion = (firstGeom.attributes.position as THREE.BufferAttribute).version;
    const firstUvVersion = (firstGeom.attributes.uv as THREE.BufferAttribute).version;

    group.position.x = 5;
    group.updateMatrix();
    const second = SPRING_VECTOR_NODE.evaluate({ points: pts, geometry: group, time: 1 / 60 }, params, ctx(nodeId));
    const secondMesh = second.geometry as THREE.Mesh;

    expect(secondMesh).toBe(firstMesh);
    expect(secondMesh.geometry).toBe(firstGeom);
    // Position is written in place; the untouched uv buffer is never recopied.
    expect(secondMesh.geometry.attributes.position.array).toBe(firstPosArray);
    expect(secondMesh.geometry.attributes.uv.array).toBe(firstUvArray);
    // `version` is what three re-uploads on (needsUpdate is a setter with no
    // getter): position is re-sent to the GPU, uv is not.
    expect((secondMesh.geometry.attributes.position as THREE.BufferAttribute).version).toBeGreaterThan(firstPosVersion);
    expect((secondMesh.geometry.attributes.uv as THREE.BufferAttribute).version).toBe(firstUvVersion);
  });

  it("rebuilds (rather than writing into a stale clone) when the upstream geometry is replaced", () => {
    const nodeId = "perf4";
    const params = SPRING_VECTOR_NODE.defaultParams;
    const n = 12;

    const makeObj = (verts: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(verts * 3), 3));
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial()));
      return grp;
    };

    const a = makeObj(n);
    const first = SPRING_VECTOR_NODE.evaluate({ points: makePoints(n), geometry: a, time: 0 }, params, ctx(nodeId));
    const firstGeom = (first.geometry as THREE.Mesh).geometry;

    const b = makeObj(n);
    const second = SPRING_VECTOR_NODE.evaluate({ points: makePoints(n), geometry: b, time: 1 / 60 }, params, ctx(nodeId));
    expect((second.geometry as THREE.Mesh).geometry).not.toBe(firstGeom);
  });

  it("handles a mesh-scale point count without pathological slowdown", () => {
    const nodeId = "perf5";
    const params = SPRING_VECTOR_NODE.defaultParams;
    const pts = makePoints(120_000);

    SPRING_VECTOR_NODE.evaluate({ points: pts, time: 0 }, params, ctx(nodeId));
    for (let f = 1; f <= 5; f++) {
      const res = SPRING_VECTOR_NODE.evaluate({ points: pts, time: f / 60 }, params, ctx(nodeId));
      const out = res.points as THREE.Vector3[];
      expect(out).toHaveLength(120_000);
      expect(Number.isFinite(out[119_999].x)).toBe(true);
    }
  });
});
