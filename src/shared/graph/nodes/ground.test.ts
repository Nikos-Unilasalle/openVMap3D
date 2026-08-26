import { describe, expect, it } from "vitest";
import { GROUND_NODE } from "./ground";
import { GroundConfig } from "../particleRuntime";

describe("GROUND_NODE", () => {
  it("defaults to enabled, y=0, settling (bounce 0), with some friction", () => {
    const res = GROUND_NODE.evaluate({}, GROUND_NODE.defaultParams, { time: 0, step: 0, nodeId: "" });
    expect(res.ground).toEqual({ enabled: true, y: 0, bounce: 0, friction: 0.9 });
  });

  it("reads every field from wired inputs over params", () => {
    const res = GROUND_NODE.evaluate(
      { enabled: 0, height: 5, bounce: 0.5, friction: 0.2 },
      GROUND_NODE.defaultParams,
      { time: 0, step: 0, nodeId: "" },
    );
    expect(res.ground).toEqual({ enabled: false, y: 5, bounce: 0.5, friction: 0.2 });
  });

  it("clamps bounce and friction to [0, 1]", () => {
    const res = GROUND_NODE.evaluate(
      { bounce: 5, friction: -3 },
      GROUND_NODE.defaultParams,
      { time: 0, step: 0, nodeId: "" },
    );
    const ground = res.ground as GroundConfig;
    expect(ground.bounce).toBe(1);
    expect(ground.friction).toBe(0);
  });
});
