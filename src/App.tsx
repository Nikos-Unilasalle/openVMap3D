import { useState } from "react";
import { DEFAULT_REGISTRY } from "./shared/graph/nodes";
import { Connection, Graph, NodeInstance } from "./shared/graph/types";
import { Viewport } from "./shared/three/Viewport";
import { GraphEditor } from "./windows/GraphEditor";
import { ParamPanel } from "./windows/ParamPanel";

function node(id: string, type: string, position: { x: number; y: number }, params: Record<string, unknown> = {}): NodeInstance {
  return { id, type, params, position };
}

function edge(fromNode: string, fromSocket: string, toNode: string, toSocket: string): Connection {
  return { id: `${fromNode}.${fromSocket}->${toNode}.${toSocket}`, fromNode, fromSocket, toNode, toSocket };
}

/**
 * Hand-built smoke-test graph: Time -> Compose Vector -> Transform -> Object
 * (Box) -> Render. Proves the whole pipe end to end — a live signal reaching
 * a rendered, moving 3D object — before there's an editor to build this kind
 * of graph interactively. Delete once the node editor (task: xyflow canvas)
 * can build and load one instead.
 */
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

function App() {
  const [graph, setGraph] = useState<Graph>(buildSmokeTestGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedInstance = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedDef = selectedInstance ? DEFAULT_REGISTRY.get(selectedInstance.type) : undefined;

  const onParamChange = (paramId: string, value: unknown) => {
    if (!selectedInstance) return;
    const nextNodes = graph.nodes.map((n) =>
      n.id === selectedInstance.id ? { ...n, params: { ...n.params, [paramId]: value } } : n,
    );
    setGraph({ ...graph, nodes: nextNodes });
  };

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: "2 1 0", minHeight: 0, position: "relative" }}>
        <Viewport graph={graph} registry={DEFAULT_REGISTRY} renderNodeId="output" />
        {selectedInstance && selectedDef && (
          <ParamPanel
            label={selectedDef.label}
            fields={selectedDef.paramFields ?? []}
            params={{ ...selectedDef.defaultParams, ...selectedInstance.params }}
            onChange={onParamChange}
          />
        )}
      </div>
      <div style={{ flex: "1 1 0", minHeight: 0, borderTop: "1px solid #2c333f" }}>
        <GraphEditor graph={graph} registry={DEFAULT_REGISTRY} onGraphChange={setGraph} onSelectNode={setSelectedNodeId} />
      </div>
    </div>
  );
}

export default App;
