import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { TRIGGER_NODE } from "./logic";
import { ENVELOPE_NODE, PULSE_NODE } from "./oscillator";

function ctx(frame: number, sessionId?: string): EvalContext {
  return { time: frame / 60, step: frame, nodeId: "edge-1", currentFrame: frame, sessionId };
}

describe("SESSION-SCOPED EDGE DETECTORS", () => {
  it("TRIGGER fires on a rising edge and not on hold", () => {
    expect(TRIGGER_NODE.evaluate({ in: 0 }, {}, ctx(0)).trigger).toBe(0);
    expect(TRIGGER_NODE.evaluate({ in: 1 }, {}, ctx(1)).trigger).toBe(1);
    expect(TRIGGER_NODE.evaluate({ in: 1 }, {}, ctx(2)).trigger).toBe(0);
    expect(TRIGGER_NODE.evaluate({ in: 0 }, {}, ctx(3)).trigger).toBe(0);
    expect(TRIGGER_NODE.evaluate({ in: 1 }, {}, ctx(4)).trigger).toBe(1);
  });

  it("TRIGGER keeps sessions apart so a second pane still sees its own edge", () => {
    // Two viewports evaluate the same graph per frame. With the old shared
    // slot, the first pane's pass updated `prev`, so the second pane read
    // prev === current and its pulse was dropped.
    TRIGGER_NODE.evaluate({ in: 1 }, {}, ctx(1, "editor"));
    expect(TRIGGER_NODE.evaluate({ in: 1 }, {}, ctx(1, "output")).trigger).toBe(1);
  });

  it("ENVELOPE re-attacks in the second pane even though the first already saw the edge", () => {
    const params = ENVELOPE_NODE.defaultParams;
    ENVELOPE_NODE.evaluate({ trigger: 1 }, params, ctx(1, "editor"));
    const second = ENVELOPE_NODE.evaluate({ trigger: 1 }, params, ctx(1, "output"));
    // At the attack frame both panes must report the ramp starting (~0), not
    // the first pane's advanced level.
    expect(second.out).toBeLessThan(0.1);
  });

  it("PULSE stacks energy per session, not per graph", () => {
    const params = PULSE_NODE.defaultParams;
    PULSE_NODE.evaluate({ trigger: 1 }, params, ctx(1, "editor"));
    const second = PULSE_NODE.evaluate({ trigger: 1 }, params, ctx(1, "output"));
    expect(second.out).toBeCloseTo(1, 5);
  });
});
