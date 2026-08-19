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
  pixelsPerFrame: number;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScrollSync?: (scrollLeft: number) => void;
  onFrameChange: (frame: number) => void;
  onMoveKeyframe?: (nodeId: string, paramKey: string, oldFrame: number, newFrame: number) => void;
  onChangeKeyframeValue?: (nodeId: string, paramKey: string, frame: number, value: number) => void;
}

/**
 * Motion graph — the selected node's value curves with draggable keyframes.
 * The X axis uses the same pixels-per-frame as the timeline grid (and shares
 * its horizontal scroll), so the curves stay aligned with the rows below.
 */
export const MotionGraph: React.FC<MotionGraphProps> = ({
  graph,
  nodeId,
  currentFrame,
  totalFrames,
  pixelsPerFrame,
  scrollRef,
  onScrollSync,
  onFrameChange,
  onMoveKeyframe,
  onChangeKeyframeValue,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DraggingKey | null>(null);

  if (!nodeId) {
    return <div className="motion-graph-empty">Select a node on the canvas to see its value curves.</div>;
  }
  const nodeKeys = graph.keyframes?.[nodeId] || {};
  const tracks = Object.entries(nodeKeys)
    .map(([key, list]) => ({ key, list }))
    .filter((t) => t.list.some((k) => Number.isFinite(Number(k.value))));
  if (tracks.length === 0) {
    return <div className="motion-graph-empty">No keyframed parameters on this node yet.</div>;
  }

  const ppf = Math.max(0.1, pixelsPerFrame);
  const W = X_PAD + totalFrames * ppf;
  const H = tracks.length * LANE_H;
  const ranges = tracks.map((t) => trackRange(t.list));

  const toSvgX = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clientX - rect.left;
  };
  const toSvgY = (clientY: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clientY - rect.top;
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
    const frame = Math.round((toSvgX(e.clientX) - X_PAD) / ppf);
    const yInLane = toSvgY(e.clientY) - idx * LANE_H;
    const value = yToValue(yInLane, range, LANE_H);
    setDrag({
      ...drag,
      frame: Math.max(0, Math.min(totalFrames - 1, frame)),
      value,
    });
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

  const frameX = (f: number) => X_PAD + f * ppf;

  return (
    <div className="motion-graph-panel">
      <div
        ref={scrollRef}
        className="motion-graph-scroll"
        onScroll={(e) => onScrollSync?.(e.currentTarget.scrollLeft)}
      >
        <svg
          ref={svgRef}
          className="motion-graph-svg"
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: W, height: H }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerDown={(e) => {
            // Scrubbing the empty graph seeks the timeline.
            const f = Math.round((toSvgX(e.clientX) - X_PAD) / ppf);
            if (f !== currentFrame) onFrameChange(Math.max(0, Math.min(totalFrames - 1, f)));
          }}
        >
          {tracks.map((t, i) => {
            const range = ranges[i];
            const laneY = i * LANE_H;
            const kfs = t.list;
            // Effective keyframes with the dragged one snapped to its live
            // position, sorted — the curve follows the pointer in real time.
            const effective = kfs
              .map((k) =>
                drag && drag.track === t.key && drag.oldFrame === k.frame
                  ? { ...k, frame: drag.frame, value: drag.value }
                  : k,
              )
              .sort((a, b) => a.frame - b.frame);
            let pathD = "";
            for (let s = 0; s < effective.length - 1; s++) {
              const k1 = effective[s];
              const k2 = effective[s + 1];
              const v1 = Number(k1.value);
              const v2 = Number(k2.value);
              // The first keyframe's easing shapes the first segment (see
              // evaluateKeyframeList) so every easing knob is visible.
              const first = s === 0 && k1.easeIn !== undefined;
              const easeIn = first ? k1.easeIn : k2.easeIn;
              const strength = first ? k1.easeStrength : k2.easeStrength;
              const bezier = first ? k1.easeBezier : k2.easeBezier;
              for (let n = 0; n <= 24; n++) {
                const p = n / 24;
                const eased = computeSegmentEasing(p, easeIn, strength, bezier);
                const v = v1 + (v2 - v1) * eased;
                const x = frameX(k1.frame + (k2.frame - k1.frame) * p);
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
                  const isDrag = drag && drag.track === t.key && drag.oldFrame === k.frame;
                  const cx = frameX(isDrag && drag ? drag.frame : k.frame);
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
          <line x1={frameX(currentFrame)} y1={0} x2={frameX(currentFrame)} y2={H} className="motion-graph-playhead" />
        </svg>
      </div>
    </div>
  );
};
