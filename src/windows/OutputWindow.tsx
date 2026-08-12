import { useEffect, useRef, useState } from "react";
import { CalibrationLinesView } from "../shared/graph/calibration/CalibrationLinesView";
import { isStoredLines, StoredLines, toPixels } from "../shared/graph/calibration/lines";
import { DEFAULT_REGISTRY } from "../shared/graph/nodes";
import { findRenderNodeId } from "../shared/graph/nodes/render";
import { emptyGraph, Graph } from "../shared/graph/types";
import { GraphPayload, notifyOutputClosed, startReceiving } from "../shared/ipc";
import { Viewport } from "../shared/three/Viewport";

/**
 * Read-only mirror of CalibrationOverlay's lines, no handles/drag — the
 * whole point is the operator watches THIS window (the real projection)
 * while dragging in the main editor, so the lines must render here too.
 */
function OutputCalibrationLines({ storedLines }: { storedLines: unknown }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  if (!isStoredLines(storedLines) || size.width === 0 || size.height === 0) {
    return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
  }

  const pixelLines: StoredLines = toPixels(storedLines, size.width, size.height);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <CalibrationLinesView lines={pixelLines} width={size.width} height={size.height} />
    </div>
  );
}

/**
 * The projector-facing window — no editor chrome, no palette, no param
 * panel, just the rendered scene full-bleed. Receives its graph from the
 * main window over Tauri events (see ipc.ts); renders nothing until the
 * first broadcast arrives (handshake happens automatically on mount).
 */
export function OutputWindow() {
  const [payload, setPayload] = useState<GraphPayload | null>(null);

  useEffect(() => {
    const stop = startReceiving(setPayload);
    return () => {
      stop();
      notifyOutputClosed();
    };
  }, []);

  const graph: Graph = payload?.graph ?? emptyGraph();
  const renderNodeId = findRenderNodeId(graph);
  const calibratingNode = payload?.calibratingNodeId
    ? graph.nodes.find((n) => n.id === payload.calibratingNodeId)
    : undefined;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000", position: "relative" }}>
      {renderNodeId ? (
        <Viewport
          graph={graph}
          registry={DEFAULT_REGISTRY}
          renderNodeId={renderNodeId}
          epochMs={payload?.epochMs}
          outputMode
        />
      ) : null}
      {calibratingNode ? <OutputCalibrationLines storedLines={calibratingNode.params.calibrationLines} /> : null}
    </div>
  );
}
