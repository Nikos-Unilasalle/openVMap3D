import * as THREE from "three";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RAYCAST_NODE, RAY_BURST_NODE, SAMPLE_SURFACE_NODE, VOLUME_SCATTER_NODE } from "./raycast";
import { CURVE_FROM_POINTS_NODE } from "./curve";
import { initBvhRaycast } from "../../three/bvh";
import { deserializeGraph } from "../storage";
import { DEFAULT_REGISTRY } from "./index";
import { evaluateGraph } from "../evaluate";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

describe("RAYCAST_NODE", () => {
  it("hits a box from above with point, normal and distance", () => {
    initBvhRaycast();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.updateMatrixWorld(true);
    const res = RAYCAST_NODE.evaluate(
      { geometry: box, origin: new THREE.Vector3(0, 5, 0), direction: new THREE.Vector3(0, -1, 0), maxDistance: 100 },
      RAYCAST_NODE.defaultParams,
      { nodeId: "raycast_1" } as any,
    );
    expect(res.hit).toBe(1);
    expect((res.point as THREE.Vector3).y).toBeCloseTo(0.5);
    expect((res.normal as THREE.Vector3).y).toBeCloseTo(1);
    expect(res.distance).toBeCloseTo(4.5);
  });

  it("returns no hit when the ray misses", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.updateMatrixWorld(true);
    const res = RAYCAST_NODE.evaluate(
      { geometry: box, origin: new THREE.Vector3(5, 5, 5), direction: new THREE.Vector3(0, -1, 0), maxDistance: 100 },
      RAYCAST_NODE.defaultParams,
      { nodeId: "raycast_2" } as any,
    );
    expect(res.hit).toBe(0);
  });

  it("degrades gracefully without a target", () => {
    const res = RAYCAST_NODE.evaluate({}, RAYCAST_NODE.defaultParams, { nodeId: "raycast_3" } as any);
    expect(res.hit).toBe(0);
  });
});

