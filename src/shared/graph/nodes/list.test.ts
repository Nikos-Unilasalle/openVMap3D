import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { GET_LIST_ITEM_NODE } from "./list";
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
