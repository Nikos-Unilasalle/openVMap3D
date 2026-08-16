import React, { useCallback, useEffect, useRef, useState } from "react";
import { EasingType } from "../shared/graph/types";
import { EasingPopover } from "./EasingPopover";
import "./timeline-bar.css";

export interface KeyframeDataAtFrame {
  paramKeys: string[];
  easeIn?: EasingType;
  easeOut?: EasingType;
}

interface TimelineBarProps {
  currentFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  keyframesEnabled: boolean;
  selectedKeyframes?: Record<number, KeyframeDataAtFrame>;
  markers?: number[];
  onToggleMarker?: (frame: number) => void;
  onMoveMarker?: (oldFrame: number, newFrame: number) => void;
  onMoveKeyframe?: (oldFrame: number, newFrame: number) => void;
  onUpdateKeyframeEasing?: (frame: number, easeIn: EasingType, easeOut: EasingType) => void;
  onDeleteKeyframe?: (frame: number) => void;
  onFrameChange: (frame: number) => void;
  onTogglePlay: () => void;
  onSplitHandleMouseDown: (e: React.MouseEvent) => void;
  isDrawerOpen?: boolean;
  onToggleDrawer?: () => void;
}

function renderKeyframeGlyph(easeIn: EasingType = "smooth", easeOut: EasingType = "smooth") {
  if (easeOut === "hold") {
    // Square hold glyph
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" className="kf-glyph-svg">
        <rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="#76C560" stroke="#0f172a" strokeWidth="1" />
      </svg>
    );
  }
  if (easeIn === "linear" && easeOut === "linear") {
    // Circle linear glyph
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" className="kf-glyph-svg">
        <circle cx="6" cy="6" r="3.5" fill="#76C560" stroke="#0f172a" strokeWidth="1" />
      </svg>
    );
  }
  if (easeIn !== "smooth" && easeOut === "smooth") {
    // Left-arrowhead / Ease-In glyph
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" className="kf-glyph-svg">
        <polygon points="6,1.5 1.5,6 6,10.5 8.5,6" fill="#76C560" stroke="#0f172a" strokeWidth="1" />
      </svg>
    );
  }
  if (easeIn === "smooth" && easeOut !== "smooth") {
    // Right-arrowhead / Ease-Out glyph
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" className="kf-glyph-svg">
        <polygon points="6,1.5 10.5,6 6,10.5 3.5,6" fill="#76C560" stroke="#0f172a" strokeWidth="1" />
      </svg>
    );
  }
  if (easeIn === "bounce" || easeOut === "bounce" || easeIn === "elastic" || easeOut === "elastic") {
    // Wavy diamond glyph
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" className="kf-glyph-svg">
        <polygon points="6,1 11,6 6,11 1,6" fill="#76C560" stroke="#0f172a" strokeWidth="1" />
        <path d="M 4 6 Q 6 4 8 6" stroke="#0f172a" strokeWidth="1.2" fill="none" />
      </svg>
    );
  }
  // Standard symmetrical diamond
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" className="kf-glyph-svg">
      <polygon points="6,1 11,6 6,11 1,6" fill="#76C560" stroke="#0f172a" strokeWidth="1" />
    </svg>
  );
}

