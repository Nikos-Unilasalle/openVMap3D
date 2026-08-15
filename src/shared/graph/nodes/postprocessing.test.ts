import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import {
  POSTPROCESS_ANTIALIAS_NODE,
  POSTPROCESS_BLOOM_NODE,
  POSTPROCESS_COLOR_CORRECTION_NODE,
  POSTPROCESS_DOF_NODE,
  POSTPROCESS_FILM_GRAIN_NODE,
  POSTPROCESS_GLITCH_NODE,
  POSTPROCESS_KALEIDOSCOPE_NODE,
  POSTPROCESS_OUTLINE_NODE,
  POSTPROCESS_PIXELATE_NODE,
  POSTPROCESS_RGB_SHIFT_NODE,
  POSTPROCESS_VIGNETTE_NODE,
  POSTPROCESS_FOG_NODE,
  PostProcessConfig,
} from "./postprocessing";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "test-node" };

describe("POST-PROCESSING NODES", () => {
  it("evaluates Fog node and returns effect config", () => {
    const res = POSTPROCESS_FOG_NODE.evaluate(
      { near: 5.0, far: 50.0, density: 0.03 },
      { mode: "exponential" },
      CTX
    );
    const effects = res.effect as PostProcessConfig[];
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe("fog");
    expect(effects[0].params.near).toBe(5.0);
    expect(effects[0].params.far).toBe(50.0);
    expect(effects[0].params.mode).toBe("exponential");
  });
  it("evaluates Bloom node and returns effect config", () => {
    const res = POSTPROCESS_BLOOM_NODE.evaluate(
      { strength: 2.0, radius: 0.5, threshold: 0.8 },
      {},
      CTX
    );
    const effects = res.effect as PostProcessConfig[];
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe("bloom");
    expect(effects[0].params.strength).toBe(2.0);
    expect(effects[0].params.radius).toBe(0.5);
  });

  it("chains multiple post-processing nodes in series", () => {
    const bloomRes = POSTPROCESS_BLOOM_NODE.evaluate({ strength: 1.8 }, {}, { ...CTX, nodeId: "bloom-node" });
    const vigRes = POSTPROCESS_VIGNETTE_NODE.evaluate(
      { effect: bloomRes.effect, offset: 1.2, darkness: 2.0 },
      {},
      { ...CTX, nodeId: "vig-node" }
    );
    const glitchRes = POSTPROCESS_GLITCH_NODE.evaluate(
      { effect: vigRes.effect, wild: 1 },
      {},
      { ...CTX, nodeId: "glitch-node" }
    );

    const effects = glitchRes.effect as PostProcessConfig[];
    expect(effects.length).toBe(3);
    expect(effects[0].type).toBe("bloom");
    expect(effects[1].type).toBe("vignette");
    expect(effects[2].type).toBe("glitch");
  });

  it("evaluates RGB Shift / Aberration node", () => {
    const res = POSTPROCESS_RGB_SHIFT_NODE.evaluate({ amount: 0.02, angle: 90 }, {}, CTX);
    const effects = res.effect as PostProcessConfig[];
    expect(effects[0].type).toBe("rgb-shift");
    expect(effects[0].params.amount).toBe(0.02);
  });

  it("evaluates Depth of Field node", () => {
    const res = POSTPROCESS_DOF_NODE.evaluate({ focus: 15.0, aperture: 0.05 }, {}, CTX);
    const effects = res.effect as PostProcessConfig[];
    expect(effects[0].type).toBe("dof");
    expect(effects[0].params.focus).toBe(15.0);
  });

  it("evaluates Outline node", () => {
    const res = POSTPROCESS_OUTLINE_NODE.evaluate({ edgeStrength: 4.0, edgeThickness: 2.0 }, {}, CTX);
    const effects = res.effect as PostProcessConfig[];
    expect(effects[0].type).toBe("outline");
    expect(effects[0].params.edgeStrength).toBe(4.0);
  });

  it("evaluates Film Grain node", () => {
    const res = POSTPROCESS_FILM_GRAIN_NODE.evaluate({ noiseIntensity: 0.5, grayscale: 1 }, {}, CTX);
    const effects = res.effect as PostProcessConfig[];
    expect(effects[0].type).toBe("film-grain");
    expect(effects[0].params.grayscale).toBe(true);
  });

  it("evaluates Pixelate node", () => {
    const res = POSTPROCESS_PIXELATE_NODE.evaluate({ pixelSize: 12.0 }, {}, CTX);
    const effects = res.effect as PostProcessConfig[];
    expect(effects[0].type).toBe("pixelate");
    expect(effects[0].params.pixelSize).toBe(12.0);
  });

  it("evaluates Kaleidoscope node", () => {
    const res = POSTPROCESS_KALEIDOSCOPE_NODE.evaluate({ sides: 8, angle: 45 }, {}, CTX);
    const effects = res.effect as PostProcessConfig[];
    expect(effects[0].type).toBe("kaleidoscope");
    expect(effects[0].params.sides).toBe(8);
  });

  it("evaluates Color Correction node", () => {
    const res = POSTPROCESS_COLOR_CORRECTION_NODE.evaluate({ brightness: 0.1, contrast: 1.2 }, {}, CTX);
    const effects = res.effect as PostProcessConfig[];
    expect(effects[0].type).toBe("color-correction");
    expect(effects[0].params.brightness).toBe(0.1);
  });

  it("evaluates FXAA Antialias node", () => {
    const res = POSTPROCESS_ANTIALIAS_NODE.evaluate({ enabled: 1 }, {}, CTX);
    const effects = res.effect as PostProcessConfig[];
    expect(effects[0].type).toBe("antialias");
    expect(effects[0].params.enabled).toBe(true);
  });
});
