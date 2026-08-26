import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { collectTextures, textureFileMapFrom } from "./textureCapture";

function fakeTexture(): THREE.Texture {
  const tex = new THREE.Texture();
  tex.image = { width: 4, height: 4 };
  return tex;
}

describe("collectTextures", () => {
  it("collects map and normalMap from a material, in order", () => {
    const map = fakeTexture();
    const normalMap = fakeTexture();
    const material = new THREE.MeshStandardMaterial({ map, normalMap });

    const collected = collectTextures([material]);
    expect(collected.map((c) => c.texture)).toEqual([map, normalMap]);
    expect(collected.map((c) => c.fileName)).toEqual(["tex_0.png", "tex_1.png"]);
  });

  it("dedupes the same texture reused across multiple materials", () => {
    const shared = fakeTexture();
    const materialA = new THREE.MeshStandardMaterial({ map: shared });
    const materialB = new THREE.MeshStandardMaterial({ map: shared });

    const collected = collectTextures([materialA, materialB]);
    expect(collected.length).toBe(1);
  });

  it("skips a texture with no decoded image (e.g. still loading)", () => {
    const tex = new THREE.Texture(); // .image is null until loaded
    const material = new THREE.MeshStandardMaterial({ map: tex });
    expect(collectTextures([material])).toEqual([]);
  });

  it("textureFileMapFrom builds a uuid -> fileName lookup", () => {
    const map = fakeTexture();
    const material = new THREE.MeshStandardMaterial({ map });
    const collected = collectTextures([material]);
    const lookup = textureFileMapFrom(collected);
    expect(lookup.get(map.uuid)).toBe("tex_0.png");
  });
});
