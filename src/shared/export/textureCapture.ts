import * as THREE from "three";

export interface CollectedTexture {
  texture: THREE.Texture;
  fileName: string;
}

/**
 * Every unique (by uuid) `map`/`normalMap` texture referenced by the given
 * materials, assigned a stable, sequential filename — order is deterministic
 * (materials array order, `map` before `normalMap` within a material), so
 * re-exporting the same scene reproduces the same filenames. Pure/no-canvas
 * so it's unit-testable; the actual pixel encode is encodeTextureToPng below.
 */
export function collectTextures(materials: THREE.Material[]): CollectedTexture[] {
  const seen = new Map<string, CollectedTexture>();
  let index = 0;
  for (const material of materials) {
    for (const key of ["map", "normalMap"] as const) {
      const tex = (material as unknown as Record<string, unknown>)[key] as THREE.Texture | null | undefined;
      if (!tex || !tex.image) continue;
      if (seen.has(tex.uuid)) continue;
      seen.set(tex.uuid, { texture: tex, fileName: `tex_${index}.png` });
      index++;
    }
  }
  return Array.from(seen.values());
}

export function textureFileMapFrom(collected: CollectedTexture[]): Map<string, string> {
  return new Map(collected.map((c) => [c.texture.uuid, c.fileName]));
}

/**
 * Re-encodes a loaded THREE.Texture's image to PNG bytes via an offscreen
 * canvas — the only way to get pixel data back out of whatever the source
 * actually was (HTMLImageElement, ImageBitmap, a procedural canvas texture)
 * without re-reading the original file, which the app doesn't keep a handle
 * to once decoded. Canvas-based, so this only runs in a real browser/webview
 * — not covered by the (Node-environment) unit tests; collectTextures above
 * carries the part of this that is.
 */
export async function encodeTextureToPng(texture: THREE.Texture): Promise<Uint8Array> {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = image?.width || 1;
  const height = image?.height || 1;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable — cannot re-encode texture");
  ctx.drawImage(texture.image as CanvasImageSource, 0, 0, width, height);
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))), "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}
