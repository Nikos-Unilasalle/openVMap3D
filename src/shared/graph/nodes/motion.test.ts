import { describe, expect, it } from "vitest";
import { EXPRESSION_NODE, STAGGER_NODE, TIME_REMAP_NODE } from "./motion";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "motion-test" };

describe("STAGGER_NODE", () => {
  it("computes staggered progress, activity and delays", () => {
    const res = STAGGER_NODE.evaluate(
      { time: 0.25, count: 4, duration: 1, offset: 0.1, startAt: 0 },
      STAGGER_NODE.defaultParams,
      CTX,
    );
    const progress = res.progress as number[];
    const active = res.active as number[];
    const delays = res.delays as number[];
    expect(progress).toHaveLength(4);
    delays.forEach((d, i) => expect(d).toBeCloseTo(i * 0.1));
    // Items 0..2 have started (0, 0.1, 0.2); item 3 starts at 0.3.
    expect(progress[0]).toBeCloseTo(0.25);
    expect(progress[3]).toBe(0);
    expect(active[0]).toBe(1);
    expect(active[3]).toBe(0);
    // Item 0 has finished after its duration.
    const done = STAGGER_NODE.evaluate({ time: 1.5, count: 4, duration: 1, offset: 0.1 }, STAGGER_NODE.defaultParams, CTX);
    expect((done.active as number[])[0]).toBe(0);
    expect((done.progress as number[])[0]).toBe(1);
  });
});

describe("TIME_REMAP_NODE", () => {
  it("maps a range with easing and clamps outside it", () => {
    const linear = TIME_REMAP_NODE.evaluate(
      { time: 0.5, inStart: 0, inEnd: 1, outStart: 0, outEnd: 100 },
      { ...TIME_REMAP_NODE.defaultParams, ease: "linear" },
      CTX,
    );
    expect(linear.time).toBeCloseTo(50);

    // Below input start → output start; above input end → output end.
    expect(TIME_REMAP_NODE.evaluate({ time: -5 }, { ...TIME_REMAP_NODE.defaultParams, ease: "linear" }, CTX).time).toBe(0);
    expect(TIME_REMAP_NODE.evaluate({ time: 99 }, { ...TIME_REMAP_NODE.defaultParams, ease: "linear" }, CTX).time).toBe(1);

    // Eased (smooth in-out): mid stays mid for the symmetric curve.
    const smooth = TIME_REMAP_NODE.evaluate({ time: 0.5 }, TIME_REMAP_NODE.defaultParams, CTX);
    expect(smooth.time).toBeCloseTo(0.5);
  });

  it("loops when enabled", () => {
    const looped = TIME_REMAP_NODE.evaluate(
      { time: 1.5, inStart: 0, inEnd: 1, outStart: 0, outEnd: 100, loop: 1 },
      { ...TIME_REMAP_NODE.defaultParams, ease: "linear" },
      CTX,
    );
    // t = 1.5 - floor(1.5) = 0.5 → 50
    expect(looped.time).toBeCloseTo(50);
  });
});

describe("EXPRESSION_NODE", () => {
  it("evaluates a math expression with time and helpers", () => {
    const res = EXPRESSION_NODE.evaluate(
      { time: 1 },
      { ...EXPRESSION_NODE.defaultParams, expression: "sin(time * PI) * 100" },
      CTX,
    );
    expect(res.value).toBeCloseTo(0, 6);
  });

  it("uses wired inputs a/b/c", () => {
    const res = EXPRESSION_NODE.evaluate(
      { a: 3, b: 4 },
      { ...EXPRESSION_NODE.defaultParams, expression: "sqrt(a*a + b*b)" },
      CTX,
    );
    expect(res.value).toBeCloseTo(5);
  });

  it("degrades to 0 on an invalid expression", () => {
    const res = EXPRESSION_NODE.evaluate(
      {},
      { ...EXPRESSION_NODE.defaultParams, expression: "this is not math (" },
      CTX,
    );
    expect(res.value).toBe(0);
  });
});
