import { useEffect, useRef, useState } from "react";
import { CalibrationHandlesView } from "../shared/graph/calibration/CalibrationHandlesView";
import { findReferencePointsForCamera } from "../shared/graph/calibration/graphLookup";
import { CalibrationPicks, DEFAULT_PICKS, isCalibrationPicks } from "../shared/graph/calibration/picks";
import { DEFAULT_REGISTRY } from "../shared/graph/nodes";
import { findRenderNodeId } from "../shared/graph/nodes/render";
import { emptyGraph, Graph } from "../shared/graph/types";
import { GraphPayload, notifyOutputClosed, startReceiving } from "../shared/ipc";
import { Viewport } from "../shared/three/Viewport";
import "./calibration-overlay.css";

/**
 * The calibration handles as they appear in the real projection — read-only,
 * unlabelled, no drag targets. This is the copy that matters: alignment is
 * judged by looking at the wall, not at the editor's preview, so the handles
 * have to be visible in the light actually hitting the room.
 */
function OutputCalibrationHandles({ graph, cameraNodeId }: { graph: Graph; cameraNodeId: string }) {
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

  const points = findReferencePointsForCamera(graph, cameraNodeId);
  const camera = graph.nodes.find((n) => n.id === cameraNodeId);
  const stored = camera?.params.calibrationPicks;
  const picks: CalibrationPicks = isCalibrationPicks(stored) ? stored : DEFAULT_PICKS;

  return (
    <div ref={containerRef} className="calibration-overlay">
      {points && size.width > 0 && (
        <CalibrationHandlesView points={points} picks={picks} width={size.width} height={size.height} />
      )}
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
  const calibratingNodeId = payload?.calibratingNodeId ?? null;

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
      {calibratingNodeId ? <OutputCalibrationHandles graph={graph} cameraNodeId={calibratingNodeId} /> : null}
    </div>
  );
}
