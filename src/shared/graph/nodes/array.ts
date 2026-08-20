import * as THREE from "three";
import { NodeDefinition, ParamFieldDef } from "../types";
import { createNodeCache } from "../nodeCaches";

const groupCache = createNodeCache<THREE.Group>();

function getGroup(nodeId: string): THREE.Group {
  const existing = groupCache.get(nodeId);
  if (existing) return existing;
  const group = new THREE.Group();
  groupCache.set(nodeId, group);
  return group;
}

/** GLSL-style fract() — deterministic per-index hash, same construct used for lifetime variance elsewhere. */
function fract(x: number): number {
  return x - Math.floor(x);
}

/**
 * Cumulative linear offsets with each gap jittered by up to +/-variance —
 * a per-instance offset jitter (each pole nudged independently) would still
 * leave every *gap* exactly `spacing`, reading as perfectly even poles that
 * merely wobble in place; varying the gap itself, and accumulating, is what
 * actually makes consecutive distances uneven the way real-world spacing is.
 * The hash is a pure function of the gap's own index, not of runtime state,
 * so re-evaluating the same Count/Spacing/Variance always reproduces the
 * same layout.
 */
function linearOffsetsWithVariance(count: number, spacing: number, variance: number): number[] {
  const offsets = [0];
  for (let i = 1; i < count; i++) {
    const rand = fract(Math.sin(i * 78.233) * 43758.5453);
    const gap = spacing * (1 + variance * (rand * 2 - 1));
    offsets.push(offsets[i - 1] + gap);
  }
  return offsets;
}

/**
 * Array node — duplicates a 3D Geometry input multiple times.
 * Supports Linear, Circular, 2D Grid, and 3D Grid Volume arrays.
 */