export function TimelineBar({
  currentFrame,
  totalFrames,
  isPlaying,
  keyframesEnabled,
  selectedKeyframes = {},
  markers = [],
  onToggleMarker,
  onMoveMarker,
  onMoveKeyframe,
  onUpdateKeyframeEasing,
  onDeleteKeyframe,
  onFrameChange,
  onTogglePlay,
  onSplitHandleMouseDown,
  isDrawerOpen = false,
  onToggleDrawer,
}: TimelineBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverFrame, setHoverFrame] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isTimelineHovered, setIsTimelineHovered] = useState(false);
  const [hoveredMarkerFrame, setHoveredMarkerFrame] = useState<number | null>(null);
  const [dragMarkerState, setDragMarkerState] = useState<{ oldFrame: number; dragFrame: number } | null>(null);
  const [dragKeyframeState, setDragKeyframeState] = useState<{ oldFrame: number; dragFrame: number } | null>(null);

  // Easing Popover State
  const [easingPopover, setEasingPopover] = useState<{
    frame: number;
    paramKeys: string[];
    easeIn: EasingType;
    easeOut: EasingType;
    isLinked: boolean;
    x: number;
    y: number;
  } | null>(null);

  const calculateFrameFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent): { frame: number; x: number } | null => {
      if (!trackRef.current || totalFrames <= 0) return null;
      const rect = trackRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const ratio = rect.width > 0 ? x / rect.width : 0;
      const frame = Math.max(0, Math.min(totalFrames - 1, Math.round(ratio * (totalFrames - 1))));
      return { frame, x };
    },
    [totalFrames],
  );

  const [isCmdPressed, setIsCmdPressed] = useState(false);

  useEffect(() => {
    function handleKeyChange(e: KeyboardEvent) {
      setIsCmdPressed(e.metaKey || e.ctrlKey);
    }
    window.addEventListener("keydown", handleKeyChange);
    window.addEventListener("keyup", handleKeyChange);
    return () => {
      window.removeEventListener("keydown", handleKeyChange);
      window.removeEventListener("keyup", handleKeyChange);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (easingPopover && e.key === "Escape") {
        setEasingPopover(null);
        return;
      }

      if (!isTimelineHovered || !keyframesEnabled) return;
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          (activeEl as HTMLElement).isContentEditable);
      if (isInput) return;

      if ((e.key === "m" || e.key === "M") && onToggleMarker) {
        e.preventDefault();
        if (hoveredMarkerFrame !== null) {
          onToggleMarker(hoveredMarkerFrame);
          setHoveredMarkerFrame(null);
        } else {
          onToggleMarker(currentFrame);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTimelineHovered, keyframesEnabled, currentFrame, hoveredMarkerFrame, onToggleMarker, easingPopover]);

  const handlePointerDownTrack = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      onSplitHandleMouseDown(e);
      return;
    }
    if (!keyframesEnabled || totalFrames <= 0) return;
    if (e.button !== 0) return; // Only left click for scrubbing

    e.stopPropagation();
    setIsScrubbing(true);
    const res = calculateFrameFromEvent(e);
    if (res) onFrameChange(res.frame);

    const onPointerMove = (moveEvent: MouseEvent) => {
      const moveRes = calculateFrameFromEvent(moveEvent);
      if (moveRes) onFrameChange(moveRes.frame);
    };

    const onPointerUp = () => {
      setIsScrubbing(false);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
    };

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
  };

  const handleMarkerMouseDown = (e: React.MouseEvent, oldFrame: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (!keyframesEnabled || !onMoveMarker) return;

    setDragMarkerState({ oldFrame, dragFrame: oldFrame });
    let latestFrame = oldFrame;

    const onPointerMove = (moveEvent: MouseEvent) => {
      const res = calculateFrameFromEvent(moveEvent);
      if (res && res.frame !== latestFrame) {
        latestFrame = res.frame;
        setDragMarkerState({ oldFrame, dragFrame: latestFrame });
      }
    };

    const onPointerUp = () => {
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      setDragMarkerState(null);
      if (latestFrame !== oldFrame) {
        onMoveMarker(oldFrame, latestFrame);
      }
    };

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
  };

  const handleKeyframeMouseDown = (e: React.MouseEvent, oldFrame: number) => {
    e.stopPropagation();
    if (e.button !== 0) return; // Left button only for drag / select
    if (!keyframesEnabled) return;

    onFrameChange(oldFrame);

    let hasMoved = false;
    let latestFrame = oldFrame;
    const startX = e.clientX;

    const onPointerMove = (moveEvent: MouseEvent) => {
      if (Math.abs(moveEvent.clientX - startX) > 3) {
        hasMoved = true;
      }
      if (hasMoved) {
        const res = calculateFrameFromEvent(moveEvent);
        if (res && res.frame !== latestFrame) {
          latestFrame = res.frame;
          setDragKeyframeState({ oldFrame, dragFrame: latestFrame });
          onFrameChange(latestFrame);
        }
      }
    };

    const onPointerUp = () => {
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      setDragKeyframeState(null);
      if (hasMoved && latestFrame !== oldFrame && onMoveKeyframe) {
        onMoveKeyframe(oldFrame, latestFrame);
      }
    };

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
  };

  const handleKeyframeContextMenu = (e: React.MouseEvent, frame: number, data: KeyframeDataAtFrame) => {
    e.preventDefault();
    e.stopPropagation();
    if (!keyframesEnabled) return;

    onFrameChange(frame);

    const targetRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(160, Math.min(window.innerWidth - 160, targetRect.left + targetRect.width / 2));
    const y = Math.max(10, targetRect.top - 180);

    const initialIn = data.easeIn || "smooth";
    const initialOut = data.easeOut || "smooth";

    setEasingPopover({
      frame,
      paramKeys: data.paramKeys,
      easeIn: initialIn,
      easeOut: initialOut,
      isLinked: initialIn === initialOut,
      x,
      y,
    });
  };

  const handleMouseMoveTrack = (e: React.MouseEvent) => {
    if (!keyframesEnabled || totalFrames <= 0) return;
    const res = calculateFrameFromEvent(e);
    if (res) {
      setHoverFrame(res.frame);
      setHoverX(res.x);
    }
  };

  const handleMouseLeaveTrack = () => {
    if (!isScrubbing) setHoverFrame(null);
  };

  const handleSelectEasing = (direction: "in" | "out", newType: EasingType) => {
    if (!easingPopover) return;
    let nextIn = easingPopover.easeIn;
    let nextOut = easingPopover.easeOut;

    if (direction === "in") {
      nextIn = newType;
      if (easingPopover.isLinked) nextOut = newType;
    } else {
      nextOut = newType;
      if (easingPopover.isLinked) nextIn = newType;
    }

    setEasingPopover((prev) => (prev ? { ...prev, easeIn: nextIn, easeOut: nextOut } : null));
    onUpdateKeyframeEasing?.(easingPopover.frame, nextIn, nextOut);
  };

  const handleDeleteCurrentKeyframe = () => {
    if (!easingPopover) return;
    onDeleteKeyframe?.(easingPopover.frame);
    setEasingPopover(null);
  };

  const progressPct = totalFrames > 1 ? (Math.max(0, Math.min(totalFrames - 1, currentFrame)) / (totalFrames - 1)) * 100 : 0;
  const oneFramePct = totalFrames > 1 ? (1 / (totalFrames - 1)) * 100 : 1;

  const keyframeFrames = Object.keys(selectedKeyframes).map(Number).sort((a, b) => a - b);

  return (
    <div
      className={`timeline-bar-container ${isCmdPressed ? "cmd-active" : ""}`}
      onMouseDown={(e) => {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onSplitHandleMouseDown(e);
        }
      }}
      onMouseEnter={() => setIsTimelineHovered(true)}
      onMouseLeave={() => setIsTimelineHovered(false)}
      title={isCmdPressed ? "Hold and drag to resize canvas split height" : undefined}
    >
      <div
        className="timeline-split-resize-handle"
        onMouseDown={onSplitHandleMouseDown}
        title="Drag or Cmd+Drag to resize workspace viewports"
      />

      <div className="timeline-bar-inner">
        <button
          type="button"
          className={`timeline-play-btn ${!keyframesEnabled ? "disabled" : ""}`}
          onClick={onTogglePlay}
          disabled={!keyframesEnabled}
          title={keyframesEnabled ? (isPlaying ? "Pause animation" : "Play animation") : "Keyframes disabled (No Render node in canvas)"}
        >
          {keyframesEnabled ? (isPlaying ? "⏸" : "▶") : "⏸"}
        </button>

        <div
          ref={trackRef}
          className={`timeline-track ${!keyframesEnabled ? "disabled" : ""}`}
          onMouseDown={handlePointerDownTrack}
          onMouseMove={handleMouseMoveTrack}
          onMouseLeave={handleMouseLeaveTrack}
        >
          <div className="timeline-track-bg" />
          <div className="timeline-track-fill" style={{ width: `${progressPct}%` }} />

          {/* Visual markers */}
          {keyframesEnabled &&
            totalFrames > 0 &&
            markers.map((markerFrame) => {
              const displayFrame =
                dragMarkerState && dragMarkerState.oldFrame === markerFrame
                  ? dragMarkerState.dragFrame
                  : markerFrame;
              const markerPct = totalFrames > 1 ? (Math.max(0, Math.min(totalFrames - 1, displayFrame)) / (totalFrames - 1)) * 100 : 0;
              const isHovered = hoveredMarkerFrame === markerFrame;
              const isDragging = dragMarkerState && dragMarkerState.oldFrame === markerFrame;
              return (
                <div
                  key={markerFrame}
                  className={`timeline-visual-marker ${isHovered ? "hovered" : ""} ${isDragging ? "dragging" : ""}`}
                  style={{
                    left: `${markerPct}%`,
                    width: `max(6px, ${oneFramePct}%)`,
                  }}
                  onMouseEnter={() => setHoveredMarkerFrame(markerFrame)}
                  onMouseLeave={() => setHoveredMarkerFrame((h) => (h === markerFrame ? null : h))}
                  onMouseDown={(e) => handleMarkerMouseDown(e, markerFrame)}
                  title={`Marker (Frame ${displayFrame}) - Press 'm' on hover to delete, or drag to move`}
                />
              );
            })}

          {/* Interactive keyframe diamonds with easing glyphs & drag preview */}
          {keyframesEnabled &&
            totalFrames > 0 &&
            keyframeFrames.map((kfFrame) => {
              const data = selectedKeyframes[kfFrame] || { paramKeys: [] };
              const displayFrame =
                dragKeyframeState && dragKeyframeState.oldFrame === kfFrame
                  ? dragKeyframeState.dragFrame
                  : kfFrame;
              const kfPct = totalFrames > 1 ? (Math.max(0, Math.min(totalFrames - 1, displayFrame)) / (totalFrames - 1)) * 100 : 0;
              const isDragging = dragKeyframeState && dragKeyframeState.oldFrame === kfFrame;
              const isSelected = currentFrame === displayFrame;

              return (
                <div
                  key={kfFrame}
                  className={`timeline-keyframe-diamond ${isDragging ? "dragging" : ""} ${isSelected ? "selected" : ""}`}
                  style={{ left: `${kfPct}%` }}
                  onMouseDown={(e) => handleKeyframeMouseDown(e, kfFrame)}
                  onContextMenu={(e) => handleKeyframeContextMenu(e, kfFrame, data)}
                  title={`Keyframe at Frame ${displayFrame} (${data.paramKeys.join(", ")})\nIn: ${data.easeIn || "smooth"} | Out: ${data.easeOut || "smooth"}\n• Left click + drag to move\n• Right click to edit interpolation`}
                >
                  {renderKeyframeGlyph(data.easeIn, data.easeOut)}
                </div>
              );
            })}

          {keyframesEnabled && hoverFrame !== null && (
            <div
              className="timeline-hover-badge"
              style={{ left: `${hoverX}px` }}
            >
              Frame {hoverFrame}
            </div>
          )}

          {keyframesEnabled && totalFrames > 0 && (
            <div
              className="timeline-playhead-cursor"
              style={{ left: `${progressPct}%` }}
              title={`Frame ${currentFrame}`}
            />
          )}
        </div>

        {onToggleDrawer && (
          <button
            type="button"
            className={`timeline-drawer-toggle-btn ${isDrawerOpen ? "active" : ""}`}
            onClick={onToggleDrawer}
            title={isDrawerOpen ? "Collapse timeline (T)" : "Open advanced timeline (T)"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              {isDrawerOpen ? (
                <polyline points="6 9 12 15 18 9" />
              ) : (
                <polyline points="18 15 12 9 6 15" />
              )}
            </svg>
          </button>
        )}

        <div className="timeline-total-badge" title="Total frame count">
          {keyframesEnabled ? `${totalFrames} f` : "∞"}
        </div>
      </div>

      {/* Right-click Easing Popover Modal */}
      {easingPopover && (
        <EasingPopover
          x={easingPopover.x}
          y={easingPopover.y}
          badge={`Keyframe ${easingPopover.frame}`}
          subtitle={easingPopover.paramKeys.join(", ")}
          easeIn={easingPopover.easeIn}
          easeOut={easingPopover.easeOut}
          isLinked={easingPopover.isLinked}
          onToggleLinked={(linked) =>
            setEasingPopover((prev) => (prev ? { ...prev, isLinked: linked } : null))
          }
          onSelectEasing={handleSelectEasing}
          onDelete={handleDeleteCurrentKeyframe}
          onClose={() => setEasingPopover(null)}
        />
      )}
    </div>
  );
}
