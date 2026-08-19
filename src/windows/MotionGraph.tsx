import React, { useRef, useState } from "react";
import { Graph, Keyframe } from "../shared/graph/types";
import { computeSegmentEasing } from "../shared/graph/evaluate";
import "./timeline-drawer.css";

const LANE_H = 64;
const LANE_PAD = 8;
const X_PAD = 70;

function trackRange(kfs: Keyframe[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const k of kfs) {
    const v = Number(k.value);
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || min === max) return { min: min - 1, max: max + 1 };
  const pad = (max - min) * 0.15;
  return { min: min - pad, max: max + pad };
}

const valueToY = (v: number, range: { min: number; max: number }, h: number) =>
  LANE_PAD + (1 - (v - range.min) / (range.max - range.min)) * (h - LANE_PAD * 2);

const yToValue = (y: number, range: { min: number; max: number }, h: number) => {
  const t = 1 - (y - LANE_PAD) / (h - LANE_PAD * 2);
  return range.min + t * (range.max - range.min);
};

interface DraggingKey {
  track: string;
  frame: number;
  value: number;
  oldFrame: number;
  oldValue: number;
}

export interface MotionGraphProps {
  graph: Graph;
  nodeId: string | null;
  currentFrame: number;
  totalFrames: number;
  onFrameChange: (frame: number) => void;
  onMoveKeyframe?: (nodeId: string, paramKey: string, oldFrame: number, newFrame: number) => void;
  onChangeKeyframeValue?: (nodeId: string, paramKey: string, frame: number, value: number) => void;
}

/** Motion graph — the selected node's value curves with draggable keyframes. */
export const MotionGraph: React.FC<MotionGraphProps> = ({
  graph,
  nodeId,
  currentFrame,
  totalFrames,
  onFrameChange,
  onMoveKeyframe,
  onChangeKeyframeValue,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DraggingKey | null>(null);

  if (!nodeId) return null;
  const nodeKeys = graph.keyframes?.[nodeId] || {};
  const tracks = Object.entries(nodeKeys)
    .map(([key, list]) => ({ key, list }))
    .filter((t) => t.list.some((k) => Number.isFinite(Number(k.value))));
  if (tracks.length === 0) return null;

  const W = Math.max(1, totalFrames) + X_PAD;
  const H = tracks.length * LANE_H;
  const ranges = tracks.map((t) => trackRange(t.list));

  const toFrame = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return Math.max(0, Math.min(totalFrames - 1, ((clientX - rect.left) / rect.width) * W));
  };

  const toLaneY = (clientY: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return 0;
    return ((clientY - rect.top) / rect.height) * H;
  };

  const handlePointerDown = (e: React.PointerEvent, track: string, frame: number, value: number) => {
    e.stopPropagation();
    setDrag({ track, frame, value, oldFrame: frame, oldValue: value });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const idx = tracks.findIndex((t) => t.key === drag.track);
    if (idx < 0) return;
    const range = ranges[idx];
    const nextFrame = Math.round(toFrame(e.clientX));
    const nextValue = yToValue(toLaneY(e.clientY), range, LANE_H);
    setDrag({ ...drag, frame: Math.max(0, Math.min(totalFrames - 1, nextFrame)), value: nextValue });
  };

  const handlePointerUp = () => {
    if (!drag || !nodeId) return;
    if (drag.frame !== drag.oldFrame && onMoveKeyframe) {
      onMoveKeyframe(nodeId, drag.track, drag.oldFrame, drag.frame);
    }
    if (drag.frame !== drag.oldFrame || Math.abs(drag.value - drag.oldValue) > 1e-6) {
      onChangeKeyframeValue?.(nodeId, drag.track, drag.frame, drag.value);
    }
    setDrag(null);
  };

  return (
    <div className="motion-graph-panel">
      <svg
        ref={svgRef}
        className="motion-graph-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerDown={(e) => {
          // Scrubbing the empty graph seeks the timeline.
          const f = Math.round(toFrame(e.clientX));
          if (f !== currentFrame) onFrameChange(f);
        }}
      >
        {tracks.map((t, i) => {
          const range = ranges[i];
          const laneY = i * LANE_H;
          const kfs = t.list;
          let pathD = "";
          for (let s = 0; s < kfs.length - 1; s++) {
            const k1 = kfs[s];
            const k2 = kfs[s + 1];
            const v1 = Number(k1.value);
            const v2 = Number(k2.value);
            for (let n = 0; n <= 24; n++) {
              const p = n / 24;
              const eased = computeSegmentEasing(p, k2.easeIn, k2.easeStrength, k2.easeBezier);
              const v = v1 + (v2 - v1) * eased;
              const x = X_PAD + (k1.frame + (k2.frame - k1.frame) * p);
              const y = laneY + valueToY(v, range, LANE_H);
              pathD += `${n === 0 ? "M" : " L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
            }
          }
          return (
            <g key={t.key}>
              <line x1={X_PAD} y1={laneY + LANE_H / 2} x2={W} y2={laneY + LANE_H / 2} className="motion-graph-midline" />
              <path d={pathD} className="motion-graph-curve" />
              {kfs.map((k, ki) => {
                const v = Number(k.value);
                const y = laneY + valueToY(v, range, LANE_H);
                const isDrag = drag && drag.track === t.key && drag.frame === k.frame;
                const cx = X_PAD + (isDrag && drag ? drag.frame : k.frame);
                const cy = laneY + (isDrag && drag ? valueToY(drag.value, range, LANE_H) : y);
                return (
                  <circle
                    key={ki}
                    cx={cx}
                    cy={cy}
                    r={5}
                    className={`motion-graph-kf ${currentFrame === k.frame ? "current" : ""}`}
                    onPointerDown={(e) => handlePointerDown(e, t.key, k.frame, v)}
                  />
                );
              })}
              <text x={4} y={laneY + LANE_H / 2 + 4} className="motion-graph-label">
                {t.key}
              </text>
            </g>
          );
        })}
        {/* Playhead */}
        <line x1={X_PAD + currentFrame} y1={0} x2={X_PAD + currentFrame} y2={H} className="motion-graph-playhead" />
      </svg>
    </div>
  );
};
