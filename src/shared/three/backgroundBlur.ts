import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader.js";

/**
 * Bakes a blurred stand-in for a flat background image.
 *
 * three.js's own `scene.backgroundBlurriness` only kicks in for a CubeTexture
 * or an EquirectangularReflectionMapping texture (gated inside
 * WebGLBackground.js) — a plain flat Texture never gets that PMREM treatment,
 * so "Bg Blur" silently did nothing for a fixed background image. This
 * reproduces the same downsample-then-blur trick UnrealBloomPass uses: render
 * into a target far smaller than the viewport (the smaller the target, the
 * stronger a fixed 9-tap kernel reads once it's stretched back up to fill the
 * screen), ping-pong a couple of horizontal/vertical passes, and hand back
 * that small blurred target's texture as the background.
 *
 * The result is cached and only re-baked when the source image or the blur
 * amount actually changes — a handful of tiny offscreen draws, not a
 * per-frame cost.
 */
export function createBackgroundBlur(renderer: THREE.WebGLRenderer) {
  const blurQuad = new FullScreenQuad(new THREE.ShaderMaterial(HorizontalBlurShader));
  const hBlurMaterial = blurQuad.material as THREE.ShaderMaterial;
  const vBlurMaterial = new THREE.ShaderMaterial(VerticalBlurShader);
  // The two ping-pong targets are always the same size and always exist or
  // not together, so they're held as one value rather than two independently
  // nullable ones — the pairing is the invariant worth encoding.
  let targets: { size: number; a: THREE.WebGLRenderTarget; b: THREE.WebGLRenderTarget } | null = null;
  let baked: { source: THREE.Texture; strength: number; texture: THREE.Texture } | null = null;

  function targetsOfSize(size: number) {
    if (targets && targets.size === size) return targets;
    targets?.a.dispose();
    targets?.b.dispose();
    targets = {
      size,
      a: new THREE.WebGLRenderTarget(size, size, { generateMipmaps: false }),
      b: new THREE.WebGLRenderTarget(size, size, { generateMipmaps: false }),
    };
    return targets;
  }

  return {
    /** Returns `source` untouched when no blur is asked for. */
    apply(source: THREE.Texture, blurriness: number): THREE.Texture {
      if (blurriness <= 0) return source;

      // The full-strength blur (what used to sit at blurriness=1) was already
      // maxed out well before the slider got anywhere near there — ×100 so the
      // whole useful range lives in [0, 0.01], matching what actually reads as
      // "just barely too strong" through "as blurry as anyone wants".
      const strength = Math.min(1, blurriness * 100);
      if (baked && baked.source === source && baked.strength === strength) return baked.texture;

      // Smaller target = cheaper AND blurrier — same lever bloom already pulls.
      const size = Math.max(8, Math.round(256 * (1 - strength) + 8));
      const { a: ping, b: pong } = targetsOfSize(size);

      const iterations = 1 + Math.round(strength * 3);
      let readTexture = source;
      for (let i = 0; i < iterations; i++) {
        hBlurMaterial.uniforms.tDiffuse.value = readTexture;
        hBlurMaterial.uniforms.h.value = 1 / size;
        renderer.setRenderTarget(ping);
        blurQuad.material = hBlurMaterial;
        blurQuad.render(renderer);

        vBlurMaterial.uniforms.tDiffuse.value = ping.texture;
        vBlurMaterial.uniforms.v.value = 1 / size;
        renderer.setRenderTarget(pong);
        blurQuad.material = vBlurMaterial;
        blurQuad.render(renderer);

        readTexture = pong.texture;
      }
      renderer.setRenderTarget(null);

      baked = { source, strength, texture: readTexture };
      return readTexture;
    },

    dispose(): void {
      blurQuad.dispose();
      hBlurMaterial.dispose();
      vBlurMaterial.dispose();
      targets?.a.dispose();
      targets?.b.dispose();
      targets = null;
      baked = null;
    },
  };
}
