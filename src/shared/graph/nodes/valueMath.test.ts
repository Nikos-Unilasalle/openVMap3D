import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { VALUE_CONSTANT_NODE } from "./valueMath";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "value-constant-test" };

describe("VALUE_CONSTANT_NODE", () => {
  it("defaults to float mode and passes the raw value through", () => {
    const res = VALUE_CONSTANT_NODE.evaluate({}, { type: "float", value: 2.7 }, CTX);
    expect(res.out).toBe(2.7);
  });

  it("integer mode rounds the output", () => {
    const res = VALUE_CONSTANT_NODE.evaluate({}, { type: "integer", value: 2.7 }, CTX);
    expect(res.out).toBe(3);
  });

  it("integer mode rounds negative and .5 values the normal way", () => {
    expect(VALUE_CONSTANT_NODE.evaluate({}, { type: "integer", value: -2.5 }, CTX).out).toBe(-2);
    expect(VALUE_CONSTANT_NODE.evaluate({}, { type: "integer", value: 2.5 }, CTX).out).toBe(3);
  });

  it("dynamicParamFields exposes a Type select and steps Value by 1 only in integer mode", () => {
    const floatFields = VALUE_CONSTANT_NODE.dynamicParamFields!({
      id: "n",
      type: "value/constant",
      position: { x: 0, y: 0 },
      params: { type: "float", value: 0 },
    });
    const intFields = VALUE_CONSTANT_NODE.dynamicParamFields!({
      id: "n",
      type: "value/constant",
      position: { x: 0, y: 0 },
      params: { type: "integer", value: 0 },
    });

    const floatValueField = floatFields.find((f) => f.id === "value") as { step?: number } | undefined;
    const intValueField = intFields.find((f) => f.id === "value") as { step?: number } | undefined;
    expect(floatValueField?.step).toBe(0.1);
    expect(intValueField?.step).toBe(1);

    const typeField = floatFields.find((f) => f.id === "type") as { kind: string; options?: string[] } | undefined;
    expect(typeField?.kind).toBe("select");
    expect(typeField?.options).toEqual(["float", "integer"]);
  });

  it("missing/garbage value falls back to 0 in both modes", () => {
    expect(VALUE_CONSTANT_NODE.evaluate({}, { type: "float", value: undefined }, CTX).out).toBe(0);
    expect(VALUE_CONSTANT_NODE.evaluate({}, { type: "integer", value: NaN }, CTX).out).toBe(0);
  });
});
