import { cloneParams, cloneKeyframes } from "./cloneGraph";
import { Connection, KeyframeStore, NodeInstance } from "./types";

export interface GraphClipboardData {
  nodes: NodeInstance[];
  connections: Connection[];
  keyframes?: KeyframeStore;
}

let globalClipboard: GraphClipboardData | null = null;

export function setGraphClipboard(data: GraphClipboardData | null): void {
  if (!data || data.nodes.length === 0) {
    globalClipboard = null;
    return;
  }

  globalClipboard = {
    nodes: data.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: n.position.x, y: n.position.y },
      params: cloneParams(n.params),
    })),
    connections: data.connections.map((c) => ({ ...c })),
    keyframes: cloneKeyframes(data.keyframes),
  };
}

export function getGraphClipboard(): GraphClipboardData | null {
  if (!globalClipboard) return null;
  return {
    nodes: globalClipboard.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: n.position.x, y: n.position.y },
      params: cloneParams(n.params),
    })),
    connections: globalClipboard.connections.map((c) => ({ ...c })),
    keyframes: cloneKeyframes(globalClipboard.keyframes),
  };
}

export function hasGraphClipboard(): boolean {
  return globalClipboard !== null && globalClipboard.nodes.length > 0;
}
