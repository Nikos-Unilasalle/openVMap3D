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
  ReactFlowProvider,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as THREE from "three";
import { DEFAULT_PICKS } from "../shared/graph/calibration/picks";
import { findCompatibleSocket, segmentIntersectsRect } from "../shared/graph/insertOnWire";
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
const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 90;

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
  onGraphChange?: (graph: Graph) => void;
  onSelectNode: (nodeId: string | null) => void;
  selectedNodeId?: string | null;
}

function GraphEditorContent({ graph, registry, onGraphChange, onSelectNode, selectedNodeId }: GraphEditorProps) {
  const { screenToFlowPosition } = useReactFlow();

  const initialNodes = useMemo(() => {
    const raw = toFlowNodes(graph, registry);
    return refreshDynamicSockets(raw, toFlowEdges(graph, raw), graph.nodes, registry);
  }, [graph, registry]);
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(useMemo(() => toFlowEdges(graph, initialNodes), [graph, initialNodes]));

  const connectingHandleRef = useRef<{
    nodeId: string;
    handleId: string;
    handleType: "source" | "target";
  } | null>(null);
  const connectFiredRef = useRef(false);

  const [pendingWireConnection, setPendingWireConnection] = useState<{
    nodeId: string;
    handleId: string;
    handleType: "source" | "target";
    position: { x: number; y: number };
  } | null>(null);

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
      disposeNodeCaches(deletedIds);

      const nextNodes = nodes.filter((n) => !deletedIds.has(n.id));
      const nextEdges = edges.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target));

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

  const onConnectStart = useCallback((_: any, { nodeId, handleId, handleType }: any) => {
    connectingHandleRef.current = nodeId && handleId && handleType ? { nodeId, handleId, handleType } : null;
    connectFiredRef.current = false;
  }, []);

  const onConnect: OnConnect = useCallback(
    (connection) => {
      connectFiredRef.current = true;
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;
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

  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const onConnectEnd = useCallback(
    (event: any) => {
      const handleInfo = connectingHandleRef.current;
      connectingHandleRef.current = null;

      if (!handleInfo || connectFiredRef.current) return;

      let clientX = 0;
      let clientY = 0;
      if (event && "clientX" in event && typeof event.clientX === "number") {
        clientX = event.clientX;
        clientY = event.clientY;
      } else if (event && "changedTouches" in event && event.changedTouches?.length) {
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
      }

      const position = screenToFlowPosition({ x: clientX, y: clientY });

      setPendingWireConnection({
        nodeId: handleInfo.nodeId,
        handleId: handleInfo.handleId,
        handleType: handleInfo.handleType,
        position,
      });
      setSearchModalOpen(true);
    },
    [screenToFlowPosition],
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

  const onNodeDragStop = useCallback(
    (event: unknown, draggedNode: Node<GraphNodeData>) => {
      if (!(event instanceof MouseEvent) || !event.shiftKey) return;

      const nodesById = new Map(nodes.map((n) => [n.id, n]));
      const dimensionsOf = (n: Node<GraphNodeData>) => ({
        width: n.measured?.width ?? DEFAULT_NODE_WIDTH,
        height: n.measured?.height ?? DEFAULT_NODE_HEIGHT,
      });
      const draggedRect = { x: draggedNode.position.x, y: draggedNode.position.y, ...dimensionsOf(draggedNode) };

      const anchor = (n: Node<GraphNodeData>, side: "source" | "target") => {
        const { width, height } = dimensionsOf(n);
        return { x: n.position.x + (side === "source" ? width : 0), y: n.position.y + height / 2 };
      };

      const candidate = edges.find((edge) => {
        if (edge.source === draggedNode.id || edge.target === draggedNode.id) return false;
        const sourceNode = nodesById.get(edge.source);
        const targetNode = nodesById.get(edge.target);
        if (!sourceNode || !targetNode) return false;
        return segmentIntersectsRect(anchor(sourceNode, "source"), anchor(targetNode, "target"), draggedRect);
      });
      if (!candidate) return;

      const sourceSocket = nodesById.get(candidate.source)?.data.outputs.find((s) => s.id === candidate.sourceHandle);
      const targetSocket = nodesById.get(candidate.target)?.data.inputs.find((s) => s.id === candidate.targetHandle);
      if (!sourceSocket || !targetSocket) return;

      const inSocket = findCompatibleSocket(draggedNode.data.inputs, sourceSocket.type);
      const outSocket = findCompatibleSocket(draggedNode.data.outputs, targetSocket.type);
      if (!inSocket || !outSocket) return;

      const beforeEdge: Edge = {
        id: `${candidate.source}.${candidate.sourceHandle}->${draggedNode.id}.${inSocket.id}`,
        source: candidate.source,
        sourceHandle: candidate.sourceHandle,
        target: draggedNode.id,
        targetHandle: inSocket.id,
        style: candidate.style,
      };
      const afterEdge: Edge = {
        id: `${draggedNode.id}.${outSocket.id}->${candidate.target}.${candidate.targetHandle}`,
        source: draggedNode.id,
        sourceHandle: outSocket.id,
        target: candidate.target,
        targetHandle: candidate.targetHandle,
        style: { stroke: edgeColor(nodes, draggedNode.id, outSocket.id), strokeWidth: EDGE_STROKE_WIDTH },
      };

      const nextEdges = [
        ...edges.filter(
          (e) => e.id !== candidate.id && !(e.target === draggedNode.id && e.targetHandle === inSocket.id),
        ),
        beforeEdge,
        afterEdge,
      ];
      const nextNodes = refreshDynamicSockets(nodes, nextEdges, graph.nodes, registry);
      setNodes(nextNodes);
      setEdges(nextEdges);
      commit(nextNodes, nextEdges);
    },
    [commit, edges, graph.nodes, nodes, registry, setEdges, setNodes],
  );

  const onNodeClick = useCallback((_: unknown, node: Node<GraphNodeData>) => onSelectNode(node.id), [onSelectNode]);
  const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode]);

  const addNode = useCallback(
    (type: string) => {
      const def = registry.get(type);
      if (!def) return;
      const id = crypto.randomUUID();

      const position = pendingWireConnection
        ? { x: pendingWireConnection.position.x, y: pendingWireConnection.position.y }
        : { x: 60 + nodes.length * 24, y: 60 + nodes.length * 24 };

      const instance: NodeInstance = {
        id,
        type,
        params: cloneDefaultParams(def.defaultParams || {}),
        position,
      };

      const inputs = def.dynamicInputs ? def.dynamicInputs([]) : def.inputs;
      const outputs = def.outputs;

      const flowNode: Node<GraphNodeData> = {
        id,
        type: "graphNode",
        position,
        data: {
          nodeId: id,
          nodeType: type,
          label: def.label,
          category: def.category,
          inputs,
          outputs,
        },
      };

      let nextEdges = [...edges];

      if (pendingWireConnection) {
        const sourceNode = nodes.find((n) => n.id === pendingWireConnection.nodeId);

        if (pendingWireConnection.handleType === "source") {
          const sourceSocket = sourceNode?.data.outputs.find((s) => s.id === pendingWireConnection.handleId);
          const sourceType = sourceSocket?.type || "any";
          const matchingInput =
            inputs.find((s) => s.type === sourceType || s.type === "any" || sourceType === "any") || inputs[0];

          if (matchingInput) {
            const newEdge: Edge = {
              id: `${pendingWireConnection.nodeId}.${pendingWireConnection.handleId}->${id}.${matchingInput.id}`,
              source: pendingWireConnection.nodeId,
              sourceHandle: pendingWireConnection.handleId,
              target: id,
              targetHandle: matchingInput.id,
              style: {
                stroke: edgeColor(nodes, pendingWireConnection.nodeId, pendingWireConnection.handleId),
                strokeWidth: EDGE_STROKE_WIDTH,
              },
            };
            nextEdges.push(newEdge);
          }
        } else if (pendingWireConnection.handleType === "target") {
          const targetSocket = sourceNode?.data.inputs.find((s) => s.id === pendingWireConnection.handleId);
          const targetType = targetSocket?.type || "any";
          const matchingOutput =
            outputs.find((s) => s.type === targetType || s.type === "any" || targetType === "any") || outputs[0];

          if (matchingOutput) {
            const withoutConflict = nextEdges.filter(
              (e) => !(e.target === pendingWireConnection.nodeId && e.targetHandle === pendingWireConnection.handleId),
            );
            const newEdge: Edge = {
              id: `${id}.${matchingOutput.id}->${pendingWireConnection.nodeId}.${pendingWireConnection.handleId}`,
              source: id,
              sourceHandle: matchingOutput.id,
              target: pendingWireConnection.nodeId,
              targetHandle: pendingWireConnection.handleId,
              style: {
                stroke: SOCKET_COLOR[matchingOutput.type] || "#6b7280",
                strokeWidth: EDGE_STROKE_WIDTH,
              },
            };
            nextEdges = [...withoutConflict, newEdge];
          }
        }

        setPendingWireConnection(null);
      }

      const newInstances: NodeInstance[] = [instance];
      const newFlowNodes: Node<GraphNodeData>[] = [flowNode];

      // Auto-couple Directional and Spot Lights with an Empty target object
      if ((type === "light/directional" || type === "light/spot") && !pendingWireConnection) {
        const emptyDef = registry.get("object/empty");
        if (emptyDef) {
          const emptyId = crypto.randomUUID();
          const emptyPos = { x: position.x - 260, y: position.y };
          const emptyInstance: NodeInstance = {
            id: emptyId,
            type: "object/empty",
            params: cloneDefaultParams(emptyDef.defaultParams || {}),
            position: emptyPos,
          };
          const emptyFlowNode: Node<GraphNodeData> = {
            id: emptyId,
            type: "graphNode",
            position: emptyPos,
            data: {
              nodeId: emptyId,
              nodeType: "object/empty",
              label: "Target (Empty)",
              category: emptyDef.category,
              inputs: emptyDef.inputs,
              outputs: emptyDef.outputs,
            },
          };
          const targetEdge: Edge = {
            id: `${emptyId}.geometry->${id}.target`,
            source: emptyId,
            sourceHandle: "geometry",
            target: id,
            targetHandle: "target",
            style: {
              stroke: SOCKET_COLOR.geometry || "#22c55e",
              strokeWidth: EDGE_STROKE_WIDTH,
            },
          };
          newInstances.push(emptyInstance);
          newFlowNodes.push(emptyFlowNode);
          nextEdges.push(targetEdge);
        }
      }

      const unrefreshedNodes = [...nodes, ...newFlowNodes];
      const finalNodes = refreshDynamicSockets(unrefreshedNodes, nextEdges, [...graph.nodes, ...newInstances], registry);

      setNodes(finalNodes);
      setEdges(nextEdges);
      onGraphChange?.(toGraph([...graph.nodes, ...newInstances], finalNodes, nextEdges));
    },
    [graph, nodes, edges, pendingWireConnection, onGraphChange, registry, setNodes, setEdges],
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
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onEdgeContextMenu={onEdgeContextMenu}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          fitView
          colorMode="dark"
        >
          <Background color="#5b6572" gap={20} />
        </ReactFlow>
      </div>

      {searchModalOpen && (
        <NodeSearchModal
          registry={registry}
          onSelectNodeType={(type) => addNode(type)}
          onClose={() => {
            setSearchModalOpen(false);
            setPendingWireConnection(null);
          }}
        />
      )}
    </div>
  );
}

export function GraphEditor(props: GraphEditorProps) {
  return (
    <ReactFlowProvider>
      <GraphEditorContent {...props} />
    </ReactFlowProvider>
  );
}
