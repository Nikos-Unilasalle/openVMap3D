import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { CURVES_TO_LINES_NODE } from "./curvesToLines";
import { EvalContext } from "../types";

const CTX = (nodeId: string): EvalContext => ({ time: 0, step: 0, nodeId });

const straightLine = (from: THREE.Vector3, to: THREE.Vector3) => new THREE.LineCurve3(from, to);

describe("CURVES_TO_LINES_NODE", () => {
  it("merges every curve in the list into one LineSegments2", () => {
    const curves = [
      straightLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)),
      straightLine(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 0)),
      straightLine(new THREE.Vector3(0, 2, 0), new THREE.Vector3(1, 2, 0)),
    ];
    const res = CURVES_TO_LINES_NODE.evaluate({ curves }, CURVES_TO_LINES_NODE.defaultParams, CTX("c2l-a"));

    expect(res.geometry).toBeInstanceOf(LineSegments2);
    const line = res.geometry as LineSegments2;
    const startAttr = line.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    // 3 curves × 127 segments (128 samples each) = 381 segments.
    expect(startAttr.count).toBe(381);
  });

  it("ignores non-Curve entries and empty lists rather than throwing", () => {
    const res = CURVES_TO_LINES_NODE.evaluate({ curves: [1, "x", null] }, CURVES_TO_LINES_NODE.defaultParams, CTX("c2l-b"));
    expect(res.geometry).toBeInstanceOf(LineSegments2);
    const line = res.geometry as LineSegments2;
    const startAttr = line.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    expect(startAttr.count).toBe(0);

    const resEmpty = CURVES_TO_LINES_NODE.evaluate({}, CURVES_TO_LINES_NODE.defaultParams, CTX("c2l-c"));
    expect(resEmpty.geometry).toBeInstanceOf(LineSegments2);
  });

  it("rebuilds only when the curves list reference changes (cache hit keeps the same geometry)", () => {
    // res.geometry is the same LineSegments2 wrapper mutated in place across
    // calls (see the node's own state.line reuse) — its .geometry property
    // must be captured right after each call, not read later off a stale
    // reference, or every "first" would just show whatever the last call left.
    const curves = [straightLine(new THREE.Vector3(), new THREE.Vector3(1, 0, 0))];
    const ctx = CTX("c2l-d");
    const first = CURVES_TO_LINES_NODE.evaluate({ curves }, CURVES_TO_LINES_NODE.defaultParams, ctx);
    const firstGeometry = (first.geometry as LineSegments2).geometry;

    const second = CURVES_TO_LINES_NODE.evaluate({ curves }, CURVES_TO_LINES_NODE.defaultParams, ctx);
    expect((second.geometry as LineSegments2).geometry).toBe(firstGeometry);

    const differentCurves = [straightLine(new THREE.Vector3(), new THREE.Vector3(2, 0, 0))];
    const third = CURVES_TO_LINES_NODE.evaluate({ curves: differentCurves }, CURVES_TO_LINES_NODE.defaultParams, ctx);
    expect((third.geometry as LineSegments2).geometry).not.toBe(firstGeometry);
  });

  it("applies its own native pose (location/rotation/scale) to the merged line", () => {
    const curves = [straightLine(new THREE.Vector3(), new THREE.Vector3(1, 0, 0))];
    const res = CURVES_TO_LINES_NODE.evaluate(
      { curves },
      { ...CURVES_TO_LINES_NODE.defaultParams, location: new THREE.Vector3(5, 0, 0) },
      CTX("c2l-e"),
    );
    const pos = new THREE.Vector3().setFromMatrixPosition(res.matrix as THREE.Matrix4);
    expect(pos.x).toBeCloseTo(5);
  });
});
