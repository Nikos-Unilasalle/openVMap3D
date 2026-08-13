import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import * as THREE from "three";
import { DEFAULT_PICKS } from "../shared/graph/calibration/picks";
import { disposeNodeCaches } from "../shared/graph/nodeCaches";
import { SOCKET_COLOR } from "../shared/graph/sockets";
import { Connection, Graph, NodeInstance, NodeRegistry } from "../shared/graph/types";
import { GraphNode, GraphNodeData } from "./GraphNode";
import { NodePalette } from "./NodePalette";
import { NodeSearchModal } from "./NodeSearchModal";
import "./graph-editor.css";

function cloneDefaultParams(defaultParams: Record<string, unknown>): Record<string, unknown> {
  const cloned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(defaultParams)) {
    if (value instanceof THREE.Color) {
      cloned[key] = value.clone();
    } else if (value instanceof THREE.Vector3) {
      cloned[key] = value.clone();
    } else if (value instanceof THREE.Matrix4) {
      cloned[key] = value.clone();
    } else if (typeof value === "object" && value !== null) {
      cloned[key] = JSON.parse(JSON.stringify(value));
    } else {
      cloned[key] = value;
    }
  }
  return cloned;
}

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
  const flowNodeIds = new Set(flowNodes.map((f) => f.id));
  const nodes = baseNodes
    .filter((n) => flowNodeIds.has(n.id))
    .map((n) => {
      const flowNode = flowNodes.find((f) => f.id === n.id);
      return flowNode ? { ...n, position: flowNode.position } : n;
    });
  const connections: Connection[] = flowEdges
    .filter((e) => flowNodeIds.has(e.source) && flowNodeIds.has(e.target))
    .map((e) => ({
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
  selectedNodeId?: string | null;
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
export function GraphEditor({ graph, registry, onGraphChange, onSelectNode, selectedNodeId }: GraphEditorProps) {
  const initialNodes = useMemo(() => {
    const raw = toFlowNodes(graph, registry);
    return refreshDynamicSockets(raw, toFlowEdges(graph, raw), graph.nodes, registry);
  }, [graph, registry]);
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(useMemo(() => toFlowEdges(graph, initialNodes), [graph, initialNodes]));

  useEffect(() => {
    const rawNodes = toFlowNodes(graph, registry);
    const flowEdges = toFlowEdges(graph, rawNodes);
    const nextNodes = refreshDynamicSockets(rawNodes, flowEdges, graph.nodes, registry);

    setNodes((prevNodes) => {
      const prevIds = prevNodes.map((n) => n.id).join(",");
      const nextIds = nextNodes.map((n) => n.id).join(",");
      if (prevIds !== nextIds) {
        return nextNodes;
      }
      return prevNodes.map((fn) => {
        const graphNode = graph.nodes.find((gn) => gn.id === fn.id);
        if (!graphNode) return fn;
        return {
          ...fn,
          position: graphNode.position,
          data: {
            ...fn.data,
            params: graphNode.params,
          },
        };
      });
    });

    setEdges((prevEdges) => {
      const unchanged =
        prevEdges.length === flowEdges.length &&
        prevEdges.every(
          (e, i) =>
            e.id === flowEdges[i].id &&
            e.source === flowEdges[i].source &&
            e.sourceHandle === flowEdges[i].sourceHandle &&
            e.target === flowEdges[i].target &&
            e.targetHandle === flowEdges[i].targetHandle,
        );
      return unchanged ? prevEdges : flowEdges;
    });
  }, [graph, registry, setNodes, setEdges]);

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

  const onEdgesChange = useCallback(
    (changes: any) => {
      const nextEdges = applyEdgeChanges(changes, edges);
      const nextNodes = refreshDynamicSockets(nodes, nextEdges, graph.nodes, registry);
      setNodes(nextNodes);
      setEdges(nextEdges);
      commit(nextNodes, nextEdges);
    },
    [commit, edges, graph.nodes, nodes, registry, setEdges, setNodes],
  );

  const onNodesDelete = useCallback(
    (deletedNodes: Node<GraphNodeData>[]) => {
      const deletedIds = new Set(deletedNodes.map((n) => n.id));

      // Node ids are stable — saved into .ovm files and restored identically
      // by undo — so a node whose per-node caches were never cleared would
      // come back holding its *previous* mesh, texture or remembered state.
      // Deleting a node and adding it again looked like it remembered the old
      // values because it did. See nodeCaches.ts.
      disposeNodeCaches(deletedIds);

      const nextNodes = nodes.filter((n) => !deletedIds.has(n.id));
      const nextEdges = edges.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target));

      // Reset calibration picks on any camera whose room corner input was disconnected/deleted
      const updatedGraphNodes = graph.nodes
        .filter((n) => !deletedIds.has(n.id))
        .map((n) => {
          if (n.type === "camera") {
            const hasRefPoints = nextEdges.some((e) => e.target === n.id && e.targetHandle === "refPoints");
            if (!hasRefPoints) {
              return { ...n, params: { ...n.params, calibrationPicks: { ...DEFAULT_PICKS } } };
            }
          }
          return n;
        });

      const refreshedNodes = refreshDynamicSockets(nextNodes, nextEdges, updatedGraphNodes, registry);
      setNodes(refreshedNodes);
      setEdges(nextEdges);
      onGraphChange?.(toGraph(updatedGraphNodes, refreshedNodes, nextEdges));
    },
    [edges, graph.nodes, nodes, onGraphChange, registry, setEdges, setNodes],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      const deletedIds = new Set(deletedEdges.map((e) => e.id));
      const nextEdges = edges.filter((e) => !deletedIds.has(e.id));
      const nextNodes = refreshDynamicSockets(nodes, nextEdges, graph.nodes, registry);
      setNodes(nextNodes);
      setEdges(nextEdges);
      commit(nextNodes, nextEdges);
    },
    [commit, edges, graph.nodes, nodes, registry, setEdges, setNodes],
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
      const instance: NodeInstance = {
        id,
        type,
        params: cloneDefaultParams(def.defaultParams || {}),
        position,
      };
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

  const clipboardRef = useRef<{ nodes: NodeInstance[]; connections: Connection[] } | null>(null);

  const getSelectedNodeInstances = useCallback(() => {
    const selectedFlowNodes = nodes.filter((n) => n.selected);
    if (selectedFlowNodes.length > 0) {
      const selectedIds = new Set(selectedFlowNodes.map((n) => n.id));
      return graph.nodes.filter((n) => selectedIds.has(n.id));
    }
    if (selectedNodeId) {
      return graph.nodes.filter((n) => n.id === selectedNodeId);
    }
    return [];
  }, [graph.nodes, nodes, selectedNodeId]);

  const copySelected = useCallback(() => {
    const selected = getSelectedNodeInstances();
    if (selected.length === 0) return;

    const selectedIds = new Set(selected.map((n) => n.id));
    const internalConnections = graph.connections.filter(
      (c) => selectedIds.has(c.fromNode) && selectedIds.has(c.toNode),
    );

    clipboardRef.current = {
      nodes: JSON.parse(JSON.stringify(selected)),
      connections: JSON.parse(JSON.stringify(internalConnections)),
    };
  }, [getSelectedNodeInstances, graph.connections]);

  const pasteClipboard = useCallback(() => {
    if (!clipboardRef.current || clipboardRef.current.nodes.length === 0) return;

    const { nodes: clipNodes, connections: clipConns } = clipboardRef.current;
    const idMap = new Map<string, string>();

    const newInstances: NodeInstance[] = clipNodes.map((n: NodeInstance) => {
      const newId = crypto.randomUUID();
      idMap.set(n.id, newId);
      return {
        ...JSON.parse(JSON.stringify(n)),
        id: newId,
        position: { x: n.position.x + 30, y: n.position.y + 30 },
      };
    });

    const newConnections: Connection[] = clipConns.map((c: Connection) => ({
      id: `${idMap.get(c.fromNode)}.${c.fromSocket}->${idMap.get(c.toNode)}.${c.toSocket}`,
      fromNode: idMap.get(c.fromNode)!,
      fromSocket: c.fromSocket,
      toNode: idMap.get(c.toNode)!,
      toSocket: c.toSocket,
    }));

    const newFlowNodes: Node<GraphNodeData>[] = newInstances.map((instance) => {
      const def = registry.get(instance.type);
      return {
        id: instance.id,
        type: "graphNode",
        position: instance.position,
        selected: true,
        data: {
          nodeId: instance.id,
          nodeType: instance.type,
          label: def?.label ?? instance.type,
          category: def?.category,
          inputs: def?.dynamicInputs ? def.dynamicInputs([]) : def?.inputs ?? [],
          outputs: def?.outputs ?? [],
          params: instance.params,
        },
      };
    });

    const unselectedPrevNodes = nodes.map((n) => ({ ...n, selected: false }));
    const nextFlowNodes = [...unselectedPrevNodes, ...newFlowNodes];

    const nextGraph: Graph = {
      nodes: [...graph.nodes, ...newInstances],
      connections: [...graph.connections, ...newConnections],
    };

    setNodes(nextFlowNodes);
    onGraphChange?.(nextGraph);

    if (newInstances.length === 1) {
      onSelectNode(newInstances[0].id);
    }

    clipboardRef.current = {
      nodes: newInstances,
      connections: newConnections,
    };
  }, [graph, nodes, onGraphChange, onSelectNode, registry, setNodes]);

  const duplicateSelected = useCallback(() => {
    copySelected();
    pasteClipboard();
  }, [copySelected, pasteClipboard]);

  const [searchModalOpen, setSearchModalOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          (activeEl as HTMLElement).isContentEditable);

      if (isInput) return;

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;
      const code = e.code;

      if (code === "Space" || e.key === " ") {
        e.preventDefault();
        setSearchModalOpen(true);
      } else if (isCmdOrCtrl && isShift && code === "KeyM") {
        e.preventDefault();
        addNode("merge");
      } else if (isCmdOrCtrl && isShift && code === "KeyT") {
        e.preventDefault();
        addNode("transform/matrix-transform");
      } else if (isCmdOrCtrl && isShift && code === "KeyV") {
        e.preventDefault();
        addNode("value/constant");
      } else if (isCmdOrCtrl && !isShift && code === "KeyT") {
        e.preventDefault();
        addNode("transform");
      } else if (isCmdOrCtrl && !isShift && code === "KeyP") {
        e.preventDefault();
        addNode("transform/parent");
      } else if (isCmdOrCtrl && !isShift && code === "KeyM") {
        e.preventDefault();
        addNode("value/math");
      } else if (isCmdOrCtrl && !isShift && code === "KeyD") {
        e.preventDefault();
        duplicateSelected();
      } else if (isCmdOrCtrl && !isShift && code === "KeyC") {
        e.preventDefault();
        copySelected();
      } else if (isCmdOrCtrl && !isShift && code === "KeyV") {
        e.preventDefault();
        pasteClipboard();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addNode, copySelected, duplicateSelected, pasteClipboard]);

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
          onEdgesChange={onEdgesChange}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
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

      {searchModalOpen && (
        <NodeSearchModal
          registry={registry}
          onSelectNodeType={(type) => addNode(type)}
          onClose={() => setSearchModalOpen(false)}
        />
      )}
    </div>
  );
}
