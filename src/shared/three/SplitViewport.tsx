import React, { useState, useRef, useCallback, useEffect } from "react";
import { TransformPatch, Viewport } from "./Viewport";
import { EvalResult } from "../graph/evaluate";
import { Graph, KeyframeStore, NodeRegistry } from "../graph/types";
import type { PreviewCameraPose } from "../ipc";

/**
 * Shift+Tab cycles: viewport (free orbit) -> split (editor + camera preview)
 * -> full camera view -> full-canvas graph (no 3D pane at all) -> viewport.
 * Controlled from App.tsx, not owned here — "graph" unmounts every Viewport
 * this component would render, so the App.tsx div wrapping SplitViewport is
 * what actually has to react to it (collapsing to 0 height), and the
 * keyboard shortcut has to live somewhere that stays mounted regardless.
 */
export type SplitViewMode = "viewport" | "split" | "camera" | "graph";

interface SplitViewportProps {
  graph: Graph;
  registry: NodeRegistry;
  renderNodeId: string;
  epochMs?: number;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  onTransformChange?: (transformNodeId: string, patch: TransformPatch) => void;
  onTransformStart?: () => void;
  onCameraChange?: (pose: PreviewCameraPose) => void;
  previewCameraPose?: PreviewCameraPose | null;
  currentFrame?: number;
  onEvaluatedResults?: (results: Map<string, Record<string, unknown>>) => void;
  isPlaying?: boolean;
  onHubChange?: (nodeId: string, patch: Partial<{ x: number; y: number; rotation: number; scale: number }>) => void;
  /** Freezes both panes while a video export runs — see Viewport's `suspended`. */
  suspended?: boolean;
  viewMode: SplitViewMode;
  onCycleViewMode: () => void;
  /** Editor pane's pinned param HUD — see ViewportParamHUD. Not passed to the output/camera-preview pane. */
  keyframes?: KeyframeStore;
  keyframesEnabled?: boolean;
  evaluatedResults?: EvalResult | null;
  onParamChange?: (paramId: string, value: unknown, targetNodeId?: string) => void;
  onUnpinParam?: (nodeId: string, paramId: string) => void;
  onRenameExposedParam?: (nodeId: string, paramId: string, label: string) => void;
}

