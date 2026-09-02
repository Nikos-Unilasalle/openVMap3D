import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { NodeDefinition, ParamFieldDef } from "../types";
import { getCurveNodePose } from "../curvePoseStore";
import { COMMON_MATERIAL_PARAM_FIELDS, extractMaterialParams, primitiveOutputs } from "./object";
import { composeNativeMatrixWithShowPivot, applyPivotCross, PIVOT_DEFAULT_PARAMS } from "./transform";

function asNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Arc length of a sampled point polyline. */
function computeTotalLength(points: THREE.Vector3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += points[i].distanceTo(points[i - 1]);
  }
  return total > 0 ? total : 1;
}

/**
 * The dash shader reads `instanceDistanceStart`/`instanceDistanceEnd` (the
 * cumulative arc-length at each segment's ends), but LineGeometry.setFromPoints
 * only builds instanceStart/End — without these attributes the line renders
 * solid no matter the dash settings. Same helper the webgl_lines_fat example
 * uses. Must run after every setFromPoints (a rebuild replaces the instance
 * buffers, leaving stale distance counts behind otherwise).
 */
function computeLineDistances(geometry: LineGeometry): void {
  const start = geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
  const end = geometry.attributes.instanceEnd as THREE.InterleavedBufferAttribute;
  const count = start.count;
  const distances = [0];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const dx = end.getX(i) - start.getX(i);
    const dy = end.getY(i) - start.getY(i);
    const dz = end.getZ(i) - start.getZ(i);
    total += Math.sqrt(dx * dx + dy * dy + dz * dz);
    distances.push(total);
  }
  const startDist = new Float32Array(count);
  const endDist = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    startDist[i] = distances[i];
    endDist[i] = distances[i + 1];
  }
  // Must be InstancedBufferAttribute (divisor 1): the shader reads these per
  // segment. A plain BufferAttribute is shared across every instance, so every
  // segment saw the same distance and the dash pattern collapsed.
  geometry.setAttribute("instanceDistanceStart", new THREE.InstancedBufferAttribute(startDist, 1));
  geometry.setAttribute("instanceDistanceEnd", new THREE.InstancedBufferAttribute(endDist, 1));
}

interface LineState {
  line?: Line2;
  material?: LineMaterial;
  /** Skips rebuilding the LineGeometry when the sampled points are unchanged. */
  geometrySignature?: string;
  lastDashed?: boolean;
  lastWorldUnits?: boolean;
}

const lineCache = createNodeCache<LineState>((s) => {
  if (s.line) disposeObject3D(s.line);
});

function getState(nodeId: string): LineState {
  let state = lineCache.get(nodeId);
  if (!state) {
    state = {};
    lineCache.set(nodeId, state);
  }
  return state;
}

const LINE_TRANSFORM_INPUT = { id: "matrix", label: "Matrix", type: "matrix" as const };
const LINE_VISIBLE_INPUT = { id: "visible", label: "Visible", type: "value" as const };

const LINE_TRANSFORM_DEFAULTS = {
  visible: 1,
  location: new THREE.Vector3(0, 0, 0),
  rotation: new THREE.Vector3(0, 0, 0),
  scale: new THREE.Vector3(1, 1, 1),
};

function lineTransformFields(): ParamFieldDef[] {
  return [
    { id: "visible", label: "Visible", kind: "boolean", group: "Transform" },
    { id: "location", label: "Location", kind: "vector", group: "Transform" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true, group: "Transform" },
    { id: "scale", label: "Scale", kind: "vector", group: "Transform" },
  ];
}

/**
 * Curve to Line — renders a curve as a fat, screen-space-width line (three's
 * Line2/LineMaterial, the webgl_lines_fat technique) instead of a tube. Supports
 * adjustable width, dashed strokes, world-units mode and a basic material.
 */
