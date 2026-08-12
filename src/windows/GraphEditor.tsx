import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  Connection as FlowConnection,
  Edge,
  EdgeMouseHandler,
  Node,
  NodeChange,
  OnConnect,
  ReactFlow,
  SelectionMode,
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
        nodeId: instance.id,
        nodeType: instance.type,
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

/**
 * A node whose def has `dynamicInputs` (e.g. Merge) shows a socket list
 * derived from its own live connections, not a fixed `def.inputs` — this
 * recomputes that list for every such node from the current flow edges.
 * Run after anything that adds/removes an edge, so a just-wired trailing
 * socket's replacement appears immediately, in the same state update.
 */
function refreshDynamicSockets(
  flowNodes: Node<GraphNodeData>[],
  flowEdges: Edge[],
  baseNodes: NodeInstance[],
  registry: NodeRegistry,
): Node<GraphNodeData>[] {
  return flowNodes.map((flowNode) => {
    const instance = baseNodes.find((n) => n.id === flowNode.id);
    const def = instance && registry.get(instance.type);
    if (!def?.dynamicInputs && !def?.dynamicOutputs) return flowNode;

    const nodeIncomingConnections = flowEdges.filter((e) => e.target === flowNode.id);
    const nodeConnectionsWithTypes = nodeIncomingConnections.map((e) => {
      const sourceNode = flowNodes.find((n) => n.id === e.source);
      const sourceSocketDef = sourceNode?.data.outputs.find((s) => s.id === e.sourceHandle);
      return {
        connection: {
          id: e.id,
          fromNode: e.source,
          fromSocket: e.sourceHandle ?? "",
          toNode: e.target,
          toSocket: e.targetHandle ?? "",
        },
        sourceSocketType: sourceSocketDef?.type || ("any" as const),
      };
    });

    const connList = nodeConnectionsWithTypes.map((ct) => ct.connection);

    let nextInputs = flowNode.data.inputs;
    if (def.dynamicInputs) {
      nextInputs = def.dynamicInputs(connList, nodeConnectionsWithTypes);
    }

    let nextOutputs = flowNode.data.outputs;
    if (def.dynamicOutputs) {
      nextOutputs = def.dynamicOutputs(connList, nodeConnectionsWithTypes);
    }

    return {
      ...flowNode,
      data: {
        ...flowNode.data,
        inputs: nextInputs,
        outputs: nextOutputs,
      },
    };
  });
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
 *
 * Left-drag on empty canvas draws a selection box (selects any node it
 * touches) instead of panning — panning moved to middle/right-click-drag,
 * the same tradeoff most node editors (Blender included) make once
 * drag-select exists, since a plain click already pans nowhere useful but
 * a stray left-drag was the only way to box-select nodes.
 */
export function GraphEditor({ graph, registry, onGraphChange, onSelectNode }: GraphEditorProps) {
  const initialNodes = useMemo(() => {
    const raw = toFlowNodes(graph, registry);
    return refreshDynamicSockets(raw, toFlowEdges(graph, raw), graph.nodes, registry);
  }, [graph, registry]);
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(useMemo(() => toFlowEdges(graph, initialNodes), [graph, initialNodes]));

  useEffect(() => {
    setNodes((prevNodes) =>
      prevNodes.map((fn) => {
        const graphNode = graph.nodes.find((gn) => gn.id === fn.id);
        if (!graphNode) return fn;
        if (fn.data.params !== graphNode.params) {
          return {
            ...fn,
            data: {
              ...fn.data,
              params: graphNode.params,
            },
          };
        }
        return fn;
      })
    );
  }, [graph.nodes, setNodes]);

  // useEdgesState only seeds its state from its *initial* argument — once
  // mounted, this component's own `edges` never re-derives from the
  // `graph.connections` prop again on its own, only from setEdges calls
  // this component itself makes (onConnect, onEdgeContextMenu). That's
  // fine as long as every edit route runs through this component, but it's
  // a silent trap the moment one doesn't (a project reload used to remount
  // via `key`, sidestepping it — this effect is the general-case fix
  // instead of relying on every future caller remembering that trick).
  // Content-compared rather than replaced outright: our own commit() calls
  // round-trip straight back through this same `graph` prop, and swapping
  // in a referentially-new-but-identical array every time would fire this
  // effect in a loop.
  useEffect(() => {
    setEdges((prevEdges) => {
      const nextEdges = toFlowEdges(graph, nodes);
      const unchanged =
        prevEdges.length === nextEdges.length &&
        prevEdges.every(
          (e, i) =>
            e.id === nextEdges[i].id &&
            e.source === nextEdges[i].source &&
            e.sourceHandle === nextEdges[i].sourceHandle &&
            e.target === nextEdges[i].target &&
            e.targetHandle === nextEdges[i].targetHandle,
        );
      return unchanged ? prevEdges : nextEdges;
    });
  }, [graph.connections, nodes, setEdges]);

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
      if (!sourceSocket || !targetSocket) return false;
      if (sourceSocket.type === "any" || targetSocket.type === "any") return true;
      return sourceSocket.type === targetSocket.type;
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
      const nextEdges = [...withoutConflict, newEdge];
      const nextNodes = refreshDynamicSockets(nodes, nextEdges, graph.nodes, registry);
      setNodes(nextNodes);
      setEdges(nextEdges);
      commit(nextNodes, nextEdges);
    },
    [commit, edges, graph.nodes, nodes, registry, setEdges, setNodes],
  );

  const onEdgeContextMenu: EdgeMouseHandler = useCallback(
    (event, edge) => {
      event.preventDefault();
      const nextEdges = applyEdgeChanges([{ type: "remove", id: edge.id }], edges);
      const nextNodes = refreshDynamicSockets(nodes, nextEdges, graph.nodes, registry);
      setNodes(nextNodes);
      setEdges(nextEdges);
      commit(nextNodes, nextEdges);
    },
    [commit, edges, graph.nodes, nodes, registry, setEdges, setNodes],
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
        data: {
          nodeId: id,
          nodeType: type,
          label: def.label,
          category: def.category,
          inputs: def.dynamicInputs ? def.dynamicInputs([]) : def.inputs,
          outputs: def.outputs,
        },
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
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          fitView
          colorMode="dark"
        >
          <Background color="#2c333f" gap={20} />
        </ReactFlow>
      </div>
    </div>
  );
}
