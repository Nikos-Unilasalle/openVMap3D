import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { OBJECT_TEXT_NODE } from "./object";
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
