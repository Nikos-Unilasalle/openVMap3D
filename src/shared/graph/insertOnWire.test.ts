import { describe, expect, test } from "vitest";
import { findCompatibleSocket, segmentIntersectsRect } from "./insertOnWire";
import { SocketDef } from "./sockets";

describe("segmentIntersectsRect", () => {
  const rect = { x: 100, y: 100, width: 50, height: 50 };

  test("a segment passing straight through the rect intersects", () => {
    expect(segmentIntersectsRect({ x: 0, y: 125 }, { x: 300, y: 125 }, rect)).toBe(true);
  });

  test("a segment entirely to one side does not intersect", () => {
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 50, y: 50 }, rect)).toBe(false);
  });

  test("a segment above the rect (same x range) does not intersect", () => {
    expect(segmentIntersectsRect({ x: 110, y: 0 }, { x: 140, y: 50 }, rect)).toBe(false);
  });

  test("an endpoint landing inside the rect counts as intersecting", () => {
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 120, y: 120 }, rect)).toBe(true);
  });

  test("a diagonal segment clipping just a corner intersects", () => {
    expect(segmentIntersectsRect({ x: 80, y: 80 }, { x: 120, y: 120 }, rect)).toBe(true);
  });

  test("a segment whose infinite extension would cross, but the finite segment stops short, does not intersect", () => {
    // Line through these two points would eventually cross the rect's row,
    // but both endpoints sit well to the left of it.
    expect(segmentIntersectsRect({ x: 0, y: 120 }, { x: 50, y: 122 }, rect)).toBe(false);
  });

  test("a segment sharing an edge exactly (endpoint on the boundary) intersects", () => {
    expect(segmentIntersectsRect({ x: 100, y: 125 }, { x: 50, y: 125 }, rect)).toBe(true);
  });
});

describe("findCompatibleSocket", () => {
  const value: SocketDef = { id: "a", label: "A", type: "value" };
  const vector: SocketDef = { id: "b", label: "B", type: "vector" };
  const any: SocketDef = { id: "c", label: "C", type: "any" };

  test("finds an exact type match", () => {
    expect(findCompatibleSocket([vector, value], "value")).toBe(value);
  });

  test("an 'any' socket on the node accepts a wire type nothing else on it matches", () => {
    expect(findCompatibleSocket([vector, any], "value")).toBe(any);
  });

  test("an 'any' socket matches when nothing else does", () => {
    expect(findCompatibleSocket([any], "geometry")).toBe(any);
  });

  test("an 'any' wire type matches any socket", () => {
    expect(findCompatibleSocket([value], "any")).toBe(value);
  });

  test("returns null when nothing matches", () => {
    expect(findCompatibleSocket([vector], "value")).toBeNull();
  });

  test("returns null for an empty socket list", () => {
    expect(findCompatibleSocket([], "value")).toBeNull();
  });
});
