import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { NodeDefinition, ParamFieldDef } from "../types";
import { getCurveNodePose } from "../curvePoseStore";
import { asColor, primitiveOutputs } from "./object";
import { composeNativeMatrix } from "./transform";

function asNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

const LINE_TRANSFORM_DEFAULTS = {
  location: new THREE.Vector3(0, 0, 0),
  rotation: new THREE.Vector3(0, 0, 0),
  scale: new THREE.Vector3(1, 1, 1),
};

function lineTransformFields(): ParamFieldDef[] {
  return [
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
    LINE_TRANSFORM_INPUT,
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  defaultParams: {
    ...LINE_TRANSFORM_DEFAULTS,
    linewidth: 2,
    dashed: false,
    dashSize: 3,
    gapSize: 1,
    dashScale: 1,
    worldUnits: false,
    segments: 128,
    color: new THREE.Color(0x38bdf8),
    opacity: 1.0,
  },
  dynamicParamFields: () => [
    ...lineTransformFields(),
    { id: "linewidth", label: "Width", kind: "number", step: 0.1, group: "Line" },
    { id: "dashed", label: "Dashed", kind: "boolean", group: "Line" },
    { id: "dashSize", label: "Dash Size", kind: "number", step: 0.5, group: "Line" },
    { id: "gapSize", label: "Gap Size", kind: "number", step: 0.5, group: "Line" },
    { id: "dashScale", label: "Dash Scale", kind: "number", step: 0.1, group: "Line" },
    { id: "worldUnits", label: "World Units (width in scene units)", kind: "boolean", group: "Line" },
    { id: "segments", label: "Segments", kind: "number", step: 8, group: "Line" },
    { id: "color", label: "Color", kind: "color", group: "Material" },
    { id: "opacity", label: "Opacity", kind: "number", step: 0.05, group: "Material" },
  ],
  evaluate: (inputs, params, ctx) => {
    const curve = inputs.curve instanceof THREE.Curve ? inputs.curve : null;
    if (!curve) return { geometry: null };

    const state = getState(ctx.nodeId);

    if (!state.material) state.material = new LineMaterial({ color: 0xffffff, transparent: true });
    if (!state.line) {
      state.line = new Line2(new LineGeometry(), state.material);
      state.line.matrixAutoUpdate = false;
      state.line.userData.nodeId = ctx.nodeId;
    }
    const material = state.material;
    const line = state.line;

    // Rebuild geometry only when the sampled points change.
    const segments = Math.max(2, Math.round(asNumber(params.segments, 128)));
    const points = curve.getPoints(segments);
    const signature = JSON.stringify(points.map((p) => [p.x, p.y, p.z]));
    if (signature !== state.geometrySignature) {
      state.geometrySignature = signature;
      (line.geometry as LineGeometry).setFromPoints(points);
    }

    // Material: colour, opacity, width, dashes.
    material.color.set(asColor(inputs.color, asColor(params.color, new THREE.Color(0x38bdf8))));
    const opacity = Math.min(1, Math.max(0, asNumber(inputs.opacity, asNumber(params.opacity, 1))));
    material.uniforms.opacity.value = opacity;
    material.transparent = opacity < 0.999;
    material.linewidth = Math.max(0.1, asNumber(params.linewidth, 2));
    material.dashScale = Math.max(0, asNumber(params.dashScale, 1));
    material.dashSize = Math.max(0.1, asNumber(params.dashSize, 3));
    material.gapSize = Math.max(0, asNumber(params.gapSize, 1));
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
    // resolution. Default to 1920x1080 so a headless evaluate still works.
    const size = new THREE.Vector2(1920, 1080);
    if (ctx.renderer) ctx.renderer.getSize(size);
    material.resolution.copy(size);

    // Native pose × the source curve node's pose (so the line follows the
    // curve's gizmo), keeping the geometry in the curve's local space.
    if (ctx.nodeId !== ctx.liveEditNodeId) {
      line.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
      const curveSourceId = ctx.inputSources?.get("curve");
      const curvePose = curveSourceId ? getCurveNodePose(curveSourceId) : null;
      if (curvePose) line.matrix.multiply(curvePose);
    }

    return primitiveOutputs(line);
  },
};
