import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { GET_LIST_ITEM_NODE, RANDOM_SAMPLE_LIST_NODE } from "./list";
import { CURVE_FROM_POINTS_NODE } from "./curve";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "list-item-test" };

describe("GET_LIST_ITEM_NODE with a list of lists (Capture Trails' Point Lists shape)", () => {
  const listOfLists = [
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)],
    [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 3, 0)],
  ];

  it("extracts the sub-list at the given index, not a flattened value", () => {
    const res = GET_LIST_ITEM_NODE.evaluate({ list: listOfLists, index: 1 }, GET_LIST_ITEM_NODE.defaultParams, CTX);
    expect(Array.isArray(res.item)).toBe(true);
    expect((res.item as THREE.Vector3[]).length).toBe(3);
    expect((res.item as THREE.Vector3[])[2]).toEqual(new THREE.Vector3(0, 3, 0));
  });

  it("feeds straight into Curve from Points as one curve", () => {
    const sub = GET_LIST_ITEM_NODE.evaluate({ list: listOfLists, index: 0 }, GET_LIST_ITEM_NODE.defaultParams, CTX).item;
    const curveRes = CURVE_FROM_POINTS_NODE.evaluate({ points: sub }, CURVE_FROM_POINTS_NODE.defaultParams, CTX);
    expect(curveRes.curve).toBeDefined();
  });

  it("wraps out-of-range indices rather than throwing (existing Get List Item behavior)", () => {
    const res = GET_LIST_ITEM_NODE.evaluate({ list: listOfLists, index: 5 }, GET_LIST_ITEM_NODE.defaultParams, CTX);
    expect(res.item).toBe(listOfLists[5 % listOfLists.length]);
  });
});

describe("RANDOM_SAMPLE_LIST_NODE", () => {
  const sourceList = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

  it("samples count distinct items without replacement", () => {
    const res = RANDOM_SAMPLE_LIST_NODE.evaluate(
      { list: sourceList, count: 4, seed: 123 },
      { ...RANDOM_SAMPLE_LIST_NODE.defaultParams, withReplacement: false },
      CTX,
    );

    const sampledList = res.list as string[];
    const indices = res.indices as number[];

    expect(sampledList.length).toBe(4);
    expect(indices.length).toBe(4);

    // Ensure all sampled elements are distinct
    const uniqueElements = new Set(sampledList);
    expect(uniqueElements.size).toBe(4);

    // Verify indices match items
    for (let i = 0; i < 4; i++) {
      expect(sourceList[indices[i]]).toBe(sampledList[i]);
    }
  });

  it("samples items with replacement allowing duplicates if requested", () => {
    const res = RANDOM_SAMPLE_LIST_NODE.evaluate(
      { list: sourceList, count: 15, seed: 42 },
      { ...RANDOM_SAMPLE_LIST_NODE.defaultParams, withReplacement: true },
      CTX,
    );

    const sampledList = res.list as string[];
    const indices = res.indices as number[];

    expect(sampledList.length).toBe(15);
    expect(indices.length).toBe(15);
  });

  it("handles empty input list gracefully", () => {
    const res = RANDOM_SAMPLE_LIST_NODE.evaluate({ list: [], count: 5 }, RANDOM_SAMPLE_LIST_NODE.defaultParams, CTX);
    expect((res.list as unknown[]).length).toBe(0);
    expect((res.indices as unknown[]).length).toBe(0);
  });
});

