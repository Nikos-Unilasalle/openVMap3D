import { CALIBRATION_COLOR_A, CALIBRATION_COLOR_B, StoredLines } from "./lines";

interface CalibrationLinesViewProps {
  lines: StoredLines;
  width: number;
  height: number;
  className?: string;
}

/** Pure line render, no handles, no drag — reused by editor overlay (with handles on top) and output window (read-only). */
export function CalibrationLinesView({ lines, width, height, className }: CalibrationLinesViewProps) {
  return (
    <svg className={className} width={width} height={height}>
      {([0, 1] as const).map((line) => (
        <line
          key={`A${line}`}
          className="calibration-line"
          stroke={CALIBRATION_COLOR_A}
          x1={lines.lineSetA[line][0].x}
          y1={lines.lineSetA[line][0].y}
          x2={lines.lineSetA[line][1].x}
          y2={lines.lineSetA[line][1].y}
        />
      ))}
      {([0, 1] as const).map((line) => (
        <line
          key={`B${line}`}
          className="calibration-line"
          stroke={CALIBRATION_COLOR_B}
          x1={lines.lineSetB[line][0].x}
          y1={lines.lineSetB[line][0].y}
          x2={lines.lineSetB[line][1].x}
          y2={lines.lineSetB[line][1].y}
        />
      ))}
    </svg>
  );
}
