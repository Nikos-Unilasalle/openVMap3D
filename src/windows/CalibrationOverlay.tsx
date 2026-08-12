import { useEffect, useRef, useState } from "react";
import { CalibrationHandlesView, toPixels, toRelative } from "../shared/graph/calibration/CalibrationHandlesView";
import { findReferencePointsForCamera } from "../shared/graph/calibration/graphLookup";
import { CalibrationPicks, DEFAULT_PICKS, isCalibrationPicks, solveFromPicks } from "../shared/graph/calibration/picks";
import { referencePointColor } from "../shared/graph/calibration/roomCorner";
import { Graph } from "../shared/graph/types";
import "./calibration-overlay.css";

/** Reprojection error, in fractions of the image, above which the alignment is worth flagging. */
const SLOPPY_PICK_THRESHOLD = 0.004;

interface CalibrationOverlayProps {
  graph: Graph;
  cameraNodeId: string;
  /** The Camera node's own params — the stored picks live here. */
  storedPicks: unknown;
  onChange: (paramId: string, value: unknown) => void;
}

function statusOf(error: number | null): { text: string; tone: "ok" | "warn" | "bad" } {
  if (error === null) return { text: "Not solvable yet — place all six handles", tone: "bad" };
  if (error > SLOPPY_PICK_THRESHOLD) {
    return { text: `Solved, but loosely (residual ${(error * 100).toFixed(2)}% of image)`, tone: "warn" };
  }
  return { text: `Solved (residual ${(error * 100).toFixed(3)}% of image)`, tone: "ok" };
}

/**
 * Calibration by direct manipulation, the way BIBLE.md describes it: the
 * reference corner is projected live, and the operator drags each handle
 * onto the matching real corner of the room while watching the projection.
 *
 * Every handle carries a known 3D coordinate (from the wired Room Corner
 * node), which is what lets the Camera node's DLT solve recover the
 * projector's *position* along with its orientation, focal lengths and lens
 * shift. The earlier line-tracing version could recover none of those but
 * orientation, which is why the scene never landed in the room.
 *
 * A drag writes one param — the picks. The solve is the Camera node's own
 * job, so there is no second copy of the answer to keep in sync, and no
 * multi-write ordering to get wrong.
 */
export function CalibrationOverlay({ graph, cameraNodeId, storedPicks, onChange }: CalibrationOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const dragging = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  const points = findReferencePointsForCamera(graph, cameraNodeId);
  const picks: CalibrationPicks = isCalibrationPicks(storedPicks) ? storedPicks : DEFAULT_PICKS;

  if (!points) {
    return (
      <div ref={containerRef} className="calibration-overlay">
        <div className="calibration-overlay-warning">
          Wire a Room Corner node into the Camera's Ref Points to calibrate
        </div>
      </div>
    );
  }

  const solved = solveFromPicks(points, picks);
  const status = statusOf(solved ? solved.reprojectionError : null);

  const moveHandle = (id: string, clientX: number, clientY: number) => {
    if (!containerRef.current || size.width === 0 || size.height === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relative = toRelative({ x: clientX - rect.left, y: clientY - rect.top }, size.width, size.height);
    onChange("calibrationPicks", { ...picks, [id]: relative });
  };

  return (
    <div ref={containerRef} className="calibration-overlay">
      <div className={`calibration-overlay-status calibration-overlay-status-${status.tone}`}>{status.text}</div>
      <CalibrationHandlesView points={points} picks={picks} width={size.width} height={size.height} showLabels />
      <svg className="calibration-overlay-svg" width={size.width} height={size.height}>
        {points.map((point) => {
          const pick = picks[point.id];
          if (!pick) return null;
          const at = toPixels(pick, size.width, size.height);
          return (
            <circle
              key={point.id}
              className="calibration-handle"
              cx={at.x}
              cy={at.y}
              r={11}
              fill={referencePointColor(point.id)}
              fillOpacity={0.25}
              stroke={referencePointColor(point.id)}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                dragging.current = point.id;
              }}
              onPointerMove={(e) => {
                if (dragging.current !== point.id) return;
                moveHandle(point.id, e.clientX, e.clientY);
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
