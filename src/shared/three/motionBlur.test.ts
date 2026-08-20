import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { velocityKey } from "./motionBlur";
import { deserializeProject } from "../graph/storage";
import { DEFAULT_REGISTRY } from "../graph/nodes";
import { evaluateGraph } from "../graph/evaluate";

/** The scene meshes of one evaluation, in traversal order — what the velocity pass walks. */
function evaluateMeshes(file: string, outputNode: string, time: number): THREE.Mesh[] {
  const project = deserializeProject(readFileSync(file, "utf8"), DEFAULT_REGISTRY);
  const graph = project.canvases.find((c) => c.nodes.length > 0)!;
  const results = evaluateGraph(graph, DEFAULT_REGISTRY, {
    time,
    step: Math.round(time * 60),
    nodeId: "velocity-test",
    currentFrame: Math.round(time * 60),
    keyframes: graph.keyframes,
  } as never);

  const root = results.get(outputNode)!.geometry as THREE.Object3D;
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function keysOf(meshes: THREE.Mesh[]): string[] {
  const ordinals = new Map<string, number>();
  return meshes.map((mesh) => velocityKey(mesh, ordinals));
}

const WAVE = "demos/demo_stagger_wave.tsuji";

describe("velocity keys", () => {
  it("instanced geometry is a fresh set of objects every frame", () => {
    // The premise the keying exists for. If this ever stops being true, the
    // per-object matrix the keys replaced would have worked all along.
    const a = evaluateMeshes(WAVE, "tint", 1.0);
    const b = evaluateMeshes(WAVE, "tint", 1.0 + 1 / 60);
    const uuids = new Set(a.map((m) => m.uuid));
    expect(a.length).toBe(144);
    expect(b.filter((m) => uuids.has(m.uuid))).toHaveLength(0);
  });

  it("names the same instances on consecutive frames", () => {
    const a = evaluateMeshes(WAVE, "tint", 1.0);
    const b = evaluateMeshes(WAVE, "tint", 1.0 + 1 / 60);
    expect(keysOf(b)).toEqual(keysOf(a));
    expect(new Set(keysOf(a)).size).toBe(a.length);
  });

  it("follows an instance rather than a slot — the key's whole point", () => {
    // Only Y animates in this graph, so an instance's XZ is its identity: if a
    // key pointed at a different cube from one frame to the next, the previous
    // matrix would report a sideways jump that never happened.
    const a = evaluateMeshes(WAVE, "tint", 1.0);
    const b = evaluateMeshes(WAVE, "tint", 1.0 + 1 / 60);
    const groundPlan = (meshes: THREE.Mesh[]) => {
      const ordinals = new Map<string, number>();
      return new Map(
        meshes.map((mesh) => {
          const position = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
          return [velocityKey(mesh, ordinals), `${position.x.toFixed(4)},${position.z.toFixed(4)}`];
        }),
      );
    };
    expect(groundPlan(b)).toEqual(groundPlan(a));
  });

  it("reports real movement between the frames it keys", () => {
    // The end result the whole pass is after: a non-zero per-instance delta,
    // which is exactly what the old per-object storage could never produce for
    // cloned geometry.
    const a = evaluateMeshes(WAVE, "tint", 1.0);
    const b = evaluateMeshes(WAVE, "tint", 1.0 + 1 / 60);
    const heights = (meshes: THREE.Mesh[]) => {
      const ordinals = new Map<string, number>();
      return new Map(
        meshes.map((mesh) => [
          velocityKey(mesh, ordinals),
          new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld).y,
        ]),
      );
    };
    const before = heights(a);
    const after = heights(b);
    const deltas = [...after].map(([key, y]) => Math.abs(y - before.get(key)!));
    expect(Math.max(...deltas)).toBeGreaterThan(0.01);
  });

  it("keeps instances of different source nodes apart", () => {
    const ordinals = new Map<string, number>();
    const fromNode = (nodeId: string) => {
      const mesh = new THREE.Mesh();
      mesh.userData.nodeId = nodeId;
      return velocityKey(mesh, ordinals);
    };
    expect([fromNode("cube"), fromNode("cube"), fromNode("sphere")]).toEqual([
      "cube#0",
      "cube#1",
      "sphere#0",
    ]);
    // Geometry with no owning node (helpers, imported scenes) still gets a key
    // rather than sharing one bucket with everything else.
    expect(velocityKey(new THREE.Mesh(), ordinals)).toBe("anon#0");
  });
});
