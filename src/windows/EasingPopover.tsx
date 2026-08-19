import React from "react";
import { EasingType } from "../shared/graph/types";
import "./timeline-bar.css";

/**
 * Per-easing strength knob. `null` = no knob (linear / hold). For each easing
 * the number has a native meaning (see computeSegmentEasing in evaluate.ts).
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
];

export interface EasingPopoverProps {
  x: number;
  y: number;
  badge: string;
  subtitle: string;
  easeIn: EasingType;
  strength: number;
  onSelectEasing: (newType: EasingType) => void;
  onStrengthChange: (value: number) => void;
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
  onSelectEasing,
  onStrengthChange,
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

      {EASING_STRENGTH_CONFIG[easeIn] && (
        <div className="easing-popover-section">
          <label className="easing-strength-label">
            <span>{EASING_STRENGTH_CONFIG[easeIn]!.label}</span>
            <input
              type="number"
              min={EASING_STRENGTH_CONFIG[easeIn]!.min}
              max={EASING_STRENGTH_CONFIG[easeIn]!.max}
              step={EASING_STRENGTH_CONFIG[easeIn]!.step}
              value={strength}
              onChange={(e) => onStrengthChange(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      <div className="easing-popover-footer">
        <button type="button" className="easing-delete-btn" onClick={onDelete} title="Delete this keyframe">
          🗑 Delete Keyframe
        </button>
      </div>
    </div>
  </div>
);