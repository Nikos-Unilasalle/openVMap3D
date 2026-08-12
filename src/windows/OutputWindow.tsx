import { useEffect, useState } from "react";
import { DEFAULT_REGISTRY } from "../shared/graph/nodes";
import { findRenderNodeId } from "../shared/graph/nodes/render";
import { emptyGraph, Graph } from "../shared/graph/types";
import { GraphPayload, notifyOutputClosed, startReceiving } from "../shared/ipc";
import { Viewport } from "../shared/three/Viewport";

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

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
      {renderNodeId ? (
        <Viewport
          graph={graph}
          registry={DEFAULT_REGISTRY}
          renderNodeId={renderNodeId}
          epochMs={payload?.epochMs}
          outputMode
        />
      ) : null}
    </div>
  );
}
