import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import {
  TEXT_CASE_NODE,
  TEXT_COMPARE_NODE,
  TEXT_CONCAT_NODE,
  TEXT_CONSTANT_NODE,
  TEXT_LENGTH_NODE,
  TEXT_REPLACE_NODE,
  TEXT_SPLIT_NODE,
  TEXT_SUBSTRING_NODE,
  TEXT_TRIM_NODE,
  TEXT_RANDOM_NODE,
} from "./text";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "test" };

describe("Text manipulation nodes", () => {
  it("TEXT_CONSTANT_NODE outputs text from params", () => {
    const res = TEXT_CONSTANT_NODE.evaluate({}, { text: "OpenVMap" }, CTX);
    expect(res).toEqual({ text: "OpenVMap" });
  });

  it("TEXT_CONCAT_NODE concatenates two strings with separator", () => {
    const res = TEXT_CONCAT_NODE.evaluate(
      { textA: "Hello", textB: "World", separator: " " },
      {},
      CTX
    );
    expect(res).toEqual({ text: "Hello World" });
  });

  it("TEXT_SUBSTRING_NODE extracts substring", () => {
    const res = TEXT_SUBSTRING_NODE.evaluate(
      { text: "OpenVMap3D", start: 4, length: 4 },
      {},
      CTX
    );
    expect(res).toEqual({ text: "VMap" });
  });

  it("TEXT_LENGTH_NODE returns length of string", () => {
    const res = TEXT_LENGTH_NODE.evaluate({ text: "Mapping" }, {}, CTX);
    expect(res).toEqual({ value: 7 });
  });

  it("TEXT_CASE_NODE changes string case (uppercase, lowercase, title)", () => {
    expect(TEXT_CASE_NODE.evaluate({ text: "hello world" }, { mode: "uppercase" }, CTX)).toEqual({
      text: "HELLO WORLD",
    });
    expect(TEXT_CASE_NODE.evaluate({ text: "HELLO WORLD" }, { mode: "lowercase" }, CTX)).toEqual({
      text: "hello world",
    });
    expect(TEXT_CASE_NODE.evaluate({ text: "hello world" }, { mode: "capitalize" }, CTX)).toEqual({
      text: "Hello World",
    });
  });

  it("TEXT_REPLACE_NODE replaces substring", () => {
    const res = TEXT_REPLACE_NODE.evaluate(
      { text: "foo bar foo", search: "foo", replace: "baz" },
      {},
      CTX
    );
    expect(res).toEqual({ text: "baz bar baz" });
  });

  it("TEXT_SPLIT_NODE splits string into array list", () => {
    const res = TEXT_SPLIT_NODE.evaluate(
      { text: "red,green,blue", delimiter: "," },
      {},
      CTX
    );
    expect(res).toEqual({ list: ["red", "green", "blue"] });
  });

  it("TEXT_TRIM_NODE strips leading/trailing spaces", () => {
    const res = TEXT_TRIM_NODE.evaluate({ text: "   space   " }, {}, CTX);
    expect(res).toEqual({ text: "space" });
  });

  it("TEXT_COMPARE_NODE compares text (equals, contains, startsWith, endsWith)", () => {
    expect(
      TEXT_COMPARE_NODE.evaluate(
        { textA: "OpenVMap", textB: "vmap" },
        { mode: "contains", ignoreCase: true },
        CTX
      )
    ).toEqual({ value: 1 });

    expect(
      TEXT_COMPARE_NODE.evaluate(
        { textA: "OpenVMap", textB: "vmap" },
        { mode: "contains", ignoreCase: false },
        CTX
      )
    ).toEqual({ value: 0 });

    expect(
      TEXT_COMPARE_NODE.evaluate(
        { textA: "OpenVMap", textB: "Open" },
        { mode: "startsWith", ignoreCase: true },
        CTX
      )
    ).toEqual({ value: 1 });
  });

  it("TEXT_TRIM_NODE trims only the requested side", () => {
    expect(TEXT_TRIM_NODE.evaluate({ text: "  pad  " }, { mode: "start" }, CTX)).toEqual({ text: "pad  " });
    expect(TEXT_TRIM_NODE.evaluate({ text: "  pad  " }, { mode: "end" }, CTX)).toEqual({ text: "  pad" });
    expect(TEXT_TRIM_NODE.evaluate({ text: "  pad  " }, { mode: "both" }, CTX)).toEqual({ text: "pad" });
  });
});

describe("TEXT_RANDOM_NODE", () => {
  it("is deterministic for a given seed", () => {
    const a = TEXT_RANDOM_NODE.evaluate({ seed: 7, length: 5 }, { mode: "words" }, CTX);
    const b = TEXT_RANDOM_NODE.evaluate({ seed: 7, length: 5 }, { mode: "words" }, CTX);
    expect(a).toEqual(b);
  });

  it("changes output when the seed changes", () => {
    const a = TEXT_RANDOM_NODE.evaluate({ seed: 1, length: 6 }, { mode: "letters" }, CTX).text;
    const b = TEXT_RANDOM_NODE.evaluate({ seed: 2, length: 6 }, { mode: "letters" }, CTX).text;
    expect(a).not.toBe(b);
  });

  it("word mode joins `length` on-theme words with spaces", () => {
    const res = TEXT_RANDOM_NODE.evaluate({ seed: 3, length: 4 }, { mode: "words" }, CTX);
    expect(String(res.text).split(" ")).toHaveLength(4);
  });

  it("character modes respect their charset", () => {
    const digits = TEXT_RANDOM_NODE.evaluate({ seed: 5, length: 12 }, { mode: "digits" }, CTX).text as string;
    expect(digits).toMatch(/^[0-9]{12}$/);

    const letters = TEXT_RANDOM_NODE.evaluate({ seed: 5, length: 12 }, { mode: "letters" }, CTX).text as string;
    expect(letters).toMatch(/^[a-z]{12}$/);

    const alnum = TEXT_RANDOM_NODE.evaluate({ seed: 5, length: 12 }, { mode: "alphanumeric" }, CTX).text as string;
    expect(alnum).toMatch(/^[a-z0-9]{12}$/);
  });
});
