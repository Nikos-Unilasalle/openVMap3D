/**
 * A 1-D profile curve: normalized control points plus the interpolation that
 * reads a value off them. Used as a param kind ("curve_profile"), currently by
 * Curve to Mesh's variable thickness.
 *
 * Lives here rather than next to its editor because node `evaluate()` runs in
 * both windows and in headless tests — a graph node must never have to import
 * a React component to read one of its own params.
 */

export interface ProfilePoint {
  /** 0 to 1 along the curve. */
  x: number;
  /** 0 to 1 multiplier at that point. */
  y: number;
}

export const DEFAULT_PROFILE_POINTS: ProfilePoint[] = [
  { x: 0.0, y: 0.1 },
  { x: 0.35, y: 0.9 },
  { x: 1.0, y: 0.2 },
];

/** Evaluates a profile curve at parameter t in [0, 1] using smooth interpolation */
export function evalProfileCurve(points: ProfilePoint[] | undefined | null, t: number): number {
  const pts = points && points.length >= 2 ? points : DEFAULT_PROFILE_POINTS;
  const sorted = [...pts].sort((a, b) => a.x - b.x);

  const clampedT = Math.max(0, Math.min(1, t));

  if (clampedT <= sorted[0].x) return sorted[0].y;
  if (clampedT >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;

  // Find segment
  let idx = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (clampedT >= sorted[i].x && clampedT <= sorted[i + 1].x) {
      idx = i;
      break;
    }
  }

  const p0 = sorted[Math.max(0, idx - 1)];
  const p1 = sorted[idx];
  const p2 = sorted[idx + 1];
  const p3 = sorted[Math.min(sorted.length - 1, idx + 2)];

  const span = p2.x - p1.x;
  if (span <= 1e-6) return p1.y;

  const localT = (clampedT - p1.x) / span;

  // Cubic Hermite (Catmull-Rom) interpolation for smooth curve
  const m0 = idx > 0 ? ((p2.y - p0.y) / (p2.x - p0.x || 1)) * span : p2.y - p1.y;
  const m1 = idx < sorted.length - 2 ? ((p3.y - p1.y) / (p3.x - p1.x || 1)) * span : p2.y - p1.y;

  const t2 = localT * localT;
  const t3 = t2 * localT;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + localT;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  const val = h00 * p1.y + h10 * m0 + h01 * p2.y + h11 * m1;
  return Math.max(0, Math.min(1, val));
}
