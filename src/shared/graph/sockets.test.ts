import { describe, expect, test } from "vitest";
import { fromBoolean, toBoolean } from "./sockets";

describe("boolean-on-a-value-socket convention", () => {
  test("0 is false, any other number is true", () => {
    expect(toBoolean(0)).toBe(false);
    expect(toBoolean(1)).toBe(true);
    expect(toBoolean(-1)).toBe(true);
    expect(toBoolean(0.5)).toBe(true);
  });

  test("non-numeric input (an unconnected socket) reads as false", () => {
    expect(toBoolean(undefined)).toBe(false);
    expect(toBoolean(null)).toBe(false);
  });

  test("round-trips through fromBoolean", () => {
    expect(toBoolean(fromBoolean(true))).toBe(true);
    expect(toBoolean(fromBoolean(false))).toBe(false);
  });
});
