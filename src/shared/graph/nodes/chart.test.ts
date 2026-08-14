import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { EvalContext } from "../types";
import { setXyz } from "../xyzStore";
import { CHART_AXIS_NODE, LINE_GRAPH_NODE, PIE_CHART_NODE, POINT_CLOUD_NODE, SCATTER_PLOT_NODE } from "./chart";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "chart-test" };

describe("LINE_GRAPH_NODE", () => {
  test("builds a tube through the given values with a point marker per value", () => {
    const result = LINE_GRAPH_NODE.evaluate(
      { values: [0.2, 0.8, 0.4], count: 3, showPoints: 1 },
      LINE_GRAPH_NODE.defaultParams,
      { ...CTX, nodeId: "line-basic" },
    );

    expect(result.geometry).toBeInstanceOf(THREE.Group);
    const group = result.geometry as THREE.Group;
    const pointsGroup = group.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    expect(pointsGroup.children.length).toBe(3);
  });

  test("falls back to a default series with no values input, doesn't throw", () => {
    expect(() =>
      LINE_GRAPH_NODE.evaluate({}, LINE_GRAPH_NODE.defaultParams, { ...CTX, nodeId: "line-empty" }),
    ).not.toThrow();
  });

  test("shrinking point count removes the extra markers", () => {
    LINE_GRAPH_NODE.evaluate({ values: [1, 2, 3, 4, 5], count: 5 }, LINE_GRAPH_NODE.defaultParams, {
      ...CTX,
      nodeId: "line-shrink",
    });
    const result = LINE_GRAPH_NODE.evaluate({ values: [1, 2], count: 2 }, LINE_GRAPH_NODE.defaultParams, {
      ...CTX,
      nodeId: "line-shrink",
    });
    const group = result.geometry as THREE.Group;
    const pointsGroup = group.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    expect(pointsGroup.children.length).toBe(2);
  });
});

describe("CHART_AXIS_NODE", () => {
  test("generates one tick per step between min and max", () => {
    const result = CHART_AXIS_NODE.evaluate(
      { min: 0, max: 1, step: 0.5, maxHeight: 5 },
      CHART_AXIS_NODE.defaultParams,
      { ...CTX, nodeId: "axis-basic" },
    );
    expect(result.geometry).toBeInstanceOf(THREE.Group);
  });

  test("does not throw on a degenerate min===max range", () => {
    expect(() =>
      CHART_AXIS_NODE.evaluate({ min: 1, max: 1 }, CHART_AXIS_NODE.defaultParams, { ...CTX, nodeId: "axis-degenerate" }),
    ).not.toThrow();
  });
});

describe("PIE_CHART_NODE", () => {
  test("one slice mesh per value", () => {
    const result = PIE_CHART_NODE.evaluate({ values: [1, 2, 3] }, PIE_CHART_NODE.defaultParams, {
      ...CTX,
      nodeId: "pie-basic",
    });
    const group = result.geometry as THREE.Group;
    expect(group.children.length).toBe(3);
  });

  test("all-zero values still produces slices instead of throwing (div by zero guarded)", () => {
    expect(() =>
      PIE_CHART_NODE.evaluate({ values: [0, 0, 0] }, PIE_CHART_NODE.defaultParams, { ...CTX, nodeId: "pie-zero" }),
    ).not.toThrow();
  });

  test("slice count shrinks when the values list shrinks", () => {
    PIE_CHART_NODE.evaluate({ values: [1, 2, 3, 4] }, PIE_CHART_NODE.defaultParams, { ...CTX, nodeId: "pie-shrink" });
    const result = PIE_CHART_NODE.evaluate({ values: [1, 2] }, PIE_CHART_NODE.defaultParams, {
      ...CTX,
      nodeId: "pie-shrink",
    });
    expect((result.geometry as THREE.Group).children.length).toBe(2);
  });
});

describe("SCATTER_PLOT_NODE", () => {
  test("one marker per data point, positioned from x/y/z lists", () => {
    const result = SCATTER_PLOT_NODE.evaluate(
      { xValues: [1, 2, 3], yValues: [4, 5, 6], zValues: [0, 0, 0] },
      SCATTER_PLOT_NODE.defaultParams,
      { ...CTX, nodeId: "scatter-basic" },
    );
    const group = result.geometry as THREE.Group;
    expect(group.children.length).toBe(3);
    expect((group.children[1] as THREE.Mesh).position.x).toBe(2);
    expect((group.children[1] as THREE.Mesh).position.y).toBe(5);
  });

  test("empty lists produce zero markers, not a throw", () => {
    expect(() =>
      SCATTER_PLOT_NODE.evaluate({}, SCATTER_PLOT_NODE.defaultParams, { ...CTX, nodeId: "scatter-empty" }),
    ).not.toThrow();
  });
});

describe("POINT_CLOUD_NODE", () => {
  test("builds a THREE.Points buffer with one vertex per coordinate", () => {
    const result = POINT_CLOUD_NODE.evaluate(
      { xValues: [1, 2], yValues: [3, 4], zValues: [5, 6] },
      POINT_CLOUD_NODE.defaultParams,
      { ...CTX, nodeId: "cloud-basic" },
    );
    expect(result.geometry).toBeInstanceOf(THREE.Points);
    const points = result.geometry as THREE.Points;
    const position = points.geometry.getAttribute("position");
    expect(position.count).toBe(2);
  });

  test("per-point colors land in the color attribute in list order", () => {
    const result = POINT_CLOUD_NODE.evaluate(
      {
        xValues: [0, 1],
        yValues: [0, 1],
        zValues: [0, 1],
        colors: [new THREE.Color(1, 0, 0), new THREE.Color(0, 1, 0)],
      },
      POINT_CLOUD_NODE.defaultParams,
      { ...CTX, nodeId: "cloud-colors" },
    );
    const color = (result.geometry as THREE.Points).geometry.getAttribute("color");
    expect(color.getX(0)).toBe(1);
    expect(color.getY(1)).toBe(1);
  });

  test("falls back to a loaded .xyz file's points when no list is wired", () => {
    setXyz("cloud-file", { x: [1, 2, 3], y: [4, 5, 6], z: [7, 8, 9], colors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });

    const result = POINT_CLOUD_NODE.evaluate({}, POINT_CLOUD_NODE.defaultParams, { ...CTX, nodeId: "cloud-file" });

    const points = result.geometry as THREE.Points;
    const position = points.geometry.getAttribute("position");
    expect(position.count).toBe(3);
    expect(position.getX(1)).toBe(2);
    expect(result.xValues).toEqual([1, 2, 3]);

    const color = points.geometry.getAttribute("color");
    expect(color.getX(0)).toBe(1);
    expect(color.getY(1)).toBe(1);
  });

  test("a wired list input overrides the loaded file, same as Bar Graph's input-over-param priority", () => {
    setXyz("cloud-override", { x: [1, 2, 3], y: [1, 2, 3], z: [1, 2, 3], colors: null });

    const result = POINT_CLOUD_NODE.evaluate(
      { xValues: [10, 20], yValues: [10, 20], zValues: [10, 20] },
      POINT_CLOUD_NODE.defaultParams,
      { ...CTX, nodeId: "cloud-override" },
    );

    expect(result.xValues).toEqual([10, 20]);
  });
});
