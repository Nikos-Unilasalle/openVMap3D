import * as THREE from "three";
import { NodeDefinition } from "../types";

function numberInput(input: unknown, param: unknown, fallback: number): number {
  const raw = input !== undefined ? input : param;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Curve to Points — samples a Curve socket into a flat point list, capped at
 * Max Points. Arc-length spaced (getSpacedPoints), not parameter-uniform
 * (getPoints): a curve built from unevenly-spaced control points, or one
 * with a sharp bend, would otherwise bunch samples up wherever the curve's
 * own parameterization moves slowly and leave long, under-sampled gaps
 * elsewhere — same reasoning as Array's "curve" mode (see array.ts).
 *
 * Outputs both conventions this app's point-list nodes split across: a
 * `points` list of Vector3 (what Curve from Points / Curve Subdivide's own
 * `points` input reads) and flat xValues/yValues/zValues (what Point
 * Emitter / CSV Reader's convention expects) — so this plugs straight into
 * either family without an extra converter node in between.
 */
export const CURVE_TO_POINTS_NODE: NodeDefinition = {
  type: "curve/to_points",
  label: "Curve to Points",
  category: "curve",
  inputs: [
    { id: "curve", label: "Curve", type: "curve" },
    { id: "maxPoints", label: "Max Points", type: "value" },
  ],
  outputs: [
    { id: "points", label: "Points", type: "list" },
    { id: "xValues", label: "X Values (List)", type: "list" },
    { id: "yValues", label: "Y Values (List)", type: "list" },
    { id: "zValues", label: "Z Values (List)", type: "list" },
    { id: "count", label: "Count", type: "value" },
  ],
  defaultParams: { maxPoints: 100 },
  paramFields: [{ id: "maxPoints", label: "Max Points", kind: "number", step: 10 }],
  evaluate: (inputs, params) => {
    const curve = inputs.curve instanceof THREE.Curve ? (inputs.curve as THREE.Curve<THREE.Vector3>) : null;
    if (!curve) return { points: [], xValues: [], yValues: [], zValues: [], count: 0 };

    const maxPoints = Math.max(2, Math.min(10000, Math.round(numberInput(inputs.maxPoints, params.maxPoints, 100))));
    const points = curve.getSpacedPoints(maxPoints - 1);

    return {
      points,
      xValues: points.map((p) => p.x),
      yValues: points.map((p) => p.y),
      zValues: points.map((p) => p.z),
      count: points.length,
    };
  },
};