export function SplitViewport({
  graph,
  registry,
  renderNodeId,
  epochMs = 0,
  selectedNodeId = null,
  onSelectNode,
  onTransformChange,
  onTransformStart,
  onCameraChange,
  previewCameraPose = null,
  currentFrame,
  onEvaluatedResults,
  isPlaying,
  onHubChange,
  suspended = false,
  viewMode,
  onCycleViewMode: cycleMode,
  keyframes,
  keyframesEnabled,
  evaluatedResults,
  onParamChange,
  onUnpinParam,
  onRenameExposedParam,
}: SplitViewportProps) {
  const [splitPercent, setSplitPercent] = useState(50);
  const isDraggingRef = useRef(false);
  // Held so an unmount while the splitter is pressed can remove the global
  // window listeners — otherwise they'd linger until the next mouseup and
  // keep calling setState on a component that no longer exists.
  const dragHandlersRef = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null);

  useEffect(
    () => () => {
      if (dragHandlersRef.current) {
        window.removeEventListener("mousemove", dragHandlersRef.current.move);
        window.removeEventListener("mouseup", dragHandlersRef.current.up);
        dragHandlersRef.current = null;
      }
    },
    [],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const container = document.getElementById("split-viewport-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const relativeX = moveEvent.clientX - rect.left;
      const newPercent = Math.max(20, Math.min(80, (relativeX / rect.width) * 100));
      setSplitPercent(newPercent);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      dragHandlersRef.current = null;
    };

    dragHandlersRef.current = { move: onMouseMove, up: onMouseUp };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  // Both panes are *always* mounted — never conditionally rendered per
  // viewMode — and hidden/suspended instead of unmounted. Each Viewport owns
  // a real WebGLRenderer plus, indirectly, every GPU-compute particle
  // simulation running through it (see particleRuntime.ts): a simulation is
  // keyed to the specific renderer it was built against, and rebuilds from
  // scratch the instant that renderer changes. Mounting/unmounting Viewport
  // on every Shift+Tab used to do exactly that on every mode switch —
  // "graph" chief among them, since it used to render nothing at all — so a
  // particle system silently reset and re-trickled-in (over its own
  // Lifetime) *every time the operator looked away from the 3D pane*. Kept
  // mounted, the same renderer (and the same running simulations) survives
  // every mode switch; only visibility and `suspended` (which freezes the
  // render loop without tearing anything down — see Viewport's own
  // `suspended` handling) change.
  //
  // Primary pane covers "viewport" (free orbit, outputMode false) and
  // "camera" (output preview, outputMode true) by itself, toggling props on
  // the *same* mounted instance — exactly what already happened before this
  // refactor for that transition specifically, which is why it never
  // exhibited the particle-reset bug. It doubles as split mode's left/editor
  // pane. Secondary pane exists only for split mode's right/output pane;
  // kept mounted-but-hidden after its first use for the same reason.
  const isGraph = viewMode === "graph";
  const isSplit = viewMode === "split";
  const isCamera = viewMode === "camera";

  const primaryVisible = !isGraph;
  const secondaryVisible = isSplit;
  // The secondary pane only exists for split mode's right/output side, so an
  // operator who never opens split mode should never pay for a second
  // WebGLRenderer + GL context — mount it lazily on first use, same "keep
  // mounted forever after" reasoning as the rest of this file once it does.
  const everSplitRef = useRef(isSplit);
  if (isSplit) everSplitRef.current = true;

  return (
    <div
      id="split-viewport-container"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#090d16",
      }}
    >
      <div
        style={{
          width: isSplit ? `${splitPercent}%` : "100%",
          height: "100%",
          position: "relative",
          minWidth: 0,
          display: primaryVisible ? "block" : "none",
        }}
      >
        <Viewport
          suspended={suspended || !primaryVisible}
          graph={graph}
          registry={registry}
          renderNodeId={renderNodeId}
          epochMs={epochMs}
          outputMode={isCamera}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onTransformChange={onTransformChange}
          onTransformStart={onTransformStart}
          onCameraChange={onCameraChange}
          previewCameraPose={previewCameraPose}
          isSplitView={isSplit}
          onToggleSplitView={cycleMode}
          currentFrame={currentFrame}
          onEvaluatedResults={onEvaluatedResults}
          isPlaying={isPlaying}
          onHubChange={onHubChange}
          keyframes={keyframes}
          keyframesEnabled={keyframesEnabled}
          evaluatedResults={evaluatedResults}
          onParamChange={onParamChange}
          onUnpinParam={onUnpinParam}
          onRenameExposedParam={onRenameExposedParam}
        />
      </div>

      {/* Draggable Splitter — only meaningful (and visible) in split mode */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: "2px",
          height: "100%",
          cursor: "col-resize",
          backgroundColor: "#000000",
          zIndex: 20,
          flexShrink: 0,
          display: isSplit ? "block" : "none",
        }}
      />

      <div
        style={{
          width: isSplit ? `${100 - splitPercent}%` : "100%",
          height: "100%",
          position: "relative",
          minWidth: 0,
          display: secondaryVisible ? "block" : "none",
        }}
      >
        {everSplitRef.current && (
          <Viewport
            suspended={suspended || !secondaryVisible}
            graph={graph}
            registry={registry}
            renderNodeId={renderNodeId}
            epochMs={epochMs}
            outputMode={true}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            previewCameraPose={previewCameraPose}
            currentFrame={currentFrame}
            onEvaluatedResults={onEvaluatedResults}
            isPlaying={isPlaying}
            onHubChange={onHubChange}
            keyframes={keyframes}
            keyframesEnabled={keyframesEnabled}
            evaluatedResults={evaluatedResults}
            onParamChange={onParamChange}
            onUnpinParam={onUnpinParam}
          />
        )}
      </div>
    </div>
  );
}
