import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { TEXTURE_IMAGE_NODE, TEXTURE_PIXEL_SPAWNER_NODE, TEXTURE_PLANE_NODE, TEXTURE_PROCEDURAL_NODE, TEXTURE_TO_NORMAL_NODE, TEXTURE_TRANSFORM_NODE } from "./texture";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "tex-test-1" };

describe("TEXTURE NODES", () => {
  it("TEXTURE_PROCEDURAL_NODE registers patterns and degrades gracefully without a DOM", () => {
    expect(TEXTURE_PROCEDURAL_NODE.type).toBe("texture/procedural");
    const fields = TEXTURE_PROCEDURAL_NODE.dynamicParamFields!({ id: "p", type: "texture/procedural", position: { x: 0, y: 0 }, params: {} } as never);
    const typeField = fields.find((f) => f.id === "type") as { options?: string[] };
    expect(typeField.options).toEqual(
      expect.arrayContaining(["checker", "gradient", "stripes", "grid", "rings", "wave", "perlin", "voronoi", "noise"]),
    );
    // Octaves only appears when perlin is selected.
    const perlinFields = TEXTURE_PROCEDURAL_NODE.dynamicParamFields!({ id: "p", type: "texture/procedural", position: { x: 0, y: 0 }, params: { type: "perlin" } } as never);
    expect(perlinFields.some((f) => f.id === "octaves")).toBe(true);
    // Node environment has no `document` → evaluate returns a null texture, not a crash.
    const res = TEXTURE_PROCEDURAL_NODE.evaluate({}, TEXTURE_PROCEDURAL_NODE.defaultParams, CTX);
    expect(res.texture).toBeNull();
  });

  it("TEXTURE_TO_NORMAL_NODE registers and degrades gracefully without a DOM", () => {
    expect(TEXTURE_TO_NORMAL_NODE.type).toBe("texture/to_normal");
    const res = TEXTURE_TO_NORMAL_NODE.evaluate({ texture: new THREE.Texture() }, TEXTURE_TO_NORMAL_NODE.defaultParams, CTX);
    expect(res.normal).toBeNull();
  });

  it("TEXTURE_IMAGE_NODE evaluates fallback empty texture", () => {
    const res = TEXTURE_IMAGE_NODE.evaluate({}, TEXTURE_IMAGE_NODE.defaultParams, CTX);
    expect(res.texture).toBeInstanceOf(THREE.Texture);
    expect(res.aspectRatio).toBe(1.0);
  });

  it("TEXTURE_PLANE_NODE creates 3D plane mesh with texture mapping", () => {
    const tex = new THREE.Texture();
    const res = TEXTURE_PLANE_NODE.evaluate(
      { texture: tex },
      TEXTURE_PLANE_NODE.defaultParams,
      CTX
    );

    const mesh = res.geometry as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect((mesh.material as THREE.MeshStandardMaterial).color.r).toBe(1);
  });

  it("TEXTURE_TRANSFORM_NODE modifies texture repeat and rotation", () => {
    const tex = new THREE.Texture();
    const res = TEXTURE_TRANSFORM_NODE.evaluate(
      { texture: tex, rotation: 90 },
      { scaleX: 2, scaleY: 3, offsetX: 0.5, offsetY: 0.5, rotation: 0 },
      CTX
    );

    const transformedTex = res.texture as THREE.Texture;
    expect(transformedTex).toBeInstanceOf(THREE.Texture);
    expect(transformedTex.repeat.x).toBe(2);
    expect(transformedTex.repeat.y).toBe(3);
    expect(transformedTex.rotation).toBeCloseTo(Math.PI / 2);
  });

  it("TEXTURE_PIXEL_SPAWNER_NODE registers properly and handles missing DOM / empty inputs gracefully", () => {
    expect(TEXTURE_PIXEL_SPAWNER_NODE.type).toBe("texture/pixel-spawner");
    const res = TEXTURE_PIXEL_SPAWNER_NODE.evaluate(
      { texture: null, density: 50 },
      TEXTURE_PIXEL_SPAWNER_NODE.defaultParams,
      CTX
    );
    expect(res.geometry).toBeInstanceOf(THREE.Group);
    expect(res.count).toBe(0);
    expect(res.colors).toEqual([]);
    expect(res.positions).toEqual([]);
    expect(res.intensities).toEqual([]);
  });

  it("TEXTURE_PIXEL_SPAWNER_NODE supports orientation options (xy, xz, yz)", () => {
    const fields = TEXTURE_PIXEL_SPAWNER_NODE.dynamicParamFields!({ id: "p", type: "texture/pixel-spawner", position: { x: 0, y: 0 }, params: {} } as never);
    const orientationField = fields.find((f) => f.id === "orientation") as { options?: string[] };
    expect(orientationField).toBeDefined();
    expect(orientationField.options).toEqual(["xy", "xz", "yz"]);
  });
});

