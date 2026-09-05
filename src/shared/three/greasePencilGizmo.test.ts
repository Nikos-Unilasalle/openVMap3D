import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GIZMO_SELECTABLE_TYPES, resolveGizmoTarget } from "../graph/transformLookup";
import { GREASE_PENCIL_NODE } from "../graph/nodes/greasePencil";
import { Graph } from "../graph/types";
import { computeGizmoWriteback } from "./gizmoWriteback";

describe("Grease Pencil Gizmo & Elevation Viewport Integration", () => {
  it("includes curve/grease-pencil in GIZMO_SELECTABLE_TYPES", () => {
    expect(GIZMO_SELECTABLE_TYPES).toContain(GREASE_PENCIL_NODE.type);
    expect(GIZMO_SELECTABLE_TYPES).toContain("curve/grease-pencil");
  });

  it("resolves Grease Pencil as a native gizmo target", () => {
    const graph: Graph = {
      nodes: [
        {
          id: "gp_1",
          type: GREASE_PENCIL_NODE.type,
          position: { x: 0, y: 0 },
          params: {
            ...GREASE_PENCIL_NODE.defaultParams,
            location: new THREE.Vector3(2, 4, 6),
            rotation: new THREE.Vector3(0, 0, 0),
            scale: new THREE.Vector3(1, 1, 1),
          },
        },
      ],
      connections: [],
    };

    const target = resolveGizmoTarget(graph, "gp_1");
    expect(target).toEqual({
      kind: "native",
      objectNodeId: "gp_1",
      deltaSourceNodeId: null,
    });
  });

  it("determines correct gizmo axes for mode2D vs elevationView vs 3D", () => {
    function getGizmoAxes(mode2D: boolean, elevationView: boolean, isGp: boolean) {
      if (mode2D) {
        return { showX: true, showY: false, showZ: true };
      } else if (elevationView) {
        if (isGp) {
          return { showX: true, showY: true, showZ: true };
        } else {
          return { showX: false, showY: true, showZ: false };
        }
      } else {
        return { showX: true, showY: true, showZ: true };
      }
    }

    // In 2D mode (primary pane): X and Z active (horizontal drawing plane)
    expect(getGizmoAxes(true, false, true)).toEqual({ showX: true, showY: false, showZ: true });

    // In elevationView (secondary pane) for standard objects: only Y active
    expect(getGizmoAxes(false, true, false)).toEqual({ showX: false, showY: true, showZ: false });

    // In elevationView (secondary pane) for Grease Pencil: full 3D active (X, Y, Z)
    expect(getGizmoAxes(false, true, true)).toEqual({ showX: true, showY: true, showZ: true });

    // In standard 3D viewport: full 3D active
    expect(getGizmoAxes(false, false, false)).toEqual({ showX: true, showY: true, showZ: true });
    expect(getGizmoAxes(false, false, true)).toEqual({ showX: true, showY: true, showZ: true });
  });

  it("computes gizmo writeback translation, rotation, and scale for Grease Pencil in 3D", () => {
    const target = {
      kind: "native" as const,
      objectNodeId: "gp_1",
      deltaSourceNodeId: null,
    };

    const obj = new THREE.Object3D();
    obj.position.set(3, 5, 7);
    obj.rotation.set(0, Math.PI / 4, 0);
    obj.scale.set(2, 2, 2);
    obj.updateMatrix();

    const translatePatch = computeGizmoWriteback({
      target,
      mode: "translate",
      object: obj,
      upstreamMatrix: null,
      wiredSockets: new Set(),
    });
    expect(translatePatch.location).toBeInstanceOf(THREE.Vector3);
    expect(translatePatch.location?.x).toBe(3);
    expect(translatePatch.location?.y).toBe(5);
    expect(translatePatch.location?.z).toBe(7);

    const rotatePatch = computeGizmoWriteback({
      target,
      mode: "rotate",
      object: obj,
      upstreamMatrix: null,
      wiredSockets: new Set(),
    });
    expect(rotatePatch.rotation).toBeInstanceOf(THREE.Vector3);
    expect(rotatePatch.rotation?.y).toBeCloseTo(Math.PI / 4); // in radians

    const scalePatch = computeGizmoWriteback({
      target,
      mode: "scale",
      object: obj,
      upstreamMatrix: null,
      wiredSockets: new Set(),
    });
    expect(scalePatch.scale).toBeInstanceOf(THREE.Vector3);
    expect(scalePatch.scale?.x).toBe(2);
    expect(scalePatch.scale?.y).toBe(2);
    expect(scalePatch.scale?.z).toBe(2);
  });
});
