import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { EnvironmentData } from "../graph/nodes/environment";
import { EvalResult } from "../graph/evaluate";
import { applyEnvironment, resolveActiveEnvironment } from "./environmentSync";

function env(overrides: Partial<EnvironmentData> = {}): EnvironmentData {
  return {
    texture: null,
    color: new THREE.Color(0x112233),
    intensity: 1,
    blurriness: 0,
    showBackground: true,
    backgroundImage: null,
    backgroundFit: "cover",
    backgroundScale: new THREE.Vector2(1, 1),
    backgroundOffset: new THREE.Vector2(0, 0),
    backgroundRotation: 0,
    ambientIntensity: 0.65,
    sunIntensity: 1.2,
    ...overrides,
  } as EnvironmentData;
}

/** Stand-in for createBackgroundBlur — records what it was asked to blur. */
function fakeBlur() {
  const calls: number[] = [];
  return {
    calls,
    apply(source: THREE.Texture, blurriness: number) {
      calls.push(blurriness);
      return source;
    },
    dispose() {},
  };
}

function targets() {
  return {
    scene: new THREE.Scene(),
    bgScene: new THREE.Scene(),
    fallbackBackground: new THREE.Texture(),
    ambientLight: new THREE.AmbientLight(0xffffff, 0.65),
    sunLight: new THREE.DirectionalLight(0xffffff, 1.2),
  };
}

describe("resolveActiveEnvironment", () => {
  test("prefers the Environment wired into the Render node", () => {
    const wired = env();
    const stray = env();
    const results: EvalResult = new Map([
      ["other", { environment: stray }],
      ["render", { environment: wired }],
    ]);

    expect(resolveActiveEnvironment(results, "render")).toBe(wired);
  });

  test("falls back to an unwired Environment — it is ambient, not scene content", () => {
    const stray = env();
    const results: EvalResult = new Map([
      ["render", {}],
      ["stray", { environment: stray }],
    ]);

    expect(resolveActiveEnvironment(results, "render")).toBe(stray);
  });

  test("returns null when no node produces an environment", () => {
    const results: EvalResult = new Map([["render", {}]]);
    expect(resolveActiveEnvironment(results, "render")).toBeNull();
  });
});

describe("applyEnvironment", () => {
  test("no environment restores the editor gradient and clears reflections", () => {
    const t = targets();
    applyEnvironment(null, t, fakeBlur(), 800, 600);

    expect(t.scene.environment).toBeNull();
    expect(t.bgScene.background).toBe(t.fallbackBackground);
  });

  test("a flat color environment paints the background with that color", () => {
    const t = targets();
    const color = new THREE.Color(0xff0000);
    applyEnvironment(env({ color, showBackground: true }), t, fakeBlur(), 800, 600);

    expect(t.bgScene.background).toBe(color);
  });

  test("an HDRI drives reflections even when its background is hidden", () => {
    const t = targets();
    const texture = new THREE.Texture();
    applyEnvironment(env({ texture, showBackground: false }), t, fakeBlur(), 800, 600);

    expect(t.scene.environment).toBe(texture);
    expect(t.bgScene.background).not.toBe(texture);
  });

  test("a flat background image is routed through the blur baker", () => {
    const t = targets();
    const blur = fakeBlur();
    const backgroundImage = new THREE.Texture();
    backgroundImage.image = { width: 100, height: 100 };

    applyEnvironment(env({ backgroundImage, blurriness: 0.004 }), t, blur, 800, 600);

    expect(blur.calls).toEqual([0.004]);
    expect(t.bgScene.background).toBe(backgroundImage);
  });

  test("three.js backgroundBlurriness is only used for the HDRI path, not the flat-image one", () => {
    // A plain flat Texture never gets three.js's PMREM treatment, so leaving
    // backgroundBlurriness set there would be a silent no-op — the flat path
    // does its own bake instead (see backgroundBlur.ts).
    const flat = targets();
    const backgroundImage = new THREE.Texture();
    backgroundImage.image = { width: 100, height: 100 };
    applyEnvironment(env({ backgroundImage, blurriness: 0.004 }), flat, fakeBlur(), 800, 600);
    expect((flat.scene as any).backgroundBlurriness).toBe(0);

    const hdri = targets();
    applyEnvironment(env({ texture: new THREE.Texture(), blurriness: 0.3 }), hdri, fakeBlur(), 800, 600);
    expect((hdri.scene as any).backgroundBlurriness).toBeCloseTo(0.3);
  });

  test("the environment drives the global ambient and sun intensities", () => {
    const t = targets();
    applyEnvironment(env({ ambientIntensity: 0.3, sunIntensity: 0.9 }), t, fakeBlur(), 800, 600);
    expect(t.ambientLight.intensity).toBeCloseTo(0.3);
    expect(t.ambientLight.visible).toBe(true);
    expect(t.sunLight.intensity).toBeCloseTo(0.9);
    expect(t.sunLight.visible).toBe(true);
  });

  test("zero light levels disable the global lights", () => {
    const t = targets();
    applyEnvironment(env({ ambientIntensity: 0, sunIntensity: 0 }), t, fakeBlur(), 800, 600);
    expect(t.ambientLight.intensity).toBe(0);
    expect(t.ambientLight.visible).toBe(false);
    expect(t.sunLight.intensity).toBe(0);
    expect(t.sunLight.visible).toBe(false);
  });

  test("no environment restores the default global light levels", () => {
    const t = targets();
    t.ambientLight.intensity = 0;
    t.ambientLight.visible = false;
    t.sunLight.intensity = 0;
    t.sunLight.visible = false;

    applyEnvironment(null, t, fakeBlur(), 800, 600);
    expect(t.ambientLight.intensity).toBeCloseTo(0.65);
    expect(t.ambientLight.visible).toBe(true);
    expect(t.sunLight.intensity).toBeCloseTo(1.2);
    expect(t.sunLight.visible).toBe(true);
  });
});