describe("RAY_BURST_NODE", () => {
  it("puts the same seed on the same ray field", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.updateMatrixWorld(true);
    const run = (nodeId: string, seed: number) =>
      RAY_BURST_NODE.evaluate(
        { geometry: box, count: 12, seed },
        RAY_BURST_NODE.defaultParams,
        { nodeId } as any,
      ).rayOrigins as THREE.Vector3[];

    const a = run("burst_seed_a", 7);
    const b = run("burst_seed_b", 7);
    const other = run("burst_seed_c", 8);

    expect(a).toHaveLength(12);
    a.forEach((v, i) => {
      expect(v.x).toBeCloseTo(b[i].x);
      expect(v.y).toBeCloseTo(b[i].y);
      expect(v.z).toBeCloseTo(b[i].z);
    });
    // A different seed must actually produce a different field.
    expect(a.some((v, i) => Math.abs(v.x - other[i].x) > 1e-6)).toBe(true);
  });

  it("keeps the ray field stable when only colour, centre or radius animate", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.updateMatrixWorld(true);
    const params = { ...RAY_BURST_NODE.defaultParams, count: 10, seed: 3, rotate: 0 };
    const first = RAY_BURST_NODE.evaluate(
      { geometry: box, radius: 4, origin: new THREE.Vector3(0, 0, 0) },
      params,
      { nodeId: "burst_stable" } as any,
    ).rayOrigins as THREE.Vector3[];

    // Same node, next frame: a moved centre, a new colour and a bigger radius.
    const second = RAY_BURST_NODE.evaluate(
      { geometry: box, radius: 8, origin: new THREE.Vector3(1, 0, 0) },
      { ...params, color: new THREE.Color(0xff0000) },
      { nodeId: "burst_stable" } as any,
    ).rayOrigins as THREE.Vector3[];

    // Each ray sits at centre + dir * radius, so with the field intact the
    // second frame is exactly the first scaled about the (new) centre.
    second.forEach((v, i) => {
      expect(v.x - 1).toBeCloseTo((first[i].x - 0) * 2);
      expect(v.y).toBeCloseTo(first[i].y * 2);
      expect(v.z).toBeCloseTo(first[i].z * 2);
    });
  });

  it("keeps every output list index-aligned with its ray, misses included", () => {
    // A target the rays can't all reach: the burst sphere is far bigger than
    // the box, so plenty of them miss.
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
    box.updateMatrixWorld(true);
    const res = RAY_BURST_NODE.evaluate(
      { geometry: box, count: 20, radius: 5, seed: 1 },
      { ...RAY_BURST_NODE.defaultParams, rotate: 0 },
      { nodeId: "burst_align" } as any,
    );
    const hits = res.hits as number[];
    expect(hits).toHaveLength(20);
    expect((res.rayOrigins as unknown[])).toHaveLength(20);
    expect((res.hitPoints as unknown[])).toHaveLength(20);
    expect((res.hitNormals as unknown[])).toHaveLength(20);
    const distances = res.distances as number[];
    expect(distances).toHaveLength(20);
    // Infinity used to leak into this list on every miss and poison List
    // Statistics / List Math downstream.
    expect(distances.every((d) => Number.isFinite(d))).toBe(true);
  });


  it("emits a line geometry plus hit/miss lists against a box", () => {
    initBvhRaycast();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.updateMatrixWorld(true);
    const res = RAY_BURST_NODE.evaluate(
      { geometry: box, count: 50, origin: new THREE.Vector3(0, 0, 0), radius: 3, seed: 1, rotate: 0, time: 0 },
      RAY_BURST_NODE.defaultParams,
      { nodeId: "rayburst_1" } as any,
    );
    expect(res.geometry).toBeInstanceOf(LineSegments2);
    const hits = res.hits as number[];
    const hitPoints = res.hitPoints as THREE.Vector3[];
    const rayOrigins = res.rayOrigins as THREE.Vector3[];
    expect(hits.length).toBe(50);
    expect(hitPoints.length).toBeGreaterThan(0);
    expect(hitPoints.length + hits.filter((h) => h === 0).length).toBe(50);
    expect(rayOrigins.length).toBe(50);
    // Every origin sits on the radius sphere around the centre.
    for (const o of rayOrigins) {
      expect(o.length()).toBeCloseTo(3, 1);
    }
    const line = res.geometry as LineSegments2;
    const startAttr = line.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    expect(startAttr.count).toBe(50);
  });

  it("applies appearance params to the fat-line material", () => {
    initBvhRaycast();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.updateMatrixWorld(true);
    const res = RAY_BURST_NODE.evaluate(
      { geometry: box, count: 10, origin: new THREE.Vector3(0, 0, 0), radius: 3, seed: 1, rotate: 0, time: 0 },
      { ...RAY_BURST_NODE.defaultParams, color: 0xff0000, opacity: 0.7, linewidth: 4, dashed: true, dashSize: 0.8, gapSize: 0.2 },
      { nodeId: "rayburst_2" } as any,
    );
    const line = res.geometry as LineSegments2;
    const mat = line.material as LineMaterial;
    expect(mat.color.getHex()).toBe(0xff0000);
    expect(mat.uniforms.opacity.value).toBeCloseTo(0.7);
    expect(mat.linewidth).toBeCloseTo(4);
    expect(mat.dashed).toBe(true);
    expect(mat.dashSize).toBeCloseTo(0.8);
    expect(mat.gapSize).toBeCloseTo(0.2);
    // Dash distances are computed per segment.
    const startDist = line.geometry.attributes.instanceDistanceStart as THREE.InstancedBufferAttribute;
    const endDist = line.geometry.attributes.instanceDistanceEnd as THREE.InstancedBufferAttribute;
    expect(startDist.count).toBe(10);
    expect(endDist.count).toBe(10);
    expect(startDist.getX(0)).toBe(0);
    expect(endDist.getX(0)).toBeGreaterThan(0);
  });
});

describe("SAMPLE_SURFACE_NODE", () => {
  it("returns count points and normals on a mesh surface", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    box.updateMatrixWorld(true);
    const res = SAMPLE_SURFACE_NODE.evaluate(
      { geometry: box, count: 40, seed: 7 },
      SAMPLE_SURFACE_NODE.defaultParams,
      { nodeId: "sample_1" } as any,
    );
    expect((res.points as THREE.Vector3[]).length).toBe(40);
    expect((res.normals as THREE.Vector3[]).length).toBe(40);
  });

  it("degrades gracefully without a target", () => {
    const res = SAMPLE_SURFACE_NODE.evaluate({}, SAMPLE_SURFACE_NODE.defaultParams, { nodeId: "sample_2" } as any);
    expect((res.points as unknown[]).length).toBe(0);
  });
});

