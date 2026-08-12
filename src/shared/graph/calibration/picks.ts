import { Correspondence, ProjectorCalibration, solveProjectorCalibration } from "./dlt";
import { ReferencePoint } from "./roomCorner";
import { Point2D } from "./types";

/**
 * Where the operator has dragged each reference point, keyed by the point's
 * id, in *relative* (0..1) image coordinates.
 *
 * Relative rather than pixels on purpose, and it costs nothing: the whole
 * calibration is scale-free, because every place a focal length is used it
 * is divided by a coordinate measured in the same units (see
 * projectionMatrixFromCalibration). So the same stored picks describe the
 * same projector whether they were made on a 1920x1080 output or read back
 * in a half-size editor preview, and no resolution needs storing anywhere.
 */
export type CalibrationPicks = Record<string, Point2D>;

/**
 * A plausible corner view to start from — the vertical corner up the middle,
 * one wall falling away to each side. Starting from something roughly
 * corner-shaped means the first drag is a correction, not a search.
 */
export const DEFAULT_PICKS: CalibrationPicks = {
  "corner-floor": { x: 0.5, y: 0.78 },
  "corner-ceiling": { x: 0.5, y: 0.22 },
  "wallA-floor": { x: 0.92, y: 0.88 },
  "wallA-ceiling": { x: 0.92, y: 0.12 },
  "wallB-floor": { x: 0.08, y: 0.88 },
  "wallB-ceiling": { x: 0.08, y: 0.12 },
};

export function isReferencePointArray(value: unknown): value is ReferencePoint[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((p) => !!p && typeof p === "object" && "id" in p && "world" in p)
  );
}

export function isCalibrationPicks(value: unknown): value is CalibrationPicks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (p) => !!p && typeof p === "object" && typeof (p as Point2D).x === "number" && typeof (p as Point2D).y === "number",
  );
}

/** Pairs each reference point with wherever it has been dragged to. Points with no pick yet are skipped, not guessed. */
export function correspondencesFromPicks(
  points: ReferencePoint[],
  picks: CalibrationPicks,
): Correspondence[] {
  const correspondences: Correspondence[] = [];
  for (const point of points) {
    const pick = picks[point.id];
    if (!pick) continue;
    correspondences.push({ world: point.world, image: pick });
  }
  return correspondences;
}

/** Solves in relative image units, which is why width and height are both 1 here. */
export function solveFromPicks(
  points: ReferencePoint[],
  picks: CalibrationPicks,
): ProjectorCalibration | null {
  return solveProjectorCalibration(correspondencesFromPicks(points, picks), 1, 1);
}
