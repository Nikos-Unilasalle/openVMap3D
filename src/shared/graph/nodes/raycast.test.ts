import * as THREE from "three";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RAYCAST_NODE, RAY_BURST_NODE, SAMPLE_SURFACE_NODE } from "./raycast";
import { initBvhRaycast } from "../../three/bvh";
import { deserializeGraph } from "../storage";
import { DEFAULT_REGISTRY } from "./index";
import { evaluateGraph } from "../evaluate";

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
    expect(res.geometry).toBeInstanceOf(THREE.LineSegments);
    const hits = res.hits as number[];
    const hitPoints = res.hitPoints as THREE.Vector3[];
    expect(hits.length).toBe(50);
    expect(hitPoints.length).toBeGreaterThan(0);
    expect(hitPoints.length + hits.filter((h) => h === 0).length).toBe(50);
    const line = res.geometry as THREE.LineSegments;
    const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
    expect(posAttr.count).toBe(50 * 2);
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
    expect(burstRes.geometry).toBeInstanceOf(THREE.LineSegments);
    expect(Array.isArray(burstRes.hitPoints)).toBe(true);
    expect((burstRes.hits as number[]).length).toBe(300);

    const spawnRes = results.get(spawnNode!.id)!;
    const spawnGroup = spawnRes.geometry as THREE.Group;
    expect(spawnGroup).toBeInstanceOf(THREE.Group);
    expect(spawnGroup.children.length).toBe(60);

    const mergeRes = results.get(mergeNode!.id)!;
    expect(mergeRes.geometry).toBeInstanceOf(THREE.Group);
  });
});
