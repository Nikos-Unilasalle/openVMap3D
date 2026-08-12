import { describe, expect, test } from "vitest";
import { setCsv } from "../csvStore";
import { EvalContext } from "../types";
import { CSV_READER_NODE } from "./csv";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "csv-test" };

describe("CSV_READER_NODE", () => {
  test("no file loaded yet: empty column, zero value, no throw", () => {
    const result = CSV_READER_NODE.evaluate({ row: 0 }, {}, { ...CTX, nodeId: "csv-empty" });
    expect(result.column).toEqual([]);
    expect(result.value).toBe(0);
  });

  test("reads the selected column and the value at the current row", () => {
    setCsv("csv-basic", {
      headers: ["temperature", "humidity"],
      rows: [
        { temperature: "18.5", humidity: "60" },
        { temperature: "19.2", humidity: "58" },
        { temperature: "20.1", humidity: "55" },
      ],
    });

    const result = CSV_READER_NODE.evaluate({ row: 1 }, { column: "temperature" }, { ...CTX, nodeId: "csv-basic" });

    expect(result.column).toEqual(["18.5", "19.2", "20.1"]);
    expect(result.rowValues).toEqual([19.2, 58]);
    expect(result.value).toBeCloseTo(19.2);
  });


  test("an out-of-range row clamps to the last row instead of throwing", () => {
    setCsv("csv-clamp", { headers: ["x"], rows: [{ x: "1" }, { x: "2" }] });

    const result = CSV_READER_NODE.evaluate({ row: 999 }, { column: "x" }, { ...CTX, nodeId: "csv-clamp" });

    expect(result.value).toBe(2);
  });

  test("a negative row clamps to the first row instead of throwing", () => {
    setCsv("csv-negative", { headers: ["x"], rows: [{ x: "7" }, { x: "8" }] });

    const result = CSV_READER_NODE.evaluate({ row: -5 }, { column: "x" }, { ...CTX, nodeId: "csv-negative" });

    expect(result.value).toBe(7);
  });

  test("a non-numeric cell reads as 0 in the value output, not NaN", () => {
    setCsv("csv-text", { headers: ["label"], rows: [{ label: "hello" }] });

    const result = CSV_READER_NODE.evaluate({ row: 0 }, { column: "label" }, { ...CTX, nodeId: "csv-text" });

    expect(result.value).toBe(0);
    expect(result.column).toEqual(["hello"]);
  });

  test("dynamicParamFields lists the loaded headers as the column dropdown's options", () => {
    setCsv("csv-fields", { headers: ["a", "b", "c"], rows: [] });

    const fields = CSV_READER_NODE.dynamicParamFields?.({
      id: "csv-fields",
      type: "io/csv-reader",
      params: {},
      position: { x: 0, y: 0 },
    });

    const columnField = fields?.find((f) => f.id === "column");
    expect(columnField?.kind).toBe("select");
    expect(columnField && "options" in columnField ? columnField.options : []).toEqual(["a", "b", "c"]);
  });
});
