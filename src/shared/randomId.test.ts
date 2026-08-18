import { describe, expect, it } from "vitest";
import { randomId } from "./randomId";

describe("randomId", () => {
  it("produces unique ids", () => {
    expect(randomId()).not.toBe(randomId());
  });

  it("falls back to a v4-shaped string when crypto.randomUUID is unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      const id = randomId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      if (original) Object.defineProperty(globalThis, "crypto", original);
      else delete (globalThis as Record<string, unknown>).crypto;
    }
  });
});
