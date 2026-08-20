import * as THREE from "three";
import { NodeDefinition } from "../types";

function numberInput(input: unknown, param: unknown, fallback: number): number {
  const raw = input !== undefined ? input : param;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Points from Geometry Node — the read side of the x/y/z-list convention
 * Point Cloud, CSV Reader, and Particle Emitter (From Points) all share:
 * walks every mesh under the input geometry and hands back its *actual*
 * vertices as three flat lists, world-space (each mesh's matrixWorld is
 * applied, so a Transform upstream is reflected here rather than silently
 * dropped). The complement of Sample Surface (physics/sample), which
 * scatters random *area-weighted* points across a surface instead of
 * reading the mesh's own vertices — this node is for round-tripping real
 * geometry into the list/point-cloud world, not generating new points.
 *
 * Downsampled by even stride (not truncated) past Max Points so a coarse
 * cap still represents the whole mesh rather than just its first N
 * vertices in whatever order the geometry happens to store them.
 */
export const GEOMETRY_TO_POINTS_NODE: NodeDefinition = {
  type: "list/points-from-geometry",
  label: "Vertices to Points",
  category: "list",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "maxPoints", label: "Max Points", type: "value" },
  ],
  outputs: [
    { id: "xValues", label: "X Values (List)", type: "list" },
    { id: "yValues", label: "Y Values (List)", type: "list" },
    { id: "zValues", label: "Z Values (List)", type: "list" },
    { id: "count", label: "Count", type: "value" },
  ],
  defaultParams: { maxPoints: 2000 },
  paramFields: [{ id: "maxPoints", label: "Max Points", kind: "number", step: 100 }],
  evaluate: (inputs, params) => {
    const object = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!object) return { xValues: [], yValues: [], zValues: [], count: 0 };

    const maxPoints = Math.max(1, Math.min(100000, Math.round(numberInput(inputs.maxPoints, params.maxPoints, 2000))));

    const points: THREE.Vector3[] = [];
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.geometry?.attributes?.position) return;
      // updateWorldMatrix (NOT updateMatrix): graph-driven meshes carry their
      // pose in `matrix` with matrixAutoUpdate off — updateMatrix() would
      // recompute `matrix` from the untouched defaults and destroy it.
      child.updateWorldMatrix(true, false, true);
      const position = child.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < position.count; i++) {
        points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld));
      }
    });

    let sampled = points;
    if (points.length > maxPoints) {
      const stride = points.length / maxPoints;
      sampled = Array.from({ length: maxPoints }, (_, i) => points[Math.floor(i * stride)]);
    }

    return {
      xValues: sampled.map((p) => p.x),
      yValues: sampled.map((p) => p.y),
      zValues: sampled.map((p) => p.z),
      count: sampled.length,
    };
  },
};
