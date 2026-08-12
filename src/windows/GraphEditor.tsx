import { useCallback, useMemo } from "react";
import {
  Background,
  Connection as FlowConnection,
  Edge,
  EdgeMouseHandler,
  Node,
  NodeChange,
  OnConnect,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SOCKET_COLOR } from "../shared/graph/sockets";
import { Connection, Graph, NodeInstance, NodeRegistry } from "../shared/graph/types";
import { GraphNode, GraphNodeData } from "./GraphNode";
import { NodePalette } from "./NodePalette";
import "./graph-editor.css";

const NODE_TYPES = { graphNode: GraphNode };
const EDGE_STROKE_WIDTH = 3;

function toFlowNodes(graph: Graph, registry: NodeRegistry): Node<GraphNodeData>[] {
  return graph.nodes.map((instance) => {
    const def = registry.get(instance.type);
    return {
      id: instance.id,
      type: "graphNode",
      position: instance.position,
      data: {
        label: def?.label ?? `${instance.type} (unknown)`,
        category: def?.category,
        inputs: def?.inputs ?? [],
        outputs: def?.outputs ?? [],
      },
    };
  });
}

/** A wire's color follows its *source* socket's type — by construction the target matches, since isValidConnection rejects mismatched types. */
function edgeColor(nodes: Node<GraphNodeData>[], nodeId: string, socketId: string): string {
  const socket = nodes.find((n) => n.id === nodeId)?.data.outputs.find((s) => s.id === socketId);
  return socket ? SOCKET_COLOR[socket.type] : "#6b7280";
}

function toFlowEdges(graph: Graph, flowNodes: Node<GraphNodeData>[]): Edge[] {
  return graph.connections.map((conn) => ({
    id: conn.id,
    source: conn.fromNode,
    sourceHandle: conn.fromSocket,
    target: conn.toNode,
    targetHandle: conn.toSocket,
    style: { stroke: edgeColor(flowNodes, conn.fromNode, conn.fromSocket), strokeWidth: EDGE_STROKE_WIDTH },
  }));
}

/** Positions come from the live xyflow nodes; everything else (type, params) is untouched — this slice never adds/removes/reparams a node, only moves it and rewires it. */
function toGraph(baseNodes: NodeInstance[], flowNodes: Node<GraphNodeData>[], flowEdges: Edge[]): Graph {
  const nodes = baseNodes.map((n) => {
    const flowNode = flowNodes.find((f) => f.id === n.id);
    return flowNode ? { ...n, position: flowNode.position } : n;
  });
  const connections: Connection[] = flowEdges.map((e) => ({
    id: e.id,
    fromNode: e.source,
    fromSocket: e.sourceHandle ?? "",
    toNode: e.target,
    toSocket: e.targetHandle ?? "",
  }));
  return { nodes, connections };
}

interface GraphEditorProps {
  graph: Graph;
  registry: NodeRegistry;
  /** Called after any drag or rewire with the updated graph — the parent (App) owns the actual Graph state, this component just edits it. */
  onGraphChange?: (graph: Graph) => void;
  /** Selection lives in the parent (App) — the param panel it drives is rendered over the Viewport, not here. */
  onSelectNode: (nodeId: string | null) => void;
}

/**
 * Writable: dragging a node persists its position, dragging a wire from one
 * socket to another creates a connection (type-checked — a Value output
 * cannot plug into a Vector input), right-click on a wire deletes it,
 * clicking a node selects it (see App.tsx for what renders from that),
 * clicking a node in the palette adds one. Node removal is still the next
 * slice — this one can grow the graph but not shrink it.
 */
