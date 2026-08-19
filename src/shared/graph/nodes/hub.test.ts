import * as THREE from "three";
import { describe, expect, test, vi } from "vitest";
import { EvalContext } from "../types";
import { HUB_IMAGE_NODE, HUB_TEXT_NODE } from "./hub";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "hub-test" };

describe("HUB_TEXT_NODE", () => {
  test("is visible by default (trigger fallback is 1)", () => {
    const res = HUB_TEXT_NODE.evaluate({}, HUB_TEXT_NODE.defaultParams, CTX);
    const hud = res.hud as { visible: boolean; cssOpacity: number };
    expect(hud.visible).toBe(true);
    expect(hud.cssOpacity).toBeCloseTo(1);
  });

  test("applies text and style params", () => {
    const params = {
      ...HUB_TEXT_NODE.defaultParams,
      text: "Title",
      fontSize: 64,
      color: new THREE.Color(0xff0000),
      useBackground: true,
      backgroundColor: new THREE.Color(0x0000ff),
      borderRadius: 16,
    };
    const res = HUB_TEXT_NODE.evaluate({ trigger: 1 }, params, { ...CTX, nodeId: "hub-style" });
    const hud = res.hud as {
      text: string;
      fontSize: number;
      color: string;
      backgroundColor: string | null;
      borderRadius: number;
    };
    expect(hud.text).toBe("Title");
    expect(hud.fontSize).toBe(64);
    expect(hud.color).toContain("255");
    expect(hud.backgroundColor).not.toBeNull();
    expect(hud.borderRadius).toBe(16);
  });

  test("applies rotation and text shadow", () => {
    const params = {
      ...HUB_TEXT_NODE.defaultParams,
      rotation: 30,
      useTextShadow: true,
      textShadowColor: new THREE.Color(0x000000),
      textShadowBlur: 3,
      textShadowOffsetX: 2,
      textShadowOffsetY: 2,
    };
    const res = HUB_TEXT_NODE.evaluate({ trigger: 1, x: 200, y: 800 }, params, { ...CTX, nodeId: "hub-shadow" });
    const hud = res.hud as { rotation: number; x: number; y: number; textShadow: string | null; transform: string };
    expect(hud.rotation).toBe(30);
    expect(hud.x).toBe(200);
    expect(hud.y).toBe(800);
    expect(hud.textShadow).not.toBeNull();
    expect(hud.transform).toContain("rotate(30deg)");
  });

  test("a rising edge toggles it out, then back in (toggle)", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const nodeId = "hub-exit";
    // Default shown. Release, then press -> rising edge toggles to exit. Still
    // shown while exiting.
    HUB_TEXT_NODE.evaluate({ trigger: 0 }, HUB_TEXT_NODE.defaultParams, { ...CTX, nodeId });
    now.mockReturnValue(6000);
    const res = HUB_TEXT_NODE.evaluate({ trigger: 1 }, HUB_TEXT_NODE.defaultParams, { ...CTX, nodeId });
    expect((res.hud as { visible: boolean }).visible).toBe(true);

    // Mid-way through the exit the opacity has dropped below full.
    now.mockReturnValue(6300);
    const mid = HUB_TEXT_NODE.evaluate({ trigger: 1 }, HUB_TEXT_NODE.defaultParams, { ...CTX, nodeId });
    expect((mid.hud as { cssOpacity: number }).cssOpacity).toBeLessThan(1);

    // After the exit finishes, it is hidden.
    now.mockReturnValue(10000);
    const done = HUB_TEXT_NODE.evaluate({ trigger: 1 }, HUB_TEXT_NODE.defaultParams, { ...CTX, nodeId });
    expect((done.hud as { visible: boolean }).visible).toBe(false);

    // Release and press again -> rising edge toggles back in (enter).
    HUB_TEXT_NODE.evaluate({ trigger: 0 }, HUB_TEXT_NODE.defaultParams, { ...CTX, nodeId });
    now.mockReturnValue(11000);
    HUB_TEXT_NODE.evaluate({ trigger: 1 }, HUB_TEXT_NODE.defaultParams, { ...CTX, nodeId });
    now.mockReturnValue(12000);
    const back = HUB_TEXT_NODE.evaluate({ trigger: 1 }, HUB_TEXT_NODE.defaultParams, { ...CTX, nodeId });
    expect((back.hud as { visible: boolean }).visible).toBe(true);

    now.mockRestore();
  });
});

describe("HUB_IMAGE_NODE", () => {
  test("outputs a hidden element until triggered, and keeps rotation in degrees", () => {
    const res = HUB_IMAGE_NODE.evaluate(
      { rotation: 90 },
      { ...HUB_IMAGE_NODE.defaultParams, rotation: 90 },
      { ...CTX, nodeId: "hub-img-1" },
    );
    const hud = res.hud as { visible: boolean; rotation: number; imageWidth: number; transform: string };
    expect(hud.visible).toBe(false);
    expect(hud.rotation).toBe(90);
    expect(hud.imageWidth).toBeGreaterThan(0);
    expect(hud.transform).toContain("rotate(90deg)");
  });

  test("stays hidden when no image is loaded, even when triggered", () => {
    const res = HUB_IMAGE_NODE.evaluate({ trigger: 1 }, HUB_IMAGE_NODE.defaultParams, {
      ...CTX,
      nodeId: "hub-img-2",
    });
    const hud = res.hud as { visible: boolean };
    // No image URL loaded yet -> not rendered, but evaluate must not throw.
    expect(hud.visible).toBe(false);
  });

  test("multiple HUD image nodes each keep their own loaded image and id", async () => {
    // Mock the browser primitives the onLoaded callback uses.
    let seq = 0;
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 64;
        naturalHeight = 64;
        onload: (() => void) | null = null;
        set src(_: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.stubGlobal("URL", {
      createObjectURL: () => `blob:img-${++seq}`,
      revokeObjectURL: () => {},
    });
    vi.stubGlobal("performance", { now: () => 0 });

    const fieldsA = HUB_IMAGE_NODE.dynamicParamFields!({
      id: "hub-a",
      type: "hub/image",
      position: { x: 0, y: 0 },
      params: {},
    } as never);
    const fileA = fieldsA.find((f) => f.id === "filePath") as any;
    fileA.onLoaded("hub-a", "a.png", new Uint8Array([1]));
    await Promise.resolve();

    const fieldsB = HUB_IMAGE_NODE.dynamicParamFields!({
      id: "hub-b",
      type: "hub/image",
      position: { x: 0, y: 0 },
      params: {},
    } as never);
    const fileB = fieldsB.find((f) => f.id === "filePath") as any;
    fileB.onLoaded("hub-b", "b.png", new Uint8Array([2]));
    await Promise.resolve();

    const hudA = HUB_IMAGE_NODE.evaluate({}, HUB_IMAGE_NODE.defaultParams, { ...CTX, nodeId: "hub-a" }).hud as any;
    const hudB = HUB_IMAGE_NODE.evaluate({}, HUB_IMAGE_NODE.defaultParams, { ...CTX, nodeId: "hub-b" }).hud as any;

    expect(hudA.id).toBe("hub-a");
    expect(hudB.id).toBe("hub-b");
    expect(hudA.imageUrl).toBeTruthy();
    expect(hudB.imageUrl).toBeTruthy();
    expect(hudA.imageUrl).not.toBe(hudB.imageUrl);
    expect(hudA.visible).toBe(true);
    expect(hudB.visible).toBe(true);

    vi.unstubAllGlobals();
  });
});
