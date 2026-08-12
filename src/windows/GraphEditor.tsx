import { useMemo } from "react";
import { Background, Edge, Node, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Graph, NodeRegistry } from "../shared/graph/types";
import { GraphNode, GraphNodeData } from "./GraphNode";
import "./graph-editor.css";

const NODE_TYPES = { graphNode: GraphNode };

function toFlowNodes(graph: Graph, registry: NodeRegistry): Node<GraphNodeData>[] {
  return graph.nodes.map((instance) => {
    const def = registry.get(instance.type);
    return {
      id: instance.id,
      type: "graphNode",
      position: instance.position,
      data: {
        label: def?.label ?? `${instance.type} (unknown)`,
        inputs: def?.inputs ?? [],
        outputs: def?.outputs ?? [],
      },
    };
  });
}

function toFlowEdges(graph: Graph): Edge[] {
  return graph.connections.map((conn) => ({
    id: conn.id,
    source: conn.fromNode,
    sourceHandle: conn.fromSocket,
    target: conn.toNode,
    targetHandle: conn.toSocket,
  }));
}

interface GraphEditorProps {
  graph: Graph;
  registry: NodeRegistry;
}

/**
 * View-only today: shows the graph's nodes and connections, nodes are
 * draggable (xyflow's default, free), but dragging doesn't write back to
 * `graph` and there's no way yet to add a node or draw a new connection.
 * That's the next slice — this one proves the graph is representable and
 * legible as a canvas at all, alongside the live Viewport rendering the
 * same graph's output.
 */
export function GraphEditor({ graph, registry }: GraphEditorProps) {
  const nodes = useMemo(() => toFlowNodes(graph, registry), [graph, registry]);
  const edges = useMemo(() => toFlowEdges(graph), [graph]);

  return (
    <div className="graph-editor">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} fitView colorMode="dark">
        <Background color="#2c333f" gap={20} />
      </ReactFlow>
    </div>
  );
}
