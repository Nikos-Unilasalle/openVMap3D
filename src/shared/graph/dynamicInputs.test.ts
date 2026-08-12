import { describe, expect, test } from "vitest";
import { growingSockets } from "./dynamicInputs";
import { Connection } from "./types";

function conn(toSocket: string): Connection {
  return { id: toSocket, fromNode: "src", fromSocket: "out", toNode: "n", toSocket };
}

const socketFor = (i: number) => ({ id: `in${i}`, label: `In ${i + 1}`, type: "geometry" as const });

describe("growingSockets", () => {
  test("no connections yet: exactly one empty socket", () => {
    expect(growingSockets([], "in", socketFor).map((s) => s.id)).toEqual(["in0"]);
  });

  test("wiring the only socket grows a new empty one below it", () => {
    expect(growingSockets([conn("in0")], "in", socketFor).map((s) => s.id)).toEqual(["in0", "in1"]);
  });

  test("wiring every existing socket keeps growing, one at a time", () => {
    expect(growingSockets([conn("in0"), conn("in1")], "in", socketFor).map((s) => s.id)).toEqual([
      "in0",
      "in1",
      "in2",
    ]);
  });

  test("removing the trailing connection shrinks back down", () => {
    expect(growingSockets([conn("in0")], "in", socketFor).map((s) => s.id)).toEqual(["in0", "in1"]);
  });

  test("connections for a different socket prefix are ignored", () => {
    expect(growingSockets([{ id: "x", fromNode: "s", fromSocket: "out", toNode: "n", toSocket: "other0" }], "in", socketFor)).toEqual([
      socketFor(0),
    ]);
  });
});
