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
        dashRatio: 0,
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
    expect(mat.dashSize).toBe(2); // raw fallback when dashRatio is 0
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

  it("computes instanced dash distance attributes the shader needs", () => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0)]);
    const res = CURVE_TO_LINE_NODE.evaluate(
      { curve },
      { ...CURVE_TO_LINE_NODE.defaultParams, dashed: true },
      CTX,
    );
    const line = res.geometry as Line2;
    const geo = line.geometry as THREE.BufferGeometry;
    const start = geo.getAttribute("instanceDistanceStart") as THREE.BufferAttribute;
    const end = geo.getAttribute("instanceDistanceEnd") as THREE.BufferAttribute;
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    // Instanced, so each segment reads its own cumulative distance — otherwise
    // every segment sees the same value and the dash collapses.
    expect((start as THREE.InstancedBufferAttribute).isInstancedBufferAttribute).toBe(true);
    expect(end.getX(end.count - 1)).toBeCloseTo(3, 3);
  });

  it("a wired Material node drives colour and opacity", () => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0)]);
    const res = CURVE_TO_LINE_NODE.evaluate(
      { curve, material: { color: new THREE.Color(0x00ff00), opacity: 0.7, roughness: 0.5 } },
      CURVE_TO_LINE_NODE.defaultParams,
      CTX,
    );
    const mat = (res.geometry as Line2).material as LineMaterial;
    expect((mat.color as THREE.Color).getHex()).toBe(0x00ff00);
    expect(mat.uniforms.opacity.value).toBeCloseTo(0.7);
  });

  it("dash ratios are relative to the curve length and emissive brightens the colour", () => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)]);
    const res = CURVE_TO_LINE_NODE.evaluate(
      { curve },
      {
        ...CURVE_TO_LINE_NODE.defaultParams,
        dashed: true,
        dashRatio: 0.2,
        gapRatio: 0.1,
        emissive: new THREE.Color(0x00ff00),
        emissiveIntensity: 0.5,
        color: new THREE.Color(0xff0000),
      },
      CTX,
    );
    const mat = (res.geometry as Line2).material as LineMaterial;
    // curve length 10 → dash = 0.2 * 10 = 2, gap = 0.1 * 10 = 1.
    expect(mat.dashSize).toBeCloseTo(2, 3);
    expect(mat.gapSize).toBeCloseTo(1, 3);
    // colour = red + 0.5 * green.
    const c = mat.color as THREE.Color;
    expect(c.r).toBeCloseTo(1, 3);
    expect(c.g).toBeCloseTo(0.5, 3);
    expect(c.b).toBeCloseTo(0, 3);
  });
});

describe("CURVE_TO_LINE_NODE Visible socket", () => {
  it("declares Visible so evaluate.ts's generic visibility handling applies", () => {
    expect(CURVE_TO_LINE_NODE.inputs.some((i) => i.id === "visible")).toBe(true);
    expect(CURVE_TO_LINE_NODE.defaultParams.visible).toBe(1);
  });
});
