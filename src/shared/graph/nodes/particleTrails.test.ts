import { describe, expect, it } from "vitest";
import { CAPTURE_TRAILS_NODE } from "./particleTrails";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "trails-test" };

describe("CAPTURE_TRAILS_NODE", () => {
  it("hands back an empty list of lists with nothing wired", () => {
    const res = CAPTURE_TRAILS_NODE.evaluate({}, CAPTURE_TRAILS_NODE.defaultParams, CTX);
    expect(res.trails).toEqual([]);
    expect(res.geometry).toBeDefined();
    expect(res.segmentCount).toBe(0);
  });

  it("declares a single dynamic list-of-lists output, not one per particle", () => {
    const ids = CAPTURE_TRAILS_NODE.outputs.map((o) => o.id);
    expect(ids).toContain("trails");
    expect(ids).not.toContain("trail0");
  });
});
