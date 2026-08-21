import React, { useEffect, useRef, useState } from "react";
import { EasingType } from "../shared/graph/types";
import { BEZIER_PRESETS, computeSegmentEasing } from "../shared/graph/evaluate";
import { DragNumberInput } from "./DragNumberInput";
import "./timeline-bar.css";

/**
 * Per-easing strength knob. `null` = no knob (linear / hold / bezier). For each
 * easing the number has a native meaning (see computeSegmentEasing).
 */
export const EASING_STRENGTH_CONFIG: Record<
  EasingType,
  { label: string; min: number; max: number; step: number; defaultValue: number } | null
> = {
  smooth: { label: "Strength (0 = linear, 1 = full)", min: 0, max: 1, step: 0.05, defaultValue: 1 },
  linear: null,
  hold: null,
  expo: { label: "Expo Strength (exponent, higher = more contrast)", min: 1, max: 20, step: 0.5, defaultValue: 10 },
  back: { label: "Overshoot (higher = more pull-back)", min: 0, max: 5, step: 0.05, defaultValue: 1.70158 },
  bounce: { label: "Strength (0 = linear, 1 = full)", min: 0, max: 1, step: 0.05, defaultValue: 1 },
  elastic: { label: "Strength (0 = linear, 1 = full)", min: 0, max: 1, step: 0.05, defaultValue: 1 },
  bezier: null,
};

export const EASING_OPTIONS: { type: EasingType; label: string; icon: React.ReactNode }[] = [
  {
    type: "smooth",
    label: "Smooth (Bézier)",
    icon: (
      <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M 2 12 C 7 12, 11 2, 16 2" />
      </svg>
    ),
  },
  {
    type: "linear",
    label: "Linear (Constant)",
    icon: (
      <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8">
        <line x1="2" y1="12" x2="16" y2="2" />
      </svg>
    ),
  },
  {
    type: "hold",
    label: "Hold (Step)",
    icon: (
      <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M 2 12 L 14 12 L 14 2 L 16 2" />
      </svg>
    ),
  },
  {
    type: "expo",
    label: "Expo (Exponential)",
    icon: (
      <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M 2 12 C 10 12, 14 8, 16 2" />
      </svg>
    ),
  },
  {
    type: "back",
    label: "Back (Overshoot)",
    icon: (
      <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M 2 12 C 6 15, 11 -2, 16 2" />
      </svg>
    ),
  },
  {
    type: "bounce",
    label: "Bounce",
    icon: (
      <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M 2 12 C 4 2, 8 2, 9 12 C 11 6, 13 6, 14 12 L 16 12" />
      </svg>
    ),
  },
  {
    type: "elastic",
    label: "Elastic (Spring)",
    icon: (
      <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M 2 12 C 5 1, 7 15, 10 5 C 12 14, 14 11, 16 2" />
      </svg>
    ),
  },
  {
    type: "bezier",
    label: "Bezier (Custom)",
    icon: (
      <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M 2 12 C 5 2, 13 12, 16 2" />
        <circle cx="5" cy="5" r="1.4" fill="currentColor" />
        <circle cx="13" cy="9" r="1.4" fill="currentColor" />
      </svg>
    ),
  },
];

/** Samples an easing into an SVG path `d` (y-up 0..1, overshoot allowed). */
function easingPath(easeIn: EasingType, strength: number, bezier: [number, number, number, number]): string {
  const pts: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const p = i / 24;
    const y = computeSegmentEasing(p, easeIn, strength, bezier);
    pts.push(`${(p * 100).toFixed(2)},${(100 - y * 100).toFixed(2)}`);
  }
  return `M ${pts.join(" L ")}`;
}

/** Static preview of the selected easing curve. */
function CurvePreview({ easeIn, strength, bezier }: { easeIn: EasingType; strength: number; bezier: [number, number, number, number] }) {
  return (
    <svg className="easing-curve-preview" viewBox="-20 -20 140 140">
      <line x1="0" y1="100" x2="100" y2="0" className="easing-curve-grid" />
      <path d={easingPath(easeIn, strength, bezier)} className="easing-curve-path" />
    </svg>
  );
}

