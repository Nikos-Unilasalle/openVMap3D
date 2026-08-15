import { describe, expect, it } from "vitest";
import { LIST_GROUP_NODE } from "./listGroup";

describe("LIST_GROUP_NODE", () => {
  it("packs dynamic inputs into a list array", () => {
    const res = LIST_GROUP_NODE.evaluate({ in0: "itemA", in1: "itemB", in2: ["itemC", "itemD"] }, {}, {} as any);
    expect(res.list).toEqual(["itemA", "itemB", "itemC", "itemD"]);
  });

  it("handles empty or missing inputs gracefully", () => {
    const res = LIST_GROUP_NODE.evaluate({}, {}, {} as any);
    expect(res.list).toEqual([]);
  });
});
