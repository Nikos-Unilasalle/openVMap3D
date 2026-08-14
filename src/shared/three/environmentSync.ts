import * as THREE from "three";
import { EnvironmentData } from "../graph/nodes/environment";
import { EvalResult } from "../graph/evaluate";
import { createBackgroundBlur } from "./backgroundBlur";
import { applyBackgroundImageTransform } from "./viewportScenery";

/**
 * Picks the Environment node feeding the Render node, falling back to any
 * Environment in the graph. The fallback exists because an Environment is
 * ambient by nature — it lights and backs the whole scene rather than being
 * a piece of it — so one dropped on the canvas is expected to take effect
 * without being wired anywhere, unlike geometry (see the Render output
 * handling in Viewport.tsx, which deliberately has no such fallback).
 */
export function resolveActiveEnvironment(results: EvalResult, renderNodeId: string): EnvironmentData | null {
  const fromRender = results.get(renderNodeId)?.environment;
  if (fromRender && typeof fromRender === "object") return fromRender as EnvironmentData;

  for (const res of results.values()) {
    if (res.environment && typeof res.environment === "object") return res.environment as EnvironmentData;
  }
  return null;
}

export interface EnvironmentTargets {
  /** The rendered scene — takes `environment` (reflections/lighting). */
  scene: THREE.Scene;
  /** Holds the background separately so postprocessing can swap it in and out. */
  bgScene: THREE.Scene;
  /** The editor's own gradient, used whenever no Environment applies. */
  fallbackBackground: THREE.Texture;
}

/**
 * Applies an Environment (or clears back to the editor gradient) across the
 * two scenes that need it, including the flat-background blur bake.
 *
 * `viewportWidth`/`viewportHeight` are needed because fitting a flat
 * background image to the frame is the one part of an Environment that can't
 * be computed by the node itself — environment.ts has no canvas to measure.
 */
export function applyEnvironment(
  env: EnvironmentData | null,
  targets: EnvironmentTargets,
  backgroundBlur: ReturnType<typeof createBackgroundBlur>,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const { scene, bgScene, fallbackBackground } = targets;

  if (!env) {
    scene.environment = null;
    bgScene.background = fallbackBackground;
    setBlurriness(scene, bgScene, 0);
    return;
  }

  // scene.environment (reflections/lighting) is driven by the HDRI texture
  // regardless of what's actually drawn behind the scene — a flat background
  // image only replaces what's *visible*, same as the flat color it stands in
  // for.
  scene.environment = env.texture ?? null;

  if (env.showBackground && env.backgroundImage) {
    // Blur the raw source first (the blur bake ignores any offset/repeat/
    // rotation — see createBackgroundBlur), THEN apply the fit/pan/rotate
    // transform to whichever texture, sharp or blurred, comes out of it.
    const bgTexture = backgroundBlur.apply(env.backgroundImage, env.blurriness);
    applyBackgroundImageTransform(bgTexture, env, viewportWidth, viewportHeight);
    bgScene.background = bgTexture;
    setBlurriness(scene, bgScene, 0);
  } else if (env.showBackground && env.texture) {
    bgScene.background = env.texture;
    setBlurriness(scene, bgScene, env.blurriness);
  } else {
    bgScene.background = env.color;
    setBlurriness(scene, bgScene, 0);
  }

  if ("environmentIntensity" in scene) {
    (scene as any).environmentIntensity = env.intensity;
  }
}

function setBlurriness(scene: THREE.Scene, bgScene: THREE.Scene, value: number): void {
  (bgScene as any).backgroundBlurriness = value;
  (scene as any).backgroundBlurriness = value;
}
