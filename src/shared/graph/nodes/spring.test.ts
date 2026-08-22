import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EvalContext } from "../types";
import { SPRING_NODE, SPRING_VECTOR_NODE } from "./spring";
import { POINTS_SELECTION_NODE } from "./pointsSelection";

function ctx(nodeId: string): EvalContext {
  return { time: 0, step: 0, nodeId };
}

describe("SPRING_NODE", () => {
  it("seeds at the target on the first frame — no snap-in from 0", () => {
    const res = SPRING_NODE.evaluate({ target: 5, time: 0 }, SPRING_NODE.defaultParams, ctx("s1"));
    expect(res.value).toBe(5);
  });

  it("lags behind a target that changes after the first frame", () => {
    const nodeId = "s2";
    SPRING_NODE.evaluate({ target: 0, time: 0 }, SPRING_NODE.defaultParams, ctx(nodeId));
    const res = SPRING_NODE.evaluate({ target: 10, time: 1 / 60 }, SPRING_NODE.defaultParams, ctx(nodeId));
    expect(res.value).toBeGreaterThan(0);
    expect(res.value).toBeLessThan(10);
  });

  it("eventually converges on the target and stays there", () => {
    const nodeId = "s3";
    const params = { ...SPRING_NODE.defaultParams, smoothing: 0.3, bounciness: 0.2 };
    SPRING_NODE.evaluate({ target: 0, time: 0 }, params, ctx(nodeId));
    let t = 0;
    let last = 0;
    for (let i = 0; i < 300; i++) {
      t += 1 / 60;
      last = SPRING_NODE.evaluate({ target: 10, time: t }, params, ctx(nodeId)).value as number;
    }
    expect(last).toBeCloseTo(10, 1);
  });

  it("bounciness 0 never overshoots the target", () => {
    const nodeId = "s4";
    const params = { ...SPRING_NODE.defaultParams, smoothing: 0.4, bounciness: 0 };
    SPRING_NODE.evaluate({ target: 0, time: 0 }, params, ctx(nodeId));
    let t = 0;
    let max = -Infinity;
    for (let i = 0; i < 120; i++) {
      t += 1 / 60;
      const v = SPRING_NODE.evaluate({ target: 10, time: t }, params, ctx(nodeId)).value as number;
      max = Math.max(max, v);
    }
    expect(max).toBeLessThanOrEqual(10 + 1e-6);
  });

  it("bounciness near 1 overshoots the target before settling", () => {
    const nodeId = "s5";
    const params = { ...SPRING_NODE.defaultParams, smoothing: 0.4, bounciness: 0.95 };
    SPRING_NODE.evaluate({ target: 0, time: 0 }, params, ctx(nodeId));
    let t = 0;
    let max = -Infinity;
    for (let i = 0; i < 120; i++) {
      t += 1 / 60;
      const v = SPRING_NODE.evaluate({ target: 10, time: t }, params, ctx(nodeId)).value as number;
      max = Math.max(max, v);
    }
    expect(max).toBeGreaterThan(10);
  });

  it("a real scrub backwards reseeds at the target instead of springing across the jump", () => {
    const nodeId = "s6";
    const params = { ...SPRING_NODE.defaultParams, smoothing: 0.5, bounciness: 0.5 };
    SPRING_NODE.evaluate({ target: 0, time: 0 }, params, ctx(nodeId));
    SPRING_NODE.evaluate({ target: 10, time: 1 }, params, ctx(nodeId));
    const res = SPRING_NODE.evaluate({ target: 3, time: 0 }, params, ctx(nodeId));
    expect(res.value).toBe(3);
  });
});