describe("VOLUME_SCATTER_NODE", () => {
  it("returns count points and normals inside a mesh volume", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    box.updateMatrixWorld(true);
    const res = VOLUME_SCATTER_NODE.evaluate(
      { geometry: box, count: 40, seed: 7 },
      VOLUME_SCATTER_NODE.defaultParams,
      { nodeId: "vol_sample_1" } as any,
    );
    const points = res.points as THREE.Vector3[];
    expect(points.length).toBe(40);
    expect((res.normals as THREE.Vector3[]).length).toBe(40);
    for (const p of points) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(1.0001);
    }
  });

  it("degrades gracefully without a target", () => {
    const res = VOLUME_SCATTER_NODE.evaluate({}, VOLUME_SCATTER_NODE.defaultParams, { nodeId: "vol_sample_2" } as any);
    expect((res.points as unknown[]).length).toBe(0);
  });

  it("produces valid points that feed into Curve from Points", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    box.updateMatrixWorld(true);
    const volRes = VOLUME_SCATTER_NODE.evaluate(
      { geometry: box, count: 10, seed: 1 },
      VOLUME_SCATTER_NODE.defaultParams,
      { nodeId: "vol_1" } as any,
    );
    const curveRes = CURVE_FROM_POINTS_NODE.evaluate(
      { points: volRes.points },
      CURVE_FROM_POINTS_NODE.defaultParams,
      { nodeId: "curve_1" } as any,
    );
    expect(curveRes.curve).toBeDefined();
    expect(curveRes.geometry).toBeDefined();
    const line = curveRes.geometry as THREE.Line;
    const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
    expect(posAttr.count).toBeGreaterThan(0);
  });
});


describe.skipIf(!existsSync("public/demos/demo_raycast.tsuji"))("demo_raycast.tsuji", () => {
  it("loads and evaluates the ray-burst demo graph", () => {
    initBvhRaycast();
    const text = readFileSync("public/demos/demo_raycast.tsuji", "utf8");
    const graph = deserializeGraph(text, DEFAULT_REGISTRY);

    const burstNode = graph.nodes.find((n) => n.type === "physics/ray-burst");
    const spawnNode = graph.nodes.find((n) => n.type === "structure/spawn");
    const mergeNode = graph.nodes.find((n) => n.type === "structure/merge");
    expect(burstNode).toBeDefined();
    expect(spawnNode).toBeDefined();
    expect(mergeNode).toBeDefined();

    const results = evaluateGraph(graph, DEFAULT_REGISTRY, { time: 1.5, step: 1, nodeId: "demo" } as never);
    const burstRes = results.get(burstNode!.id)!;
    expect(burstRes.geometry).toBeInstanceOf(LineSegments2);
    expect(Array.isArray(burstRes.hitPoints)).toBe(true);
    expect((burstRes.hits as number[]).length).toBe(300);

    const spawnRes = results.get(spawnNode!.id)!;
    const spawnGroup = spawnRes.geometry as THREE.Group;
    expect(spawnGroup).toBeInstanceOf(THREE.Group);
    expect(spawnGroup.children.length).toBe(60);

    const mergeRes = results.get(mergeNode!.id)!;
    expect(mergeRes.geometry).toBeInstanceOf(THREE.Group);
  });

  it("markers land exactly on the ray endpoints (positions list not overridden by posX/Y/Z defaults)", () => {
    initBvhRaycast();
    const text = readFileSync("public/demos/demo_raycast.tsuji", "utf8");
    const graph = deserializeGraph(text, DEFAULT_REGISTRY);
    const results = evaluateGraph(graph, DEFAULT_REGISTRY, { time: 0.5, step: 1, nodeId: "demo2" } as never);

    const burstNode = graph.nodes.find((n) => n.type === "physics/ray-burst")!;
    const markerNode = graph.nodes.find((n) => n.type === "structure/instance-transform")!;
    const burstRes = results.get(burstNode.id)!;
    const markerRes = results.get(markerNode.id)!;

    const line = burstRes.geometry as LineSegments2;
    const geo = line.geometry as LineSegmentsGeometry;
    const start = geo.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    const end = geo.attributes.instanceEnd as THREE.InterleavedBufferAttribute;
    const markerGroup = markerRes.geometry as THREE.Group;
    expect(markerGroup.children.length).toBeGreaterThan(0);

    let onEnds = 0;
    for (const w of markerGroup.children) {
      if (!(w instanceof THREE.Group)) continue;
      const pos = new THREE.Vector3().setFromMatrixPosition(w.matrix);
      let best = Infinity;
      for (let i = 0; i < start.count; i++) {
        const ex = end.getX(i);
        const ey = end.getY(i);
        const ez = end.getZ(i);
        const d = (pos.x - ex) ** 2 + (pos.y - ey) ** 2 + (pos.z - ez) ** 2;
        if (d < best) best = d;
      }
      if (best < 1e-6) onEnds++;
    }
    expect(onEnds).toBe(markerGroup.children.length);
  });
});
