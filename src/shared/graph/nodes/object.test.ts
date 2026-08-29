import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { OBJECT_DISC_NODE, OBJECT_TEXT_NODE } from "./object";
import { BUILTIN_FONTS, FONT_NAMES } from "../../three/fonts/fonts";
import helvetikerData from "../../three/fonts/helvetikerData.json";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "text-test" };

describe("OBJECT_TEXT_NODE font", () => {
  it("builds extruded text geometry with the default font", () => {
    const res = OBJECT_TEXT_NODE.evaluate(
      { text: "hello", fontSize: 32 },
      { ...OBJECT_TEXT_NODE.defaultParams, text: "hello", fontSize: 32 },
      CTX,
    );
    const mesh = res.geometry as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it("exposes bundled fonts in the menu and builds text with a preset", () => {
    expect(FONT_NAMES).toContain("Helvetiker");
    expect(FONT_NAMES.length).toBeGreaterThanOrEqual(5);
    expect(BUILTIN_FONTS["Lobster"]).toBeDefined();

    const res = OBJECT_TEXT_NODE.evaluate(
      { text: "hello" },
      { ...OBJECT_TEXT_NODE.defaultParams, fontPreset: "Lobster", text: "hello" },
      CTX,
    );
    const mesh = res.geometry as THREE.Mesh;
    expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it("uses a font loaded via the Font (.json) field and re-extrudes", () => {
    const first = OBJECT_TEXT_NODE.evaluate({ text: "hi" }, OBJECT_TEXT_NODE.defaultParams, CTX);
    const g1 = (first.geometry as THREE.Mesh).geometry;

    // Load a font through the file field's onLoaded (same helvetiker JSON).
    const instance = { id: "text-test", type: "object/text", position: { x: 0, y: 0 }, params: {} } as never;
    const fields = OBJECT_TEXT_NODE.dynamicParamFields!(instance);
    const fontField = fields.find((f) => f.id === "fontPath") as { onLoaded?: (n: string, p: string, c: unknown) => void };
    fontField.onLoaded?.("text-test", "helvetiker.json", JSON.stringify(helvetikerData));

    const second = OBJECT_TEXT_NODE.evaluate({ text: "hi" }, OBJECT_TEXT_NODE.defaultParams, CTX);
    const g2 = (second.geometry as THREE.Mesh).geometry;
    // A new font object must trigger a re-extrude (new geometry instance).
    expect(g2).not.toBe(g1);
    expect(g2.attributes.position.count).toBeGreaterThan(0);
  });
});

describe("scalar angle sockets take degrees when wired", () => {
  // The panel edits these in degrees and stores radians (degrees: true, see
  // ParamPanel's toStoredUnit). A wired Value node carries a plain unitless
  // number, so reading it raw meant "36" typed by hand and "36" arriving on a
  // wire were different angles — 36° versus 36 radians.
  // The evaluator fills EVERY socket, wired or not — an unconnected one from
  // the node's own params — so a test that only sets `inputs` is not modelling
  // a wire at all. connectedInputs is what actually says "driven", and it is
  // what the degrees conversion keys off.
  const disc = (
    inputs: Record<string, unknown>,
    params: Record<string, unknown> = {},
    connected: string[] = Object.keys(inputs),
  ) => {
    const merged = { ...OBJECT_DISC_NODE.defaultParams, ...params };
    return OBJECT_DISC_NODE.evaluate(
      // Mirror the evaluator: unconnected sockets arrive holding the param.
      { ...merged, ...inputs },
      merged,
      {
        ...CTX,
        nodeId: `disc-${JSON.stringify(inputs)}-${JSON.stringify(params)}-${connected.join()}`,
        connectedInputs: new Set(connected),
      },
    );
  };

  function arcSpanX(res: Record<string, unknown>): number {
    const mesh = res.geometry as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    return box.max.x - box.min.x;
  }

  it("a wired 90 on Arc Angle is a quarter turn, the same as typing 90", () => {
    const wired = disc({ arcAngle: 90 });
    const typed = disc({}, { arcAngle: Math.PI / 2 });
    expect(arcSpanX(wired)).toBeCloseTo(arcSpanX(typed), 5);
  });

  it("a wired 180 on Start Angle matches typing 180, not 180 radians", () => {
    const wired = disc({ startAngle: 180, arcAngle: 90 });
    const typed = disc({}, { startAngle: Math.PI, arcAngle: Math.PI / 2 });
    const asRadians = disc({}, { startAngle: 180, arcAngle: Math.PI / 2 });
    const w = arcSpanX(wired);
    expect(w).toBeCloseTo(arcSpanX(typed), 5);
    // 180 rad wraps to a different part of the circle — proof the raw value
    // is not simply being passed through.
    expect(Math.abs(w - arcSpanX(asRadians))).toBeGreaterThan(1e-3);
  });

  it("leaves the stored param alone — an unwired disc still reads radians", () => {
    // Both span the full diameter in X, so compare the half that a 0..π arc
    // actually drops: its lower half.
    const minY = (res: Record<string, unknown>) => {
      const mesh = res.geometry as THREE.Mesh;
      mesh.geometry.computeBoundingBox();
      return mesh.geometry.boundingBox!.min.y;
    };
    const full = disc({}, { arcAngle: Math.PI * 2 });
    const half = disc({}, { arcAngle: Math.PI });
    expect(minY(full)).toBeLessThan(-0.1);
    expect(minY(half)).toBeCloseTo(0, 3);

    // The regression this guards: converting the *unwired* socket too, which
    // is filled from the param, applied the panel's degrees->radians a second
    // time. A freshly dropped Disc then needed ~10300 in Arc Angle to reach
    // half a circle.
    const fresh = disc({}, {});
    expect(minY(fresh)).toBeLessThan(-0.1);
  });

  it("a wired 360 fills the circle, where a wired 6.28 would be a hair of one", () => {
    const wired = disc({ arcAngle: 360 });
    const typed = disc({}, { arcAngle: Math.PI * 2 });
    expect(arcSpanX(wired)).toBeCloseTo(arcSpanX(typed), 5);
  });
});
