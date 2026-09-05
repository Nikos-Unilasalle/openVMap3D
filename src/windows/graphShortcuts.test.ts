import { describe, expect, it } from "vitest";
import { isTimelineZone, setInputZone } from "../shared/graph/inputZoneStore";

describe("Graph shortcuts and input zone handling", () => {
  function shouldDeleteGraphSelection(
    key: string,
    isInput: boolean,
    hasSelectedNodesOrEdges: boolean,
  ): boolean {
    if (isInput) return false;
    if (key !== "Delete" && key !== "Backspace") return false;
    if (isTimelineZone()) return false;
    return hasSelectedNodesOrEdges;
  }

  function shouldOpenNodeSearch(
    key: string,
    code: string,
    isCmdOrCtrl: boolean,
    isInput: boolean,
  ): boolean {
    if (isInput) return false;
    return Boolean(isCmdOrCtrl && (code === "Space" || key === " "));
  }

  it("deletes selected nodes when Delete or Backspace is pressed outside the timeline", () => {
    setInputZone(null);
    expect(shouldDeleteGraphSelection("Delete", false, true)).toBe(true);
    expect(shouldDeleteGraphSelection("Backspace", false, true)).toBe(true);

    setInputZone("graph");
    expect(shouldDeleteGraphSelection("Delete", false, true)).toBe(true);
  });

  it("does NOT delete nodes if cursor is over the timeline", () => {
    setInputZone("timeline");
    expect(shouldDeleteGraphSelection("Delete", false, true)).toBe(false);
    expect(shouldDeleteGraphSelection("Backspace", false, true)).toBe(false);
  });

  it("does NOT delete nodes if typing in an input", () => {
    setInputZone("graph");
    expect(shouldDeleteGraphSelection("Delete", true, true)).toBe(false);
    setInputZone(null);
    expect(shouldDeleteGraphSelection("Delete", true, true)).toBe(false);
  });

  it("opens node search with Cmd+Space even if input zone is null", () => {
    setInputZone(null);
    expect(shouldOpenNodeSearch(" ", "Space", true, false)).toBe(true);
  });

  it("does NOT open node search when typing space in an input", () => {
    expect(shouldOpenNodeSearch(" ", "Space", true, true)).toBe(false);
  });

  it("identifies selected nodes from flow nodes, selectedIdsRef or selectedNodeId", () => {
    const flowNodes = [
      { id: "node-1", selected: false },
      { id: "node-2", selected: false },
    ];
    const selectedIds = new Set(["node-1"]);
    const selectedNodeId = "node-1";

    const sel = flowNodes.filter(
      (n) => n.selected || selectedIds.has(n.id) || (selectedNodeId && n.id === selectedNodeId)
    );
    expect(sel.length).toBe(1);
    expect(sel[0].id).toBe("node-1");
  });
});