describe("SPRING_VECTOR_NODE", () => {
  it("springs each axis independently toward the target vector", () => {
    const nodeId = "sv1";
    const params = { ...SPRING_VECTOR_NODE.defaultParams, smoothing: 0.3, bounciness: 0.2 };
    SPRING_VECTOR_NODE.evaluate({ target: new THREE.Vector3(0, 0, 0), time: 0 }, params, ctx(nodeId));
    let t = 0;
    let last = new THREE.Vector3();
    for (let i = 0; i < 300; i++) {
      t += 1 / 60;
      last = SPRING_VECTOR_NODE.evaluate({ target: new THREE.Vector3(5, -2, 1), time: t }, params, ctx(nodeId))
        .vector as THREE.Vector3;
    }
    expect(last.x).toBeCloseTo(5, 1);
    expect(last.y).toBeCloseTo(-2, 1);
    expect(last.z).toBeCloseTo(1, 1);
  });

  it("a target moving only in X does not perturb Y or Z", () => {
    const nodeId = "sv2";
    const params = { ...SPRING_VECTOR_NODE.defaultParams, smoothing: 0.4, bounciness: 0.5 };
    SPRING_VECTOR_NODE.evaluate({ target: new THREE.Vector3(0, 2, -3), time: 0 }, params, ctx(nodeId));
    const res = SPRING_VECTOR_NODE.evaluate({ target: new THREE.Vector3(10, 2, -3), time: 1 / 60 }, params, ctx(nodeId));
    const v = res.vector as THREE.Vector3;
    expect(v.y).toBeCloseTo(2, 6);
    expect(v.z).toBeCloseTo(-3, 6);
  });
});

describe("SPRING_VECTOR_NODE — Individual Points mode", () => {
  it("wiring Points springs each point independently toward its own target", () => {
    const nodeId = "svp1";
    const params = { ...SPRING_VECTOR_NODE.defaultParams, smoothing: 0.3, bounciness: 0.2 };
    const start = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)];
    SPRING_VECTOR_NODE.evaluate({ points: start, time: 0 }, params, ctx(nodeId));

    let t = 0;
    let last: THREE.Vector3[] = [];
    for (let i = 0; i < 300; i++) {
      t += 1 / 60;
      const res = SPRING_VECTOR_NODE.evaluate(
        { points: [new THREE.Vector3(5, 0, 0), new THREE.Vector3(-3, 0, 0)], time: t },
        params,
        ctx(nodeId),
      );
      last = res.points as THREE.Vector3[];
    }
    expect(last[0].x).toBeCloseTo(5, 1);
    expect(last[1].x).toBeCloseTo(-3, 1);
  });

  it("a masked-out point (mask 0) is held exactly at its target — no spring, no lag, no overshoot", () => {
    const nodeId = "svp2";
    const params = { ...SPRING_VECTOR_NODE.defaultParams, smoothing: 0.5, bounciness: 0.9 };
    const pts0 = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)];
    SPRING_VECTOR_NODE.evaluate({ points: pts0, mask: [1, 0], time: 0 }, params, ctx(nodeId));

    // point 0 is masked in (springs, will overshoot), point 1 is masked out
    // (must equal its target on every single frame, including transients).
    let t = 0;
    for (let i = 0; i < 10; i++) {
      t += 1 / 60;
      const res = SPRING_VECTOR_NODE.evaluate(
        { points: [new THREE.Vector3(5, 0, 0), new THREE.Vector3(5, 0, 0)], mask: [1, 0], time: t },
        params,
        ctx(nodeId),
      );
      const points = res.points as THREE.Vector3[];
      expect(points[1].x).toBeCloseTo(5, 6);
    }
  });

  it("rest of the object stays rigid: unmasked points never move even while masked-in ones bounce", () => {
    const nodeId = "svp3";
    const params = { ...SPRING_VECTOR_NODE.defaultParams, smoothing: 0.4, bounciness: 0.9 };
    const rigid = new THREE.Vector3(1, 2, 3);
    const pts0 = [new THREE.Vector3(0, 0, 0), rigid.clone()];
    SPRING_VECTOR_NODE.evaluate({ points: pts0, mask: [1, 0], time: 0 }, params, ctx(nodeId));

    let t = 0;
    let sawOvershoot = false;
    for (let i = 0; i < 60; i++) {
      t += 1 / 60;
      const res = SPRING_VECTOR_NODE.evaluate(
        { points: [new THREE.Vector3(10, 0, 0), rigid], mask: [1, 0], time: t },
        params,
        ctx(nodeId),
      );
      const points = res.points as THREE.Vector3[];
      expect(points[1]).toEqual(rigid);
      if (points[0].x > 10) sawOvershoot = true;
    }
    expect(sawOvershoot).toBe(true);
  });

  it("a point-count change reseeds every spring at its new target instead of throwing", () => {
    const nodeId = "svp4";
    const params = SPRING_VECTOR_NODE.defaultParams;
    SPRING_VECTOR_NODE.evaluate({ points: [new THREE.Vector3(0, 0, 0)], time: 0 }, params, ctx(nodeId));
    const res = SPRING_VECTOR_NODE.evaluate(
      { points: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(2, 2, 2), new THREE.Vector3(3, 3, 3)], time: 1 / 60 },
      params,
      ctx(nodeId),
    );
    const points = res.points as THREE.Vector3[];
    expect(points).toHaveLength(3);
    expect(points[2].x).toBeCloseTo(3, 4);
  });
});

