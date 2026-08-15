import { describe, expect, it } from "vitest";
import { REROUTE_NODE } from "./reroute";

describe("REROUTE_NODE", () => {
  it("passes input value straight through to out output", () => {
    const res = REROUTE_NODE.evaluate({ in: 42 }, {}, {} as any);
    expect(res.out).toBe(42);
  });

  it("passes complex objects through cleanly", () => {
    const obj = { foo: "bar" };
    const res = REROUTE_NODE.evaluate({ in: obj }, {}, {} as any);
    expect(res.out).toBe(obj);
  });
});
