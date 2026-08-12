import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_REGISTRY } from "./shared/graph/nodes";
import { findRenderNodeId } from "./shared/graph/nodes/render";
import { Connection, Graph, NodeInstance } from "./shared/graph/types";
import { broadcastGraph, startBroadcasting } from "./shared/ipc";
import { Viewport } from "./shared/three/Viewport";
import { GraphEditor } from "./windows/GraphEditor";
import { OutputWindow } from "./windows/OutputWindow";
import { ParamPanel } from "./windows/ParamPanel";
import { TopBar } from "./windows/TopBar";

function node(id: string, type: string, position: { x: number; y: number }, params: Record<string, unknown> = {}): NodeInstance {
  return { id, type, params, position };
}

function edge(fromNode: string, fromSocket: string, toNode: string, toSocket: string): Connection {
  return { id: `${fromNode}.${fromSocket}->${toNode}.${toSocket}`, fromNode, fromSocket, toNode, toSocket };
}

function buildSmokeTestGraph(): Graph {
  return {
    nodes: [
      node("time", "time", { x: 40, y: 120 }),
      node("rotationVector", "vector/compose", { x: 280, y: 120 }, { x: 0, z: 0 }),
      node("boxTransform", "transform", { x: 540, y: 120 }),
      node("box", "object/box", { x: 800, y: 120 }),
      node("output", "render", { x: 1040, y: 120 }),
    ],
    connections: [
      edge("time", "seconds", "rotationVector", "y"),
      edge("rotationVector", "out", "boxTransform", "rotation"),
      edge("boxTransform", "matrix", "box", "matrix"),
      edge("box", "geometry", "output", "geometry"),
    ],
  };
}

const MIN_PANE_PERCENT = 15;
const MAX_PANE_PERCENT = 85;

/**
 * Two windows, one bundle: the Rust side (`output_window.rs`) opens the
 * projector-facing window at `index.html#/output` — this hash is the sole
 * discriminator between "I'm the main editor" and "I'm the output," same
 * pattern OpenVMap 2D uses. No router library needed for two routes.
 */
function App() {
  if (window.location.hash === "#/output") {
    return <OutputWindow />;
  }
  return <MainEditor />;
}

function MainEditor() {
  const [graph, setGraph] = useState<Graph>(buildSmokeTestGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const [currentFilename, setCurrentFilename] = useState("project_v1.ovm");
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingSplit = useRef(false);

  // One epoch per session, not per edit — clock.ts's Time node just needs
  // both windows agreeing on a shared "when did frame 0 happen," there's no
  // discontinuous world state here to restart (unlike OpenVMap 2D's physics
  // epoch, which *does* get re-stamped on structural physics changes).
  const [epochMs] = useState(() => Date.now());
  const graphRef = useRef(graph);
  graphRef.current = graph;

  // Handshake responder: an output window that opens after this one already
  // has state emits "output:ready" on mount; this answers with current state.
  useEffect(() => startBroadcasting(() => ({ graph: graphRef.current, epochMs })), [epochMs]);
  // Push broadcast on every structural graph change — not per frame; each
  // window's own render loop derives per-frame animation locally from the
  // shared epoch (see clock.ts), so this is the only IPC that happens at all.
  useEffect(() => {
    broadcastGraph({ graph, epochMs });
  }, [graph, epochMs]);

  const selectedInstance = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedDef = selectedInstance ? DEFAULT_REGISTRY.get(selectedInstance.type) : undefined;

  const handleLoadGraph = (newGraph: Graph, filename?: string) => {
    setGraph(newGraph);
    setSelectedNodeId(null);
    setEditorKey((k) => k + 1);
    if (filename) {
      setCurrentFilename(filename);
    }
  };

  const handleFilenameChange = (name: string, path: string | null) => {
    setCurrentFilename(name);
    setCurrentFilePath(path);
  };

  const onParamChange = (paramId: string, value: unknown) => {
    if (!selectedInstance) return;
    const nextNodes = graph.nodes.map((n) =>
      n.id === selectedInstance.id ? { ...n, params: { ...n.params, [paramId]: value } } : n,
    );
    setGraph({ ...graph, nodes: nextNodes });
  };

  const onSplitHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingSplit.current = true;
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!draggingSplit.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientY - rect.top) / rect.height) * 100;
      setSplitPercent(Math.min(MAX_PANE_PERCENT, Math.max(MIN_PANE_PERCENT, percent)));
    }
    function onMouseUp() {
      draggingSplit.current = false;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}
    >
      <TopBar
        graph={graph}
        onLoadGraph={handleLoadGraph}
        currentFilename={currentFilename}
        currentFilePath={currentFilePath}
        onFilenameChange={handleFilenameChange}
      />
      <div style={{ height: `${splitPercent}%`, minHeight: 0, position: "relative" }}>
        <Viewport
          graph={graph}
          registry={DEFAULT_REGISTRY}
          renderNodeId={findRenderNodeId(graph) ?? ""}
          epochMs={epochMs}
        />
        {selectedInstance && selectedDef && (
          <ParamPanel
            nodeId={selectedInstance.id}
            label={selectedDef.label}
            category={selectedDef.category}
            fields={
              selectedDef.dynamicParamFields
                ? selectedDef.dynamicParamFields(selectedInstance)
                : (selectedDef.paramFields ?? [])
            }
            params={{ ...selectedDef.defaultParams, ...selectedInstance.params }}
            onChange={onParamChange}
          />
        )}
      </div>
      <div
        onMouseDown={onSplitHandleMouseDown}
        style={{ height: 6, flexShrink: 0, cursor: "row-resize", background: "#2c333f" }}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        <GraphEditor
          key={editorKey}
          graph={graph}
          registry={DEFAULT_REGISTRY}
          onGraphChange={setGraph}
          onSelectNode={setSelectedNodeId}
        />
      </div>
    </div>
  );
}

export default App;
