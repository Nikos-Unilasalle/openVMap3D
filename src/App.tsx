import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_REGISTRY } from "./shared/graph/nodes";
import { Connection, Graph, NodeInstance } from "./shared/graph/types";
import { Viewport } from "./shared/three/Viewport";
import { GraphEditor } from "./windows/GraphEditor";
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

function App() {
  const [graph, setGraph] = useState<Graph>(buildSmokeTestGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const [currentFilename, setCurrentFilename] = useState("project_v1.ovm");
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingSplit = useRef(false);

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
        <Viewport graph={graph} registry={DEFAULT_REGISTRY} renderNodeId="output" />
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
