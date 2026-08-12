import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CalibrationLinesView } from "../shared/graph/calibration/CalibrationLinesView";
import {
  CALIBRATION_COLOR_A,
  CALIBRATION_COLOR_B,
  DEFAULT_RELATIVE_LINES,
  StoredLines,
  isStoredLines,
  toPixels,
  toRelative,
} from "../shared/graph/calibration/lines";
import { solveTwoPointCalibration } from "../shared/graph/calibration/vanishingPoint";
import "./calibration-overlay.css";

interface CalibrationOverlayProps {
  /** The Camera node's own current params — read the persisted line layout, if any, from here. */
  storedLines: unknown;
  onChange: (paramId: string, value: unknown) => void;
}

/**
 * Manual Alignment's actual interaction (BIBLE.md's Calibration section):
 * drag reference lines directly over the live view until they match real
 * room edges, live — not a photo, not scrubbed numbers. Two line sets (2
 * lines each) give two vanishing points; solveTwoPointCalibration turns
 * those into the Camera node's Rotation + FOV, recomputed on every drag.
 */
export function CalibrationOverlay({ storedLines, onChange }: CalibrationOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [lines, setLines] = useState<StoredLines | null>(null);
  const [invalid, setInvalid] = useState(false);
  const dragging = useRef<{ set: "lineSetA" | "lineSetB"; line: 0 | 1; point: 0 | 1 } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  // Seed from stored (relative) positions once we know the container's
  // actual pixel size — resolution-independent storage, pixel-space editing.
  useEffect(() => {
    if (size.width === 0 || size.height === 0 || lines) return;
    const relative = isStoredLines(storedLines) ? storedLines : DEFAULT_RELATIVE_LINES;
    setLines(toPixels(relative, size.width, size.height));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const commit = (next: StoredLines) => {
    setLines(next);
    const result = solveTwoPointCalibration(next.lineSetA, next.lineSetB, size.width, size.height);
    if (!result) {
      setInvalid(true);
      onChange("calibrationLines", toRelative(next, size.width, size.height));
      return;
    }
    setInvalid(false);
    const euler = new THREE.Euler().setFromQuaternion(result.quaternion);
    onChange("rotation", new THREE.Vector3(euler.x, euler.y, euler.z));
    onChange("fov", result.fovDegrees);
    onChange("calibrationLines", toRelative(next, size.width, size.height));
  };

  if (!lines) {
    return <div ref={containerRef} className="calibration-overlay" />;
  }

  const handles: { set: "lineSetA" | "lineSetB"; line: 0 | 1; point: 0 | 1; color: string }[] = [
    { set: "lineSetA", line: 0, point: 0, color: CALIBRATION_COLOR_A },
    { set: "lineSetA", line: 0, point: 1, color: CALIBRATION_COLOR_A },
    { set: "lineSetA", line: 1, point: 0, color: CALIBRATION_COLOR_A },
    { set: "lineSetA", line: 1, point: 1, color: CALIBRATION_COLOR_A },
    { set: "lineSetB", line: 0, point: 0, color: CALIBRATION_COLOR_B },
    { set: "lineSetB", line: 0, point: 1, color: CALIBRATION_COLOR_B },
    { set: "lineSetB", line: 1, point: 0, color: CALIBRATION_COLOR_B },
    { set: "lineSetB", line: 1, point: 1, color: CALIBRATION_COLOR_B },
  ];

  return (
    <div ref={containerRef} className="calibration-overlay">
      {invalid && <div className="calibration-overlay-warning">Lines too close to parallel — adjust</div>}
      <CalibrationLinesView className="calibration-overlay-svg" lines={lines} width={size.width} height={size.height} />
      <svg className="calibration-overlay-svg" width={size.width} height={size.height}>
        {handles.map(({ set, line, point, color }) => {
          const pos = lines[set][line][point];
          return (
            <circle
              key={`${set}${line}${point}`}
              className="calibration-handle"
              cx={pos.x}
              cy={pos.y}
              r={7}
              fill={color}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                dragging.current = { set, line, point };
              }}
              onPointerMove={(e) => {
                if (!dragging.current || !containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                const { set: dSet, line: dLine, point: dPoint } = dragging.current;
                const next: StoredLines = {
                  lineSetA: [
                    [{ ...lines.lineSetA[0][0] }, { ...lines.lineSetA[0][1] }],
                    [{ ...lines.lineSetA[1][0] }, { ...lines.lineSetA[1][1] }],
                  ],
                  lineSetB: [
                    [{ ...lines.lineSetB[0][0] }, { ...lines.lineSetB[0][1] }],
                    [{ ...lines.lineSetB[1][0] }, { ...lines.lineSetB[1][1] }],
                  ],
                };
                next[dSet][dLine][dPoint] = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                commit(next);
              }}
              onPointerUp={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId);
                dragging.current = null;
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
