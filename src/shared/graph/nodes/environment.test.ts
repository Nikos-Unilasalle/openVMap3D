import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ENVIRONMENT_NODE, EnvironmentData } from "./environment";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "env-test" };

describe("ENVIRONMENT NODE", () => {
  it("evaluates with default background color and intensity", () => {
    const res = ENVIRONMENT_NODE.evaluate({}, {}, CTX);
    const env = res.environment as EnvironmentData;
    expect(env).toBeDefined();
    expect(env.color).toBeInstanceOf(THREE.Color);
    expect(env.color.getHexString()).toBe("0d1117");
    expect(env.intensity).toBe(1.0);
    expect(env.showBackground).toBe(true);
    expect(env.blurriness).toBe(0.0);
  });

  it("evaluates custom background color, intensity, and blurriness", () => {
    const res = ENVIRONMENT_NODE.evaluate(
      { color: new THREE.Color(0x1a202c), intensity: 2.5, background: 0, blurriness: 0.5 },
      {},
      CTX
    );
    const env = res.environment as EnvironmentData;
    expect(env.color.getHexString()).toBe("1a202c");
    expect(env.intensity).toBe(2.5);
    expect(env.showBackground).toBe(false);
    expect(env.blurriness).toBe(0.5);
  });
});