/** Draggable cubic-bezier editor: drag the two control handles. */
function BezierEditor({
  value,
  onChange,
}: {
  value: [number, number, number, number];
  onChange: (b: [number, number, number, number]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<0 | 1 | null>(null);

  // The viewBox is -20..120 (140 units with 20 of padding) so overshooting
  // handles stay visible; the inner 100×100 maps to the 0..1 value space.
  const PAD = 20 / 140;

  const handle = (i: 0 | 1) => {
    const x = value[i * 2];
    const y = value[i * 2 + 1];
    return { cx: x * 100, cy: 100 - y * 100 };
  };

  useEffect(() => {
    if (active === null) return;
    const onMove = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      // Undo the viewBox padding so 0..1 maps to the inner square.
      const inner = rect.width * (1 - PAD * 2);
      const pad = rect.width * PAD;
      const nx = (e.clientX - rect.left - pad) / inner;
      const ny = 1 - (e.clientY - rect.top - pad) / inner;
      const next: [number, number, number, number] = [...value];
      next[active * 2] = Math.max(0, Math.min(1, nx));
      next[active * 2 + 1] = Math.max(-0.5, Math.min(1.5, ny));
      onChange(next);
    };
    const onUp = () => setActive(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <svg ref={svgRef} className="easing-bezier-editor" viewBox="-20 -20 140 140">
      <line x1="0" y1="100" x2="100" y2="0" className="easing-curve-grid" />
      <path d={`M 0 100 C ${handle(0).cx} ${handle(0).cy}, ${handle(1).cx} ${handle(1).cy}, 100 0`} className="easing-curve-path" />
      {([0, 1] as const).map((i) => {
        const h = handle(i);
        return (
          <circle
            key={i}
            cx={h.cx}
            cy={h.cy}
            r={6}
            className={`easing-bezier-handle ${active === i ? "active" : ""}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              setActive(i);
            }}
          />
        );
      })}
    </svg>
  );
}

export interface EasingPopoverProps {
  x: number;
  y: number;
  badge: string;
  subtitle: string;
  easeIn: EasingType;
  strength: number;
  easeBezier: [number, number, number, number];
  onSelectEasing: (newType: EasingType) => void;
  onStrengthChange: (value: number) => void;
  onBezierChange: (b: [number, number, number, number]) => void;
  onDelete: () => void;
  onClose: () => void;
}

export const EasingPopover: React.FC<EasingPopoverProps> = ({
  x,
  y,
  badge,
  subtitle,
  easeIn,
  strength,
  easeBezier,
  onSelectEasing,
  onStrengthChange,
  onBezierChange,
  onDelete,
  onClose,
}) => (
  <div className="easing-popover-backdrop" onClick={onClose}>
    <div
      className="easing-popover-modal"
      style={{ left: `${x}px`, top: `${y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="easing-popover-header">
        <div className="easing-popover-title">
          <span className="kf-badge">{badge}</span>
          <span className="kf-params">{subtitle}</span>
        </div>
        <button type="button" className="easing-popover-close" onClick={onClose} title="Close (Esc)">
          ✕
        </button>
      </div>

      <div className="easing-popover-section">
        <div className="easing-section-label">ARRIVAL EASING (into this keyframe)</div>
        <div className="easing-buttons-grid">
          {EASING_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              type="button"
              className={`easing-btn ${easeIn === opt.type ? "active" : ""}`}
              onClick={() => onSelectEasing(opt.type)}
              title={opt.label}
            >
              <span className="easing-icon">{opt.icon}</span>
              <span className="easing-text">{opt.type}</span>
            </button>
          ))}
        </div>
      </div>

      {easeIn === "bezier" && (
        <div className="easing-popover-section">
          <div className="easing-section-label">CUSTOM BEZIER — drag the handles</div>
          <BezierEditor value={easeBezier} onChange={onBezierChange} />
          <div className="easing-bezier-presets">
            {Object.entries(BEZIER_PRESETS).map(([name, b]) => (
              <button key={name} type="button" className="easing-btn" onClick={() => onBezierChange([...b])}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {EASING_STRENGTH_CONFIG[easeIn] && (
        <div className="easing-popover-section">
          <label className="easing-strength-label">
            <span>{EASING_STRENGTH_CONFIG[easeIn]!.label}</span>
            <DragNumberInput
              min={EASING_STRENGTH_CONFIG[easeIn]!.min}
              max={EASING_STRENGTH_CONFIG[easeIn]!.max}
              step={EASING_STRENGTH_CONFIG[easeIn]!.step}
              value={strength}
              onChange={onStrengthChange}
            />
          </label>
        </div>
      )}

      <div className="easing-popover-section">
        <CurvePreview easeIn={easeIn} strength={strength} bezier={easeBezier} />
      </div>

      <div className="easing-popover-footer">
        <button type="button" className="easing-delete-btn" onClick={onDelete} title="Delete this keyframe">
          🗑 Delete Keyframe
        </button>
      </div>
    </div>
  </div>
);
