import * as THREE from "three";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RAYCAST_NODE, RAY_BURST_NODE, SAMPLE_SURFACE_NODE } from "./raycast";
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

describe("demo_raycast.tsuji", () => {
  it("loads and evaluates the ray-burst demo graph", () => {
    initBvhRaycast();
    const text = readFileSync("demos/demo_raycast.tsuji", "utf8");
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
    const text = readFileSync("demos/demo_raycast.tsuji", "utf8");
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
