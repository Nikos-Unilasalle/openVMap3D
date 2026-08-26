import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { LIGHT_PROBE_NODE, bakeSignature, shouldRebake } from "./lightProbe";
import { disposeNodeCaches } from "../nodeCaches";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "probe-test" };

describe("shouldRebake", () => {
  it("re-bakes every frame in 'always', however settled the scene is", () => {
    expect(shouldRebake("always", "sig", "sig")).toBe(true);
  });

  it("in 'once', bakes the first time and then stops", () => {
    expect(shouldRebake("once", "sig", undefined)).toBe(true);
    expect(shouldRebake("once", "sig", "sig")).toBe(false);
  });

  it("in 'once', still re-bakes when what it was baked from changed", () => {
    // Moving the probe or changing its capture settings has to take effect
    // without the user knowing to switch modes.
    expect(shouldRebake("once", "moved", "sig")).toBe(true);
  });
});

describe("bakeSignature", () => {
  const at = new THREE.Vector3(0, 1.5, 0);

  it("changes when the scene's contents do, so a 'once' probe re-bakes as the scene fills", () => {
    // The bug this exists for: a node evaluates before the frame's objects are
    // in the scene, so the first bake of a fresh graph photographed a nearly
    // empty world (2 children), came back black, and never tried again.
    const early = bakeSignature(at, 64, 0.1, 100, 2);
    const settled = bakeSignature(at, 64, 0.1, 100, 6);
    expect(early).not.toBe(settled);
    expect(shouldRebake("once", settled, early)).toBe(true);
  });

  it("is stable once the scene and the settings are", () => {
    expect(bakeSignature(at, 64, 0.1, 100, 6)).toBe(bakeSignature(at.clone(), 64, 0.1, 100, 6));
    expect(shouldRebake("once", bakeSignature(at, 64, 0.1, 100, 6), bakeSignature(at, 64, 0.1, 100, 6))).toBe(false);
  });

  it("changes when the probe moves or its capture settings change", () => {
    const base = bakeSignature(at, 64, 0.1, 100, 6);
    expect(bakeSignature(new THREE.Vector3(1, 1.5, 0), 64, 0.1, 100, 6)).not.toBe(base);
    expect(bakeSignature(at, 128, 0.1, 100, 6)).not.toBe(base);
    expect(bakeSignature(at, 64, 0.5, 100, 6)).not.toBe(base);
    expect(bakeSignature(at, 64, 0.1, 50, 6)).not.toBe(base);
  });
});

describe("LIGHT_PROBE_NODE", () => {
  it("outputs a THREE.LightProbe", () => {
    const res = LIGHT_PROBE_NODE.evaluate({}, LIGHT_PROBE_NODE.defaultParams, CTX);
    expect((res.light as THREE.LightProbe).isLightProbe).toBe(true);
  });

  it("still produces a usable light with no renderer or scene, rather than throwing", () => {
    // The headless path: a test, or a viewport that hasn't handed its scene
    // over yet. An unbaked probe contributes nothing, which is a fine state.
    const res = LIGHT_PROBE_NODE.evaluate({}, LIGHT_PROBE_NODE.defaultParams, CTX);
    const probe = res.light as THREE.LightProbe;
    expect(probe.sh).toBeDefined();
    expect(probe.intensity).toBeGreaterThan(0);
  });

  it("sits where its Location says", () => {
    const res = LIGHT_PROBE_NODE.evaluate(
      {},
      { ...LIGHT_PROBE_NODE.defaultParams, location: new THREE.Vector3(2, 3, -4) },
      { ...CTX, nodeId: "probe-pos" },
    );
    expect((res.light as THREE.LightProbe).position.toArray()).toEqual([2, 3, -4]);
  });

  it("follows a wired matrix instead of its own Location", () => {
    const matrix = new THREE.Matrix4().setPosition(5, 6, 7);
    const res = LIGHT_PROBE_NODE.evaluate({ matrix }, LIGHT_PROBE_NODE.defaultParams, { ...CTX, nodeId: "probe-mat" });
    expect((res.light as THREE.LightProbe).position.toArray()).toEqual([5, 6, 7]);
  });

  it("takes Intensity from the socket over the param, and never goes negative", () => {
    const res = LIGHT_PROBE_NODE.evaluate(
      { intensity: 2.5 },
      { ...LIGHT_PROBE_NODE.defaultParams, intensity: 1 },
      { ...CTX, nodeId: "probe-int" },
    );
    expect((res.light as THREE.LightProbe).intensity).toBe(2.5);

    const negative = LIGHT_PROBE_NODE.evaluate(
      { intensity: -3 },
      LIGHT_PROBE_NODE.defaultParams,
      { ...CTX, nodeId: "probe-int" },
    );
    expect((negative.light as THREE.LightProbe).intensity).toBe(0);
  });

  it("hands back the same probe across frames, so the scene keeps one light", () => {
    const ctx = { ...CTX, nodeId: "probe-stable" };
    const first = LIGHT_PROBE_NODE.evaluate({}, LIGHT_PROBE_NODE.defaultParams, ctx);
    const second = LIGHT_PROBE_NODE.evaluate({}, LIGHT_PROBE_NODE.defaultParams, ctx);
    expect(second.light).toBe(first.light);
  });

  it("carries a helper icon so it can be seen and clicked, tagged to hide with the other helpers", () => {
    const res = LIGHT_PROBE_NODE.evaluate({}, LIGHT_PROBE_NODE.defaultParams, { ...CTX, nodeId: "probe-icon" });
    const probe = res.light as THREE.LightProbe;
    expect(probe.children.length).toBeGreaterThan(0);
    let helperParts = 0;
    probe.traverse((child) => {
      if (child.userData.isHelper) helperParts++;
    });
    expect(helperParts).toBeGreaterThan(0);
  });

  it("tags itself with its node id so the viewport can select it", () => {
    const res = LIGHT_PROBE_NODE.evaluate({}, LIGHT_PROBE_NODE.defaultParams, { ...CTX, nodeId: "probe-id" });
    expect((res.light as THREE.LightProbe).userData.nodeId).toBe("probe-id");
  });

  it("leaves the probe where the gizmo put it while it is being dragged", () => {
    const ctx = { ...CTX, nodeId: "probe-drag" };
    const params = { ...LIGHT_PROBE_NODE.defaultParams, location: new THREE.Vector3(0, 0, 0) };
    const probe = LIGHT_PROBE_NODE.evaluate({}, params, ctx).light as THREE.LightProbe;

    probe.position.set(9, 9, 9);
    LIGHT_PROBE_NODE.evaluate({}, params, { ...ctx, liveEditNodeId: "probe-drag" });
    expect(probe.position.toArray()).toEqual([9, 9, 9]);
  });

  it("releases its probe when the node is deleted", () => {
    const ctx = { ...CTX, nodeId: "probe-deleted" };
    const first = LIGHT_PROBE_NODE.evaluate({}, LIGHT_PROBE_NODE.defaultParams, ctx).light;
    disposeNodeCaches(["probe-deleted"]);
    const second = LIGHT_PROBE_NODE.evaluate({}, LIGHT_PROBE_NODE.defaultParams, ctx).light;
    expect(second).not.toBe(first);
  });
});
