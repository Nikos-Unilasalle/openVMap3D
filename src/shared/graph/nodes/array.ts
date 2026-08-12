import * as THREE from "three";
import { NodeDefinition } from "../types";

const groupCache = new Map<string, THREE.Group>();

function getGroup(nodeId: string): THREE.Group {
  const existing = groupCache.get(nodeId);
  if (existing) return existing;
  const group = new THREE.Group();
  groupCache.set(nodeId, group);
  return group;
}

/**
 * Array node — duplicates a 3D Geometry input multiple times.
 * Supports Linear array (with axis selection & spacing) and Circular array (with plane, radius & radial orientation).
 */
export const ARRAY_NODE: NodeDefinition = {
  type: "structure/array",
  label: "Array",
  category: "structure",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "count", label: "Count", type: "value" },
    { id: "spacing", label: "Spacing", type: "value" },
    { id: "radius", label: "Radius", type: "value" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {
    count: 5,
    mode: "linear",
    axis: "X",
    spacing: 2.0,
    radius: 3.0,
    plane: "XZ",
    totalAngle: 360,
    orient: true,
  },
  paramFields: [
    { id: "count", label: "Count", kind: "number", step: 1 },
    { id: "mode", label: "Mode", kind: "select", options: ["linear", "circular"] },
    { id: "axis", label: "Linear Axis", kind: "select", options: ["X", "Y", "Z"] },
    { id: "spacing", label: "Linear Spacing", kind: "number", step: 0.1 },
    { id: "radius", label: "Circular Radius", kind: "number", step: 0.1 },
    { id: "plane", label: "Circular Plane", kind: "select", options: ["XZ", "XY", "YZ"] },
    { id: "totalAngle", label: "Total Angle (°)", kind: "number", step: 15 },
    { id: "orient", label: "Orient to Circle", kind: "boolean" },
  ],
  evaluate: (inputs, params, ctx) => {
    const group = getGroup(ctx.nodeId);
    group.clear();

    const source = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!source) return { geometry: group };

    const rawCount = inputs.count !== undefined ? Number(inputs.count) : Number(params.count);
    const count = Math.max(1, Math.min(500, Math.floor(isNaN(rawCount) ? 5 : rawCount)));

    const mode = String(params.mode || "linear");

    for (let i = 0; i < count; i++) {
      const clone = source.clone(true);

      const instanceMatrix = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const rot = new THREE.Euler();
      const scale = new THREE.Vector3(1, 1, 1);

      if (mode === "linear") {
        const axis = String(params.axis || "X");
        const rawSpacing = inputs.spacing !== undefined ? Number(inputs.spacing) : Number(params.spacing);
        const spacing = isNaN(rawSpacing) ? 2.0 : rawSpacing;
        const offset = i * spacing;

        if (axis === "Y") {
          pos.set(0, offset, 0);
        } else if (axis === "Z") {
          pos.set(0, 0, offset);
        } else {
          // X Axis default
          pos.set(offset, 0, 0);
        }
      } else if (mode === "circular") {
        const rawRadius = inputs.radius !== undefined ? Number(inputs.radius) : Number(params.radius);
        const radius = isNaN(rawRadius) ? 3.0 : rawRadius;
        const plane = String(params.plane || "XZ");
        const totalAngleDeg = Number(params.totalAngle) || 360;
        const orient = Boolean(params.orient ?? true);

        const totalAngleRad = (totalAngleDeg * Math.PI) / 180;
        const stepAngleRad =
          count > 1 && totalAngleDeg < 360
            ? totalAngleRad / (count - 1)
            : totalAngleRad / count;

        const angle = i * stepAngleRad;

        if (plane === "XY") {
          pos.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
          if (orient) rot.z = angle;
        } else if (plane === "YZ") {
          pos.set(0, Math.cos(angle) * radius, Math.sin(angle) * radius);
          if (orient) rot.x = angle;
        } else {
          // XZ plane default (ground plane)
          pos.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
          if (orient) rot.y = -angle + Math.PI / 2;
        }
      }

      instanceMatrix.compose(pos, new THREE.Quaternion().setFromEuler(rot), scale);

      // Wrapper group ensures position/orientation applies cleanly over cloned objects
      const wrapper = new THREE.Group();
      wrapper.matrixAutoUpdate = false;
      wrapper.matrix.copy(instanceMatrix);
      wrapper.add(clone);

      group.add(wrapper);
    }

    return { geometry: group };
  },
};
