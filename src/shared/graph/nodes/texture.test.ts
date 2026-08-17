import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { TEXTURE_IMAGE_NODE, TEXTURE_PLANE_NODE, TEXTURE_TRANSFORM_NODE } from "./texture";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "tex-test-1" };

describe("TEXTURE NODES", () => {
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
});
