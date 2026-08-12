import { useMemo } from "react";
import { DEFAULT_REGISTRY } from "./shared/graph/nodes";
import { Connection, Graph, NodeInstance } from "./shared/graph/types";
import { Viewport } from "./shared/three/Viewport";

function node(id: string, type: string, params: Record<string, unknown> = {}): NodeInstance {
  return { id, type, params, position: { x: 0, y: 0 } };
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
      node("time", "time"),
      node("rotationVector", "vector/compose", { x: 0, z: 0 }),
      node("boxTransform", "transform"),
      node("box", "object/box"),
      node("output", "render"),
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
  const graph = useMemo(buildSmokeTestGraph, []);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Viewport graph={graph} registry={DEFAULT_REGISTRY} renderNodeId="output" />
    </div>
  );
}

export default App;