export const CURVE_TO_LINE_NODE: NodeDefinition = {
  type: "curve/to_line",
  label: "Curve to Line",
  category: "curve",
  inputs: [
    { id: "curve", label: "Curve", type: "curve" },
    { id: "material", label: "Material", type: "material" },
    LINE_TRANSFORM_INPUT,
    LINE_VISIBLE_INPUT,
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  defaultParams: {
    ...PIVOT_DEFAULT_PARAMS,
    ...LINE_TRANSFORM_DEFAULTS,
    linewidth: 2,
    dashed: false,
    dashRatio: 0.08,
    gapRatio: 0.04,
    dashSize: 3,
    gapSize: 1,
    dashScale: 1,
    worldUnits: false,
    color: new THREE.Color(0x38bdf8),
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 1.0,
    shadeless: 0,
    roughness: 0.4,
    metalness: 0.1,
    wireframe: 0,
    opacity: 1.0,
  },
  dynamicParamFields: () => [
    ...lineTransformFields(),
    { id: "linewidth", label: "Width", kind: "number", step: 0.1, group: "Line" },
    { id: "dashed", label: "Dashed", kind: "boolean", group: "Line" },
    { id: "dashRatio", label: "Dash % of curve length", kind: "number", step: 0.01, group: "Line" },
    { id: "gapRatio", label: "Gap % of curve length", kind: "number", step: 0.01, group: "Line" },
    { id: "worldUnits", label: "World Units (width in scene units)", kind: "boolean", group: "Line" },
    ...COMMON_MATERIAL_PARAM_FIELDS.filter((f) => f.id !== "transmission" && f.id !== "thickness"),
  ],
  evaluate: (inputs, params, ctx) => {
    const curve = inputs.curve instanceof THREE.Curve ? inputs.curve : null;
    if (!curve) return { geometry: null };

    const state = getState(ctx.nodeId);

    if (!state.material) state.material = new LineMaterial({ color: 0xffffff, transparent: true });
    if (!state.line) {
      state.line = new Line2(new LineGeometry(), state.material);
      state.line.matrixAutoUpdate = false;
      // The fat-line geometry is instanced; its bounding sphere is easily stale
      // or off, which frustum-culls the line and visually truncates it (and any
      // dash). Always draw it.
      state.line.frustumCulled = false;
      state.line.userData.nodeId = ctx.nodeId;
    }
    const material = state.material;
    const line = state.line;

    // Rebuild geometry only when the sampled points change. Fixed sampling —
    // the line is a polyline, and the number of points doesn't change its
    // extent (a "segments" knob only confused: more samples should never
    // truncate the curve).
    const points = curve.getPoints(256);
    const signature = JSON.stringify(points.map((p) => [p.x, p.y, p.z]));
    if (signature !== state.geometrySignature) {
      state.geometrySignature = signature;
      (line.geometry as LineGeometry).setFromPoints(points);
      computeLineDistances(line.geometry as LineGeometry);
    }

    // Material: a wired Material node wins (color/emissive/opacity, …). The
    // unlit line has no lighting, so roughness/metalness/shadeless/wireframe
    // don't apply; emissive is added to the colour (a glow). No texture.
    const matParams = extractMaterialParams(inputs, params);
    const lineColor = matParams.color.clone().add(matParams.emissive.clone().multiplyScalar(matParams.emissiveIntensity));
    material.color.set(lineColor);
    const opacity = Math.min(1, Math.max(0, matParams.opacity));
    material.uniforms.opacity.value = opacity;
    material.transparent = opacity < 0.999;
    material.linewidth = Math.max(0.1, asNumber(params.linewidth, 2));

    // Dash sizes are in world units along the curve. Tuning raw lengths is
    // guesswork, so the default is a fraction of the curve's total length.
    const dashRatio = Number(params.dashRatio);
    let dashSize = asNumber(params.dashSize, 3);
    let gapSize = asNumber(params.gapSize, 1);
    let dashScale = asNumber(params.dashScale, 1);
    if (Number.isFinite(dashRatio) && dashRatio > 0) {
      const totalLength = computeTotalLength(points);
      const gapRatioNum = Number(params.gapRatio);
      const gapRatio = Number.isFinite(gapRatioNum) && gapRatioNum >= 0 ? gapRatioNum : dashRatio * 0.5;
      dashSize = Math.max(0.0001, dashRatio * totalLength);
      gapSize = Math.max(0, gapRatio * totalLength);
      dashScale = 1;
    }
    material.dashScale = dashScale;
    material.dashSize = dashSize;
    material.gapSize = gapSize;
    const dashed = Boolean(params.dashed);
    if (state.lastDashed !== dashed) {
      state.lastDashed = dashed;
      material.dashed = dashed;
      material.needsUpdate = true; // toggles USE_DASH -> recompile
    }
    const worldUnits = Boolean(params.worldUnits);
    if (state.lastWorldUnits !== worldUnits) {
      state.lastWorldUnits = worldUnits;
      material.worldUnits = worldUnits;
      material.needsUpdate = true;
    }

    // Width is screen-space unless worldUnits — LineMaterial needs the viewport
    // resolution. Default to 1920x1080 so a headless evaluate still works, and
    // never let a zero (not-yet-sized) renderer zero it out.
    const size = new THREE.Vector2(1920, 1080);
    if (ctx.renderer) {
      ctx.renderer.getSize(size);
      if (size.x <= 0 || size.y <= 0) size.set(1920, 1080);
    }
    material.resolution.copy(size);

    // Native pose × the source curve node's pose (so the line follows the
    // curve's gizmo), keeping the geometry in the curve's local space.
    if (ctx.nodeId !== ctx.liveEditNodeId) {
      line.matrix.copy(composeNativeMatrixWithShowPivot(inputs.matrix, params));
      applyPivotCross(line, params);
      const curveSourceId = ctx.inputSources?.get("curve");
      const curvePose = curveSourceId ? getCurveNodePose(curveSourceId) : null;
      if (curvePose) line.matrix.multiply(curvePose);
    }

    return primitiveOutputs(line);
  },
};