export function GraphEditor({ graph, registry, onGraphChange, onSelectNode }: GraphEditorProps) {
  const initialNodes = useMemo(() => toFlowNodes(graph, registry), [graph, registry]);
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(useMemo(() => toFlowEdges(graph, initialNodes), [graph, initialNodes]));

  const commit = useCallback(
    (nextNodes: Node<GraphNodeData>[], nextEdges: Edge[]) => {
      onGraphChange?.(toGraph(graph.nodes, nextNodes, nextEdges));
    },
    [graph.nodes, onGraphChange],
  );

  // commit() calls the parent's setGraph — it must never run inside a
  // setNodes/setEdges *updater function*, only after, as a plain call in the
  // handler body. React treats a setState-from-another-component call made
  // from inside an updater as happening "during render" and warns/breaks.
  const onNodesChange = useCallback(
    (changes: NodeChange<Node<GraphNodeData>>[]) => {
      const next = applyNodeChanges(changes, nodes);
      setNodes(next);
      commit(next, edges);
    },
    [commit, edges, nodes, setNodes],
  );

  const isValidConnection = useCallback(
    (connection: FlowConnection | Edge) => {
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
        return false;
      }
      const sourceSocket = nodes
        .find((n) => n.id === connection.source)
        ?.data.outputs.find((s) => s.id === connection.sourceHandle);
      const targetSocket = nodes
        .find((n) => n.id === connection.target)
        ?.data.inputs.find((s) => s.id === connection.targetHandle);
      return !!sourceSocket && !!targetSocket && sourceSocket.type === targetSocket.type;
    },
    [nodes],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;
      // an input socket takes one wire — a new connection into it replaces whatever was there
      const withoutConflict = edges.filter(
        (e) => !(e.target === connection.target && e.targetHandle === connection.targetHandle),
      );
      const newEdge: Edge = {
        id: `${connection.source}.${connection.sourceHandle}->${connection.target}.${connection.targetHandle}`,
        source: connection.source!,
        sourceHandle: connection.sourceHandle,
        target: connection.target!,
        targetHandle: connection.targetHandle,
        style: { stroke: edgeColor(nodes, connection.source!, connection.sourceHandle!), strokeWidth: EDGE_STROKE_WIDTH },
      };
      const next = [...withoutConflict, newEdge];
      setEdges(next);
      commit(nodes, next);
    },
    [commit, edges, nodes, setEdges],
  );

  const onEdgeContextMenu: EdgeMouseHandler = useCallback(
    (event, edge) => {
      event.preventDefault();
      const next = applyEdgeChanges([{ type: "remove", id: edge.id }], edges);
      setEdges(next);
      commit(nodes, next);
    },
    [commit, edges, nodes, setEdges],
  );

  const onNodeClick = useCallback((_: unknown, node: Node<GraphNodeData>) => onSelectNode(node.id), [onSelectNode]);
  const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode]);

  // Cascades new nodes diagonally so repeated adds don't stack exactly on
  // top of each other — same "paste offset" trick most node/vector editors use.
  const addNode = useCallback(
    (type: string) => {
      const def = registry.get(type);
      if (!def) return;
      const id = crypto.randomUUID();
      const position = { x: 60 + nodes.length * 24, y: 60 + nodes.length * 24 };
      const instance: NodeInstance = { id, type, params: {}, position };
      const flowNode: Node<GraphNodeData> = {
        id,
        type: "graphNode",
        position,
        data: { label: def.label, category: def.category, inputs: def.inputs, outputs: def.outputs },
      };
      const nextNodes = [...nodes, flowNode];
      setNodes(nextNodes);
      onGraphChange?.({ ...graph, nodes: [...graph.nodes, instance] });
    },
    [graph, nodes, onGraphChange, registry, setNodes],
  );

  const paletteNodes = useMemo(() => [...registry.values()], [registry]);

  return (
    <div className="graph-editor">
      <NodePalette nodes={paletteNodes} onAddNode={addNode} />
      <div className="graph-editor-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onEdgeContextMenu={onEdgeContextMenu}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
          colorMode="dark"
        >
          <Background color="#2c333f" gap={20} />
        </ReactFlow>
      </div>
    </div>
  );
}
