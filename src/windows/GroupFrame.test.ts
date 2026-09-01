import { describe, expect, it } from "vitest";
import { COLLAPSED_PORT_GAP, COLLAPSED_PORT_SIZE, collapsedPortPosition, collapsedPortSides } from "./GroupFrame";
import { NodeGroup } from "../shared/graph/types";

const GROUP: NodeGroup = {
  id: "g1",
  title: "Group",
  color: "#6366f1",
  rect: { x: 500, y: 300, width: 400, height: 200 },
};

describe("collapsed group ports", () => {
  it("parks the left port just OUTSIDE the frame's left edge, centered on the header bar", () => {
    const p = collapsedPortPosition(GROUP.rect, "left");
    expect(p.x).toBe(GROUP.rect.x - COLLAPSED_PORT_GAP - COLLAPSED_PORT_SIZE);
    expect(p.y).toBe(GROUP.rect.y + 17 - COLLAPSED_PORT_SIZE / 2);
  });

  it("parks the right port just OUTSIDE the frame's right edge", () => {
    const p = collapsedPortPosition(GROUP.rect, "right");
    expect(p.x).toBe(GROUP.rect.x + GROUP.rect.width + COLLAPSED_PORT_GAP);
  });

  const graph = {
    nodes: [
      // Members of the group (inside the rect)
      { id: "source", position: { x: 520, y: 320 } },
      { id: "middle", position: { x: 700, y: 320 } },
      { id: "sink", position: { x: 850, y: 420 } },
      // Outside nodes: one far left, one far right
      { id: "upstream", position: { x: 100, y: 320 } },
      { id: "downstream", position: { x: 1200, y: 420 } },
    ],
    connections: [
      { id: "c1", fromNode: "upstream", toNode: "source" },
      { id: "c2", fromNode: "source", toNode: "middle" },
      { id: "c3", fromNode: "middle", toNode: "sink" },
      { id: "c4", fromNode: "sink", toNode: "downstream" },
    ],
  };

  it("sends members with left-side cables to the left port, right-side cables to the right port", () => {
    const sides = collapsedPortSides(graph, GROUP);
    // source's only external cable comes from `upstream` (left)
    expect(sides.get("source")).toBe("left");
    // sink's only external cable goes to `downstream` (right)
    expect(sides.get("sink")).toBe("right");
  });

  it("defaults members with no external cables to the left port", () => {
    const sides = collapsedPortSides(graph, GROUP);
    // `middle` only talks to other members
    expect(sides.get("middle")).toBe("left");
  });
});
