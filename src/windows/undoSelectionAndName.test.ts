import { describe, expect, it } from "vitest";
import { Graph, NodeInstance } from "../shared/graph/types";

describe("Undo selection persistence", () => {
  interface HistoryEntry {
    graph: Graph;
    selectedNodeId: string | null;
    selectedNodeIds: string[];
  }

  function resolveUndoTarget(
    currentSelectedId: string | null,
    currentSelectedIds: string[],
    previous: HistoryEntry,
  ): { targetId: string | null; targetIds: string[] } {
    let targetId: string | null = null;
    let targetIds: string[] = [];
    if (currentSelectedId && previous.graph.nodes.some((n) => n.id === currentSelectedId)) {
      targetId = currentSelectedId;
      targetIds = currentSelectedIds.filter((id) => previous.graph.nodes.some((n) => n.id === id));
      if (targetIds.length === 0) targetIds = [currentSelectedId];
    } else if (previous.selectedNodeId && previous.graph.nodes.some((n) => n.id === previous.selectedNodeId)) {
      targetId = previous.selectedNodeId;
      targetIds = previous.selectedNodeIds.filter((id) => previous.graph.nodes.some((n) => n.id === id));
      if (targetIds.length === 0) targetIds = [targetId];
    }
    return { targetId, targetIds };
  }

  it("preserves currently selected node if it still exists after undo", () => {
    const nodeA: NodeInstance = { id: "node-a", type: "math/number", position: { x: 0, y: 0 }, params: { value: 1 } };
    const nodeB: NodeInstance = { id: "node-b", type: "math/number", position: { x: 100, y: 0 }, params: { value: 2 } };

    const snapshot: HistoryEntry = {
      graph: { nodes: [nodeA, nodeB], connections: [] },
      selectedNodeId: "node-b",
      selectedNodeIds: ["node-b"],
    };

    // User is currently selecting node-a and presses undo
    const result = resolveUndoTarget("node-a", ["node-a"], snapshot);
    expect(result.targetId).toBe("node-a");
    expect(result.targetIds).toEqual(["node-a"]);
  });

  it("restores snapshot selected node if the current selected node was created after snapshot and deleted on undo", () => {
    const nodeA: NodeInstance = { id: "node-a", type: "math/number", position: { x: 0, y: 0 }, params: {} };
    const snapshot: HistoryEntry = {
      graph: { nodes: [nodeA], connections: [] },
      selectedNodeId: "node-a",
      selectedNodeIds: ["node-a"],
    };

    // Current node-c was added after snapshot, so undo removes it
    const result = resolveUndoTarget("node-c", ["node-c"], snapshot);
    expect(result.targetId).toBe("node-a");
    expect(result.targetIds).toEqual(["node-a"]);
  });
});

describe("Node custom name", () => {
  it("extracts custom name from params for canvas node data", () => {
    const nodeInstance: NodeInstance = {
      id: "test-node",
      type: "transform/transform",
      position: { x: 10, y: 20 },
      params: { name: "Player Root" },
    };

    const customName = typeof nodeInstance.params?.name === "string" ? nodeInstance.params.name : "";
    expect(customName).toBe("Player Root");
  });

  it("defaults to empty string when name param is absent or not a string", () => {
    const nodeInstance: NodeInstance = {
      id: "test-node",
      type: "transform/transform",
      position: { x: 10, y: 20 },
      params: {},
    };

    const customName = typeof nodeInstance.params?.name === "string" ? nodeInstance.params.name : "";
    expect(customName).toBe("");
  });
});
