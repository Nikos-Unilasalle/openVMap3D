import { CalibrationPicks } from "./picks";
import { HANDLE_EDGES, ReferencePoint, referencePointColor } from "./roomCorner";
import { Point2D } from "./types";

export function toPixels(pick: Point2D, width: number, height: number): Point2D {
  return { x: pick.x * width, y: pick.y * height };
}

export function toRelative(pixel: Point2D, width: number, height: number): Point2D {
  return { x: pixel.x / width, y: pixel.y / height };
}

interface CalibrationHandlesViewProps {
  points: ReferencePoint[];
  picks: CalibrationPicks;
  width: number;
  height: number;
  /** Labels are for the operator at the keyboard; the projected copy leaves them off so they aren't thrown on the wall. */
  showLabels?: boolean;
}

/**
 * The reference corner as the operator sees it: two wall quads sharing the
 * vertical corner edge, one draggable handle per real room corner.
 *
 * Pure render, no interaction — the editor overlay layers its drag handling
 * on top of this, and the output window draws the very same thing read-only,
 * because aligning against the physical room is only possible while looking
 * at the actual projection.
 */
export function CalibrationHandlesView({
  points,
  picks,
  width,
  height,
  showLabels = false,
}: CalibrationHandlesViewProps) {
  const pixelOf = (id: string): Point2D | null => {
    const pick = picks[id];
    return pick ? toPixels(pick, width, height) : null;
  };

  return (
    <svg className="calibration-overlay-svg" width={width} height={height}>
      {HANDLE_EDGES.map(({ from, to, color }) => {
        const a = pixelOf(from);
        const b = pixelOf(to);
        if (!a || !b) return null;
        return (
          <line
            key={`${from}-${to}`}
            className="calibration-line"
            stroke={color}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
          />
        );
      })}
      {points.map((point) => {
        const at = pixelOf(point.id);
        if (!at) return null;
        return (
          <g key={point.id}>
            <circle
              className="calibration-handle-dot"
              cx={at.x}
              cy={at.y}
              r={6}
              fill={referencePointColor(point.id)}
            />
            {showLabels && (
              <text className="calibration-handle-label" x={at.x + 11} y={at.y + 4}>
                {point.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