describe("SPRING_VECTOR_NODE — the two-node shortcut: Geometry -> Points Selection -> Spring Vector -> Geometry", () => {
  it("no Mesh to Points / Points to Mesh needed: springs the selection, holds the rest rigid, preserves the object's pose", () => {
    // A mesh nested under a posed wrapper group — the OBJ Model shape this
    // whole feature exists to support.
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const wrapper = new THREE.Group();
    wrapper.matrixAutoUpdate = false;
    wrapper.matrix.setPosition(5, 0, -3);
    wrapper.add(mesh);

    const selNodeId = "psel-shortcut";
    const springNodeId = "spring-shortcut";
    const vertexCount = mesh.geometry.attributes.position.count;
    const selectedIndex = 0; // "the selection" — just one vertex, kept simple
    const params = { selectedIndices: [selectedIndex] };

    // Frame 0: seed.
    let sel = POINTS_SELECTION_NODE.evaluate({ geometry: wrapper }, params, { time: 0, step: 0, nodeId: selNodeId });
    let mask = sel.mask as number[];
    let points = sel.points as THREE.Vector3[];
    SPRING_VECTOR_NODE.evaluate(
      { points, mask, geometry: sel.geometry },
      { ...SPRING_VECTOR_NODE.defaultParams, smoothing: 0.3, bounciness: 0.2 },
      { time: 0, step: 0, nodeId: springNodeId },
    );

    // Move ONLY the selected vertex far away (simulating some upstream
    // animation of the source geometry) and step forward several frames.
    const originalX = mesh.geometry.attributes.position.getX(selectedIndex);
    const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute;
    posAttr.setX(selectedIndex, originalX + 20);
    posAttr.needsUpdate = true;

    let finalGeometry: THREE.Mesh | null = null;
    for (let i = 1; i <= 60; i++) {
      const t = i / 30;
      sel = POINTS_SELECTION_NODE.evaluate({ geometry: wrapper }, params, { time: t, step: i, nodeId: selNodeId });
      mask = sel.mask as number[];
      points = sel.points as THREE.Vector3[];
      const springRes = SPRING_VECTOR_NODE.evaluate(
        { points, mask, geometry: sel.geometry, time: t },
        { ...SPRING_VECTOR_NODE.defaultParams, smoothing: 0.3, bounciness: 0.2 },
        { time: t, step: i, nodeId: springNodeId },
      );
      finalGeometry = springRes.geometry as THREE.Mesh;
    }

    expect(finalGeometry).not.toBeNull();
    const outPos = finalGeometry!.geometry.attributes.position;

    // The selected vertex followed its moving target (settled near +20).
    expect(outPos.getX(selectedIndex)).toBeGreaterThan(10);

    // Every OTHER vertex stayed exactly where it started — untouched by
    // the spring, even though the selected one moved and bounced.
    for (let i = 0; i < vertexCount; i++) {
      if (i === selectedIndex) continue;
      expect(outPos.getX(i)).toBeCloseTo(posAttr.getX(i), 5);
      expect(outPos.getY(i)).toBeCloseTo(posAttr.getY(i), 5);
      expect(outPos.getZ(i)).toBeCloseTo(posAttr.getZ(i), 5);
    }

    // The object's real-world pose (from the posed wrapper group, not the
    // mesh's own identity local matrix) survived the whole round-trip.
    const worldPos = new THREE.Vector3().setFromMatrixPosition(finalGeometry!.matrix);
    expect(worldPos.x).toBeCloseTo(5);
    expect(worldPos.y).toBeCloseTo(0);
    expect(worldPos.z).toBeCloseTo(-3);
  });

  it("springs in WORLD space: a moving object drags the selection along with lag/overshoot, unselected vertices stay perfectly rigid with it", () => {
    // This is the exact real-world shape the shortcut exists for: the
    // object's vertex DATA never changes (a plain static box) — all the
    // motion comes from an upstream animation of the object's own
    // pose/matrix (a Wiggle feeding its Matrix input, say). Springing in the
    // mesh's local space (as an earlier version of this node did) has
    // nothing to react to there — a constant local point is a constant
    // target no matter how the object itself moves — which is exactly why
    // that version produced no visible effect at all.
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.matrixAutoUpdate = false;

    const selNodeId = "psel-worldspace";
    const springNodeId = "spring-worldspace";
    const selectedIndex = 0;
    const params = { selectedIndices: [selectedIndex] };

    function moveTo(x: number) {
      mesh.matrix.setPosition(x, 0, 0);
    }

    moveTo(0);
    let sel = POINTS_SELECTION_NODE.evaluate({ geometry: mesh }, params, { time: 0, step: 0, nodeId: selNodeId });
    SPRING_VECTOR_NODE.evaluate(
      { points: sel.points, mask: sel.mask, geometry: sel.geometry },
      { ...SPRING_VECTOR_NODE.defaultParams, smoothing: 0.3, bounciness: 0.5 },
      { time: 0, step: 0, nodeId: springNodeId },
    );

    // Snap the whole object's pose far away in one frame (a hard cut in its
    // driving animation) and hold it there.
    moveTo(20);

    let finalMesh: THREE.Mesh | null = null;
    let maxSelectedLocalX = -Infinity;
    for (let i = 1; i <= 90; i++) {
      const t = i / 30;
      sel = POINTS_SELECTION_NODE.evaluate({ geometry: mesh }, params, { time: t, step: i, nodeId: selNodeId });
      const res = SPRING_VECTOR_NODE.evaluate(
        { points: sel.points, mask: sel.mask, geometry: sel.geometry, time: t },
        { ...SPRING_VECTOR_NODE.defaultParams, smoothing: 0.3, bounciness: 0.5 },
        { time: t, step: i, nodeId: springNodeId },
      );
      finalMesh = res.geometry as THREE.Mesh;
      const localX = finalMesh.geometry.attributes.position.getX(selectedIndex);
      if (localX > maxSelectedLocalX) maxSelectedLocalX = localX;
    }

    expect(finalMesh).not.toBeNull();
    const outPos = finalMesh!.geometry.attributes.position;

    // The selected vertex's LOCAL position moved from its original ~-0.5 —
    // proof the spring actually reacted to the object's motion, which the
    // old local-space design structurally could not do.
    expect(Math.abs(outPos.getX(selectedIndex) - -0.5)).toBeGreaterThan(0.05);

    // Bounciness > 0 means it overshot at some point along the way (its
    // local X went more negative than -0.5, since the whole object jumped
    // +20 and the point briefly lagged, then overshot past its new resting
    // spot on the way back in).
    expect(maxSelectedLocalX).toBeGreaterThan(-0.5 + 1e-4);

    // Every unselected vertex is untouched — exactly its original local
    // position, unaffected by the object having moved at all.
    const vertexCount = mesh.geometry.attributes.position.count;
    for (let i = 0; i < vertexCount; i++) {
      if (i === selectedIndex) continue;
      expect(outPos.getX(i)).toBeCloseTo(mesh.geometry.attributes.position.getX(i), 4);
      expect(outPos.getY(i)).toBeCloseTo(mesh.geometry.attributes.position.getY(i), 4);
      expect(outPos.getZ(i)).toBeCloseTo(mesh.geometry.attributes.position.getZ(i), 4);
    }

    // And the object's actual pose (matrix) is still exactly where it was
    // moved to — unselected geometry rides along with it rigidly.
    const worldPos = new THREE.Vector3().setFromMatrixPosition(finalMesh!.matrix);
    expect(worldPos.x).toBeCloseTo(20);
  });
});