export const ARRAY_NODE: NodeDefinition = {
  type: "structure/array",
  label: "Array",
  category: "instance",
  inputs: [
    { id: "visible", label: "Visible", type: "value" },
    { id: "geometry", label: "Geometry", type: "geometry", owns: true },
    { id: "count", label: "Count", type: "value" },
    { id: "spacing", label: "Spacing", type: "value" },
    { id: "spacingVariance", label: "Spacing Variance (%)", type: "value" },
    { id: "radius", label: "Radius", type: "value" },
    { id: "countX", label: "Count X", type: "value" },
    { id: "countY", label: "Count Y", type: "value" },
    { id: "countZ", label: "Count Z", type: "value" },
    { id: "spacingX", label: "Spacing X", type: "value" },
    { id: "spacingY", label: "Spacing Y", type: "value" },
    { id: "spacingZ", label: "Spacing Z", type: "value" },
    { id: "curve", label: "Curve", type: "curve" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {
    visible: 1,
    count: 5,
    mode: "linear",
    curveOrient: false,
    axis: "X",
    spacing: 2.0,
    // 0 = every gap is exactly Spacing, same as before this param existed.
    spacingVariance: 0,
    radius: 3.0,
    plane: "XZ",
    totalAngle: 360,
    orient: true,
    gridRows: 3,
    gridCols: 3,
    countX: 3,
    countY: 3,
    countZ: 3,
    spacingX: 2.0,
    spacingY: 2.0,
    spacingZ: 2.0,
    centerGrid: true,
  },
  paramFields: [
    { id: "visible", label: "Visible", kind: "boolean" },
    { id: "mode", label: "Mode", kind: "select", options: ["linear", "circular", "grid", "grid3d", "curve"] },
    { id: "count", label: "Count", kind: "number", step: 1 },
    { id: "axis", label: "Linear Axis", kind: "select", options: ["X", "Y", "Z"] },
    { id: "spacing", label: "Linear Spacing", kind: "number", step: 0.1 },
    { id: "spacingVariance", label: "Spacing Variance (%)", kind: "number", step: 5 },
    { id: "radius", label: "Circular Radius", kind: "number", step: 0.1 },
    { id: "plane", label: "Plane", kind: "select", options: ["XZ", "XY", "YZ"] },
    { id: "totalAngle", label: "Total Angle (°)", kind: "number", step: 15 },
    { id: "orient", label: "Orient to Circle", kind: "boolean" },
    { id: "gridCols", label: "Cols (X)", kind: "number", step: 1 },
    { id: "gridRows", label: "Rows (Y/Z)", kind: "number", step: 1 },
    { id: "countX", label: "Count X", kind: "number", step: 1 },
    { id: "countY", label: "Count Y", kind: "number", step: 1 },
    { id: "countZ", label: "Count Z", kind: "number", step: 1 },
    { id: "spacingX", label: "Spacing X", kind: "number", step: 0.1 },
    { id: "spacingY", label: "Spacing Y/Z", kind: "number", step: 0.1 },
    { id: "spacingZ", label: "Spacing Z", kind: "number", step: 0.1 },
    { id: "centerGrid", label: "Center Grid", kind: "boolean" },
  ],
  dynamicParamFields: (instance) => {
    const mode = String(instance?.params?.mode || "linear");
    const fields: ParamFieldDef[] = [
      { id: "mode", label: "Mode", kind: "select", options: ["linear", "circular", "grid", "grid3d", "curve"], group: "Pattern & Grid" },
    ];

    if (mode === "linear") {
      fields.push(
        { id: "count", label: "Count", kind: "number", step: 1, group: "Pattern & Grid" },
        { id: "axis", label: "Linear Axis", kind: "select", options: ["X", "Y", "Z"], group: "Pattern & Grid" },
        { id: "spacing", label: "Linear Spacing", kind: "number", step: 0.1, group: "Pattern & Grid" },
        { id: "spacingVariance", label: "Spacing Variance (%)", kind: "number", step: 5, group: "Pattern & Grid" },
      );
    } else if (mode === "circular") {
      fields.push(
        { id: "count", label: "Count", kind: "number", step: 1, group: "Pattern & Grid" },
        { id: "radius", label: "Circular Radius", kind: "number", step: 0.1, group: "Pattern & Grid" },
        { id: "plane", label: "Circular Plane", kind: "select", options: ["XZ", "XY", "YZ"], group: "Pattern & Grid" },
        { id: "totalAngle", label: "Total Angle (°)", kind: "number", step: 15, group: "Pattern & Grid" },
        { id: "orient", label: "Orient to Circle", kind: "boolean", group: "Pattern & Grid" },
      );
    } else if (mode === "grid") {
      fields.push(
        { id: "gridCols", label: "Cols (X)", kind: "number", step: 1, group: "Pattern & Grid" },
        { id: "gridRows", label: "Rows (Y/Z)", kind: "number", step: 1, group: "Pattern & Grid" },
        { id: "spacingX", label: "Spacing X", kind: "number", step: 0.1, group: "Pattern & Grid" },
        { id: "spacingY", label: "Spacing Y/Z", kind: "number", step: 0.1, group: "Pattern & Grid" },
        { id: "plane", label: "Grid Plane", kind: "select", options: ["XZ", "XY", "YZ"], group: "Pattern & Grid" },
        { id: "centerGrid", label: "Center Grid", kind: "boolean", group: "Pattern & Grid" },
      );
    } else if (mode === "grid3d") {
      fields.push(
        { id: "countX", label: "Count X", kind: "number", step: 1, group: "Pattern & Grid" },
        { id: "countY", label: "Count Y", kind: "number", step: 1, group: "Pattern & Grid" },
        { id: "countZ", label: "Count Z", kind: "number", step: 1, group: "Pattern & Grid" },
        { id: "spacingX", label: "Spacing X", kind: "number", step: 0.1, group: "Pattern & Grid" },
        { id: "spacingY", label: "Spacing Y", kind: "number", step: 0.1, group: "Pattern & Grid" },
        { id: "spacingZ", label: "Spacing Z", kind: "number", step: 0.1, group: "Pattern & Grid" },
        { id: "centerGrid", label: "Center Grid", kind: "boolean", group: "Pattern & Grid" },
      );
    } else if (mode === "curve") {
      fields.push(
        { id: "count", label: "Count", kind: "number", step: 1, group: "Pattern & Grid" },
        { id: "curveOrient", label: "Orient to Curve", kind: "boolean", group: "Pattern & Grid" },
      );
    }
    return fields;
  },
  evaluate: (inputs, params, ctx) => {
    const group = getGroup(ctx.nodeId);
    group.clear();

    const source = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!source) return { geometry: group };

    const mode = String(params.mode || "linear");

    if (mode === "grid") {
      const rows = Math.max(1, Math.floor(Number(params.gridRows) || 3));
      const cols = Math.max(1, Math.floor(Number(params.gridCols) || 3));
      const spX = inputs.spacingX !== undefined ? Number(inputs.spacingX) : (Number(params.spacingX) || 2.0);
      const spY = inputs.spacingY !== undefined ? Number(inputs.spacingY) : (Number(params.spacingY) || 2.0);
      const plane = String(params.plane || "XZ");
      const center = Boolean(params.centerGrid ?? true);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const clone = source.clone(true);
          const instanceMatrix = new THREE.Matrix4();
          const pos = new THREE.Vector3();

          const offsetX = center ? (c - (cols - 1) / 2) * spX : c * spX;
          const offsetY = center ? (r - (rows - 1) / 2) * spY : r * spY;

          if (plane === "XY") {
            pos.set(offsetX, offsetY, 0);
          } else if (plane === "YZ") {
            pos.set(0, offsetX, offsetY);
          } else {
            // XZ plane (ground)
            pos.set(offsetX, 0, offsetY);
          }

          instanceMatrix.compose(pos, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
          const wrapper = new THREE.Group();
          wrapper.matrixAutoUpdate = false;
          wrapper.matrix.copy(instanceMatrix);
          wrapper.add(clone);

          group.add(wrapper);
        }
      }
      return { geometry: group };
    }

    if (mode === "grid3d") {
      const cX = Math.max(1, Math.floor(inputs.countX !== undefined ? Number(inputs.countX) : (Number(params.countX) || 3)));
      const cY = Math.max(1, Math.floor(inputs.countY !== undefined ? Number(inputs.countY) : (Number(params.countY) || 3)));
      const cZ = Math.max(1, Math.floor(inputs.countZ !== undefined ? Number(inputs.countZ) : (Number(params.countZ) || 3)));
      const spX = inputs.spacingX !== undefined ? Number(inputs.spacingX) : (Number(params.spacingX) || 2.0);
      const spY = inputs.spacingY !== undefined ? Number(inputs.spacingY) : (Number(params.spacingY) || 2.0);
      const spZ = inputs.spacingZ !== undefined ? Number(inputs.spacingZ) : (Number(params.spacingZ) || 2.0);
      const center = Boolean(params.centerGrid ?? true);

      for (let ix = 0; ix < cX; ix++) {
        for (let iy = 0; iy < cY; iy++) {
          for (let iz = 0; iz < cZ; iz++) {
            const clone = source.clone(true);
            const instanceMatrix = new THREE.Matrix4();
            const pos = new THREE.Vector3(
              center ? (ix - (cX - 1) / 2) * spX : ix * spX,
              center ? (iy - (cY - 1) / 2) * spY : iy * spY,
              center ? (iz - (cZ - 1) / 2) * spZ : iz * spZ,
            );

            instanceMatrix.compose(pos, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
            const wrapper = new THREE.Group();
            wrapper.matrixAutoUpdate = false;
            wrapper.matrix.copy(instanceMatrix);
            wrapper.add(clone);

            group.add(wrapper);
          }
        }
      }
      return { geometry: group };
    }

    const rawCount = inputs.count !== undefined ? Number(inputs.count) : Number(params.count);
    const count = Math.max(1, Math.min(500, Math.floor(isNaN(rawCount) ? 5 : rawCount)));

    const curveInput = inputs.curve instanceof THREE.Curve ? (inputs.curve as THREE.Curve<THREE.Vector3>) : null;
    // Arc-length parameterized (getPointAt/getTangentAt), not getPoint(i/count)
    // — evenly spaced by distance along the curve, not by the curve's own
    // (possibly uneven) internal t parameterization. A closed curve's t=0 and
    // t=1 are the same point, so it's divided into `count` steps around the
    // loop with no duplicate at the seam; an open curve is divided into
    // `count - 1` so the first and last instances land exactly on its ends.
    const curveClosed = curveInput ? Boolean((curveInput as unknown as { closed?: boolean }).closed) : false;
    const curveDivisions = curveClosed ? count : Math.max(1, count - 1);

    const rawLinearSpacing = inputs.spacing !== undefined ? Number(inputs.spacing) : Number(params.spacing);
    const linearSpacing = isNaN(rawLinearSpacing) ? 2.0 : rawLinearSpacing;
    const rawSpacingVariance = inputs.spacingVariance !== undefined ? Number(inputs.spacingVariance) : Number(params.spacingVariance);
    const spacingVariance = Math.max(0, Math.min(100, isNaN(rawSpacingVariance) ? 0 : rawSpacingVariance)) / 100;
    const linearOffsets = mode === "linear" ? linearOffsetsWithVariance(count, linearSpacing, spacingVariance) : null;

    for (let i = 0; i < count; i++) {
      const clone = source.clone(true);

      const instanceMatrix = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const rot = new THREE.Euler();
      const scale = new THREE.Vector3(1, 1, 1);
      // Only "curve" mode sets this (tangent alignment isn't expressible as
      // the Euler `rot` every other mode builds) — reset every iteration so
      // a degenerate tangent on one instance can't leak the previous
      // instance's rotation onto it.
      let quatOverride: THREE.Quaternion | null = null;

      if (mode === "curve" && curveInput) {
        const u = curveDivisions > 0 ? i / curveDivisions : 0;
        pos.copy(curveInput.getPointAt(Math.min(1, u)));
        if (Boolean(params.curveOrient)) {
          const tangent = curveInput.getTangentAt(Math.min(1, u));
          if (tangent.lengthSq() > 1e-12) {
            quatOverride = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent.normalize());
          }
        }
      } else if (mode === "linear") {
        const axis = String(params.axis || "X");
        const offset = linearOffsets![i];

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

      instanceMatrix.compose(pos, quatOverride ?? new THREE.Quaternion().setFromEuler(rot), scale);

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
