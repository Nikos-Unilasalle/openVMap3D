import React, { useCallback, useEffect, useRef, useState } from "react";
import "./timeline-bar.css";

interface TimelineBarProps {
  currentFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  keyframesEnabled: boolean;
  selectedKeyframeFrames?: number[];
  markers?: number[];
  onToggleMarker?: (frame: number) => void;
  onMoveMarker?: (oldFrame: number, newFrame: number) => void;
  onFrameChange: (frame: number) => void;
  onTogglePlay: () => void;
  onSplitHandleMouseDown: (e: React.MouseEvent) => void;
}

export function TimelineBar({
  currentFrame,
  totalFrames,
  isPlaying,
  keyframesEnabled,
  selectedKeyframeFrames = [],
  markers = [],
  onToggleMarker,
  onMoveMarker,
  onFrameChange,
  onTogglePlay,
  onSplitHandleMouseDown,
}: TimelineBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverFrame, setHoverFrame] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isTimelineHovered, setIsTimelineHovered] = useState(false);
  const [hoveredMarkerFrame, setHoveredMarkerFrame] = useState<number | null>(null);
  const [dragMarkerState, setDragMarkerState] = useState<{ oldFrame: number; dragFrame: number } | null>(null);

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
      if (!isTimelineHovered || !keyframesEnabled || !onToggleMarker) return;
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          (activeEl as HTMLElement).isContentEditable);
      if (isInput) return;

      if (e.key === "m" || e.key === "M") {
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
  }, [isTimelineHovered, keyframesEnabled, currentFrame, hoveredMarkerFrame, onToggleMarker]);

  const handlePointerDownTrack = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      onSplitHandleMouseDown(e);
      return;
    }
    if (!keyframesEnabled || totalFrames <= 0) return;
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

  const progressPct = totalFrames > 1 ? (Math.max(0, Math.min(totalFrames - 1, currentFrame)) / (totalFrames - 1)) * 100 : 0;
  const oneFramePct = totalFrames > 1 ? (1 / (totalFrames - 1)) * 100 : 1;

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
      title={isCmdPressed ? "Maintenez et glissez pour redimensionner la hauteur du canevas" : undefined}
    >
      <div
        className="timeline-split-resize-handle"
        onMouseDown={onSplitHandleMouseDown}
        title="Glisser ou Cmd+Glisser pour redimensionner les fenêtres"
      />

      <div className="timeline-bar-inner">
        <button
          type="button"
          className={`timeline-play-btn ${!keyframesEnabled ? "disabled" : ""}`}
          onClick={onTogglePlay}
          disabled={!keyframesEnabled}
          title={keyframesEnabled ? (isPlaying ? "Pause animation" : "Play animation") : "Keyframes désactivées (Pas de node Render)"}
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

          {/* Visual markers (small 1px horizontal bar under blue track line, draggable with live preview) */}
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
                  title={`Marqueur (Frame ${displayFrame}) - Appuyer sur 'm' au survol pour supprimer, ou glisser pour déplacer`}
                />
              );
            })}

          {/* Green keyframe ticks for the selected node */}
          {keyframesEnabled &&
            totalFrames > 0 &&
            selectedKeyframeFrames.map((kfFrame) => {
              const kfPct = totalFrames > 1 ? (Math.max(0, Math.min(totalFrames - 1, kfFrame)) / (totalFrames - 1)) * 100 : 0;
              return (
                <div
                  key={kfFrame}
                  className="timeline-keyframe-marker"
                  style={{ left: `${kfPct}%` }}
                  title={`Keyframe at frame ${kfFrame}`}
                />
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

        <div className="timeline-total-badge" title="Nombre total de frames">
          {keyframesEnabled ? `${totalFrames} f` : "∞"}
        </div>
      </div>
    </div>
  );
}
