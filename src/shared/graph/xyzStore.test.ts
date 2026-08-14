import { describe, expect, test } from "vitest";
import { parseXyzText } from "./xyzStore";

describe("parseXyzText", () => {
  test("parses plain whitespace-separated x y z lines", () => {
    const result = parseXyzText("1 2 3\n4 5 6\n");
    expect(result.x).toEqual([1, 4]);
    expect(result.y).toEqual([2, 5]);
    expect(result.z).toEqual([3, 6]);
    expect(result.colors).toBeNull();
  });

  test("parses comma-separated lines too", () => {
    const result = parseXyzText("1,2,3\n4,5,6");
    expect(result.x).toEqual([1, 4]);
  });

  test("skips blank lines and # comments", () => {
    const result = parseXyzText("# header comment\n\n1 2 3\n\n4 5 6\n");
    expect(result.x).toEqual([1, 4]);
  });

  test("skips lines that don't parse as at least 3 numbers instead of throwing", () => {
    const result = parseXyzText("not a point\n1 2 3\nalso not\n4 5 6");
    expect(result.x).toEqual([1, 4]);
  });

  test("reads x y z r g b, normalizing 0-255 color channels to 0-1", () => {
    const result = parseXyzText("0 0 0 255 0 0\n1 1 1 0 128 0");
    expect(result.colors).toEqual([
      [1, 0, 0],
      [0, 128 / 255, 0],
    ]);
  });

  test("parses molecular-style lines with a leading element symbol (Blender's Atomic Blender - XYZ addon)", () => {
    const result = parseXyzText("2\nGenerated comment line\nC 1.2 3.4 5.6\nO -1 0 2");
    expect(result.x).toEqual([1.2, -1]);
    expect(result.y).toEqual([3.4, 0]);
    expect(result.z).toEqual([5.6, 2]);
  });

  test("an atom-count header of 0 with no following data parses to an empty point set", () => {
    const result = parseXyzText("0\nThis XYZ file has been created with Blender.");
    expect(result.x).toEqual([]);
  });

  test("leaves already-normalized 0-1 color channels untouched", () => {
    const result = parseXyzText("0 0 0 1 0 0\n1 1 1 0 0.5 0");
    expect(result.colors).toEqual([
      [1, 0, 0],
      [0, 0.5, 0],
    ]);
  });
});
