import { describe, expect, it } from "vitest";
import { CAPTURE_TRAILS_NODE } from "./particleTrails";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "trails-test" };

describe("CAPTURE_TRAILS_NODE", () => {
  it("hands back all 8 Trail N Points sockets as empty lists with nothing wired", () => {
    const res = CAPTURE_TRAILS_NODE.evaluate({}, CAPTURE_TRAILS_NODE.defaultParams, CTX);
    for (let i = 0; i < 8; i++) {
      expect(res[`trail${i}`]).toEqual([]);
    }
    expect(res.geometry).toBeDefined();
    expect(res.segmentCount).toBe(0);
  });

  it("declares exactly 8 Trail N Points outputs, named in order", () => {
    const ids = CAPTURE_TRAILS_NODE.outputs.map((o) => o.id);
    for (let i = 0; i < 8; i++) expect(ids).toContain(`trail${i}`);
    expect(ids).not.toContain("trail8");
  });
});
