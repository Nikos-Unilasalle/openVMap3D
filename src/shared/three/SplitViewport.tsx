import React, { useState, useRef, useCallback, useEffect } from "react";
import { TransformPatch, Viewport } from "./Viewport";
import { Graph, NodeRegistry } from "../graph/types";
import type { PreviewCameraPose } from "../ipc";

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
}: SplitViewportProps) {
  const [isSplit, setIsSplit] = useState(false);
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

  if (!isSplit) {
    return (
      <div id="split-viewport-container" style={{ width: "100%", height: "100%", position: "relative" }}>
        <Viewport
          graph={graph}
          registry={registry}
          renderNodeId={renderNodeId}
          epochMs={epochMs}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onTransformChange={onTransformChange}
          onTransformStart={onTransformStart}
          onCameraChange={onCameraChange}
          previewCameraPose={previewCameraPose}
          isSplitView={false}
          onToggleSplitView={() => setIsSplit(true)}
          currentFrame={currentFrame}
          onEvaluatedResults={onEvaluatedResults}
          isPlaying={isPlaying}
        />
      </div>
    );
  }

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
      {/* Left Pane: Editor Free View */}
      <div style={{ width: `${splitPercent}%`, height: "100%", position: "relative", minWidth: 0 }}>
        <Viewport
          graph={graph}
          registry={registry}
          renderNodeId={renderNodeId}
          epochMs={epochMs}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onTransformChange={onTransformChange}
          onTransformStart={onTransformStart}
          onCameraChange={onCameraChange}
          previewCameraPose={previewCameraPose}
          isSplitView={true}
          onToggleSplitView={() => setIsSplit(false)}
          currentFrame={currentFrame}
          onEvaluatedResults={onEvaluatedResults}
          isPlaying={isPlaying}
        />
      </div>

      {/* Draggable Splitter */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: "2px",
          height: "100%",
          cursor: "col-resize",
          backgroundColor: "#000000",
          zIndex: 20,
          flexShrink: 0,
        }}
      />

      {/* Right Pane: Active Camera View / Output Preview */}
      <div style={{ width: `${100 - splitPercent}%`, height: "100%", position: "relative", minWidth: 0 }}>
        <Viewport
          graph={graph}
          registry={registry}
          renderNodeId={renderNodeId}
          epochMs={epochMs}
          outputMode={true}
          previewCameraPose={previewCameraPose}
          currentFrame={currentFrame}
          onEvaluatedResults={onEvaluatedResults}
          isPlaying={isPlaying}
        />
      </div>
    </div>
  );
}
