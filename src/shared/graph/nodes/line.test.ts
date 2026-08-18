import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { setCurveNodePose } from "../curvePoseStore";
import { CURVE_TO_LINE_NODE } from "./line";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "line-test" };

describe("CURVE_TO_LINE_NODE", () => {
  it("builds a Line2 from the curve", () => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0)]);
    const res = CURVE_TO_LINE_NODE.evaluate({ curve }, CURVE_TO_LINE_NODE.defaultParams, CTX);
    const line = res.geometry as Line2;
    expect(line).toBeInstanceOf(Line2);
    expect(line.geometry.attributes.position.count).toBeGreaterThan(2);
  });

  it("applies width, dash and colour to the material", () => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0)]);
    const res = CURVE_TO_LINE_NODE.evaluate(
      { curve },
      {
        ...CURVE_TO_LINE_NODE.defaultParams,
        linewidth: 6,
        dashed: true,
        dashSize: 2,
        gapSize: 1,
        color: new THREE.Color(0xff0000),
        opacity: 0.5,
      },
      CTX,
    );
    const line = res.geometry as Line2;
    const mat = line.material as LineMaterial;
    expect(mat.linewidth).toBe(6);
    expect(mat.dashed).toBe(true);
    expect(mat.dashSize).toBe(2);
    expect(mat.gapSize).toBe(1);
    expect((mat.color as THREE.Color).getHex()).toBe(0xff0000);
    expect(mat.uniforms.opacity.value).toBeCloseTo(0.5);
  });

  it("composes the source curve node's pose into the line matrix", () => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0)]);
    const curveNodeId = "line-curve-src";
    setCurveNodePose(curveNodeId, new THREE.Matrix4().makeTranslation(5, 0, 0));
    const res = CURVE_TO_LINE_NODE.evaluate(
      { curve },
      { ...CURVE_TO_LINE_NODE.defaultParams, location: new THREE.Vector3(2, 0, 0) },
      { ...CTX, inputSources: new Map([["curve", curveNodeId]]) } as EvalContext,
    );
    const line = res.geometry as Line2;
    // matrix = own pose (2,0,0) × curve pose (5,0,0) → translation x = 7.
    const pos = new THREE.Vector3().setFromMatrixPosition(line.matrix);
    expect(pos.x).toBeCloseTo(7, 3);
  });
});
