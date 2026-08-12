import { LineSegment, Point2D } from "./vanishingPoint";

export type LineSet = [LineSegment, LineSegment];

export interface StoredLines {
  lineSetA: LineSet;
  lineSetB: LineSet;
}

export const CALIBRATION_COLOR_A = "#f43f5e";
export const CALIBRATION_COLOR_B = "#38bdf8";

/** Relative (0..1) starting layout — deliberately spread and non-parallel so there's always a valid solve before the operator has touched anything. */
export const DEFAULT_RELATIVE_LINES: StoredLines = {
  lineSetA: [
    [{ x: 0.3, y: 0.62 }, { x: 0.45, y: 0.25 }],
    [{ x: 0.58, y: 0.6 }, { x: 0.5, y: 0.24 }],
  ],
  lineSetB: [
    [{ x: 0.18, y: 0.4 }, { x: 0.72, y: 0.32 }],
    [{ x: 0.18, y: 0.56 }, { x: 0.72, y: 0.5 }],
  ],
};

function mapPoints(lines: StoredLines, fn: (p: Point2D) => Point2D): StoredLines {
  const mapSet = (set: LineSet): LineSet => [
    [fn(set[0][0]), fn(set[0][1])],
    [fn(set[1][0]), fn(set[1][1])],
  ];
  return { lineSetA: mapSet(lines.lineSetA), lineSetB: mapSet(lines.lineSetB) };
}

/** Resolution-independent storage (relative 0..1) -> pixel space for whichever container is currently displaying them. */
export function toPixels(lines: StoredLines, width: number, height: number): StoredLines {
  return mapPoints(lines, (p) => ({ x: p.x * width, y: p.y * height }));
}

export function toRelative(lines: StoredLines, width: number, height: number): StoredLines {
  return mapPoints(lines, (p) => ({ x: p.x / width, y: p.y / height }));
}

export function isStoredLines(value: unknown): value is StoredLines {
  return !!value && typeof value === "object" && "lineSetA" in (value as object) && "lineSetB" in (value as object);
}
