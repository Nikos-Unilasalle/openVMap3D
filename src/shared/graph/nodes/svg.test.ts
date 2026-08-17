import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { EvalContext } from "../types";
import { pathToCurve3, SVG_TO_CURVES_NODE, transformCurve3 } from "./svg";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "svg-test" };

describe("SVG_TO_CURVES_NODE", () => {
  test("empty until a file is loaded", () => {
    const res = SVG_TO_CURVES_NODE.evaluate({}, SVG_TO_CURVES_NODE.defaultParams, { ...CTX, nodeId: "svg-empty" });
    expect(res.curve).toBeNull();
    expect((res.curves as unknown[]).length).toBe(0);
  });
});

describe("pathToCurve3", () => {
  test("lifts a 2D path to 3D on the XY plane, inverting Y", () => {
    const path = new THREE.Path();
    path.moveTo(0, 0);
    path.lineTo(10, 0);
    path.lineTo(10, 5);

    const curve = pathToCurve3(path) as THREE.Curve<THREE.Vector3>;
    expect(curve).not.toBeNull();

    // SVG (10, 5) -> 3D (10, -5, 0)
    const end = curve.getPoint(1);
    expect(end.x).toBeCloseTo(10);
    expect(end.y).toBeCloseTo(-5);
    expect(end.z).toBeCloseTo(0);
  });

  test("closes a closed path so getPoint(1) returns the start point", () => {
    const path = new THREE.Path();
    path.moveTo(0, 0);
    path.lineTo(10, 0);
    path.lineTo(10, 10);
    path.autoClose = true;

    const curve = pathToCurve3(path) as THREE.Curve<THREE.Vector3>;
    const start = curve.getPoint(0);
    const end = curve.getPoint(1);
    expect(end.x).toBeCloseTo(start.x);
    expect(end.y).toBeCloseTo(start.y);
  });
});

describe("transformCurve3", () => {
  test("scales and offsets a curve", () => {
    const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 10, 0));
    const scaled = transformCurve3(curve, 2, 1, 1) as THREE.Curve<THREE.Vector3>;
    const p = scaled.getPoint(1);
    expect(p.x).toBeCloseTo(21);
    expect(p.y).toBeCloseTo(21);
  });
});
