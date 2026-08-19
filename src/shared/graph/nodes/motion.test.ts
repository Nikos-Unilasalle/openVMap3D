import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ORBIT_NODE, STAGGER_NODE, TIME_REMAP_NODE } from "./motion";
import { EvalContext } from "../types";

const CTX: EvalContext = { time: 0, step: 0, nodeId: "motion-test" };
/** A context standing in for a wired Time socket, so the clock fallback is off. */
const wired = (extra: Partial<EvalContext> = {}): EvalContext => ({
  ...CTX,
  connectedInputs: new Set(["time"]),
  ...extra,
});

describe("STAGGER_NODE", () => {
  const base = STAGGER_NODE.defaultParams;

  it("computes staggered progress, activity and delays", () => {
    const res = STAGGER_NODE.evaluate(
      { time: 0.25, count: 4, duration: 1, offset: 0.1, startAt: 0 },
      { ...base, ease: "linear" },
      wired(),
    );
    const progress = res.progress as number[];
    const active = res.active as number[];
    const delays = res.delays as number[];
    expect(progress).toHaveLength(4);
    delays.forEach((d, i) => expect(d).toBeCloseTo(i * 0.1));
    expect(progress[0]).toBeCloseTo(0.25);
    expect(progress[3]).toBe(0);
    expect(active[0]).toBe(1);
    expect(active[3]).toBe(0);

    const done = STAGGER_NODE.evaluate(
      { time: 1.5, count: 4, duration: 1, offset: 0.1 },
      { ...base, ease: "linear" },
      wired(),
    );
    expect((done.active as number[])[0]).toBe(0);
    expect((done.progress as number[])[0]).toBe(1);
  });

  it("maps progress onto a From/To range", () => {
    const res = STAGGER_NODE.evaluate(
      { time: 10, count: 3, duration: 1, offset: 0, from: 20, to: 0 },
      { ...base, ease: "linear" },
      wired(),
    );
    // Every item has finished, so each sits on `to`.
    expect(res.values).toEqual([0, 0, 0]);

    const midway = STAGGER_NODE.evaluate(
      { time: 0.5, count: 1, duration: 1, offset: 0, from: 20, to: 0 },
      { ...base, ease: "linear" },
      wired(),
    );
    expect((midway.values as number[])[0]).toBeCloseTo(10);
  });

  it("applies the easing to the value, not just the raw ramp", () => {
    const at = (ease: string) =>
      (STAGGER_NODE.evaluate(
        { time: 0.25, count: 1, duration: 1, offset: 0 },
        { ...base, ease },
        wired(),
      ).progress as number[])[0];
    expect(at("linear")).toBeCloseTo(0.25);
    // A smooth ease-in-out is behind a linear ramp at a quarter of the way.
    expect(at("smooth")).toBeLessThan(0.25);
  });

  it("derives the count from a wired list", () => {
    const res = STAGGER_NODE.evaluate({ time: 0, source: [1, 2, 3, 4, 5], count: 99 }, base, wired());
    expect(res.count).toBe(5);
    expect(res.values).toHaveLength(5);
  });

  it("derives the count from a wired geometry pack", () => {
    const pack = new THREE.Group();
    for (let i = 0; i < 3; i++) pack.add(new THREE.Mesh());
    const res = STAGGER_NODE.evaluate({ time: 0, source: pack, count: 99 }, base, wired());
    expect(res.count).toBe(3);
  });

  it("spaces the cascade to fit a total duration", () => {
    const res = STAGGER_NODE.evaluate(
      { time: 0, count: 5, duration: 1, total: 3 },
      { ...base, spacing: "total" },
      wired(),
    );
    const delays = res.delays as number[];
    // The last item must FINISH at `total`, so it starts at total - duration.
    expect(delays[0]).toBeCloseTo(0);
    expect(delays[4]).toBeCloseTo(2);
  });

  it("never spaces items backwards when the total is shorter than one item", () => {
    const res = STAGGER_NODE.evaluate(
      { time: 0, count: 4, duration: 5, total: 1 },
      { ...base, spacing: "total" },
      wired(),
    );
    expect((res.delays as number[]).every((d) => d >= 0)).toBe(true);
  });

  describe("order", () => {
    const ranksFor = (order: string, count = 5) => {
      const res = STAGGER_NODE.evaluate(
        { time: 0, count, duration: 1, offset: 1, startAt: 0 },
        { ...base, order },
        wired(),
      );
      return res.delays as number[];
    };

    it("runs forward by default", () => {
      expect(ranksFor("forward")).toEqual([0, 1, 2, 3, 4]);
    });

    it("reverses", () => {
      expect(ranksFor("reverse")).toEqual([4, 3, 2, 1, 0]);
    });

    it("starts at the centre and spreads outwards", () => {
      const d = ranksFor("center");
      expect(d[2]).toBe(0);
      expect(Math.max(...d)).toBe(4);
      // Dense ranks: every item gets its own slot, no gaps and no ties.
      expect([...d].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    });

    it("starts at the edges", () => {
      const d = ranksFor("edges");
      expect(d[2]).toBe(4);
      expect(Math.min(d[0], d[4])).toBe(0);
    });

    it("shuffles deterministically from the seed", () => {
      const run = (seed: number) =>
        STAGGER_NODE.evaluate(
          { time: 0, count: 8, duration: 1, offset: 1 },
          { ...base, order: "random", seed },
          wired(),
        ).delays as number[];
      expect(run(3)).toEqual(run(3));
      expect(run(3)).not.toEqual(run(4));
      // Still a permutation — every slot used exactly once.
      expect([...run(3)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });
  });

  it("falls back to the graph clock when Time is unwired", () => {
    // No connectedInputs entry for "time": the node must animate from ctx.time
    // rather than freezing on the socket's default of 0.
    const res = STAGGER_NODE.evaluate(
      { count: 1, duration: 1, offset: 0 },
      { ...base, ease: "linear" },
      { ...CTX, time: 0.5 },
    );
    expect((res.progress as number[])[0]).toBeCloseTo(0.5);
  });
});

describe("TIME_REMAP_NODE", () => {
  it("maps a range with easing and clamps outside it", () => {
    const linear = TIME_REMAP_NODE.evaluate(
      { time: 0.5, inStart: 0, inEnd: 1, outStart: 0, outEnd: 100 },
      { ...TIME_REMAP_NODE.defaultParams, ease: "linear" },
      wired(),
    );
    expect(linear.time).toBeCloseTo(50);

    expect(
      TIME_REMAP_NODE.evaluate({ time: -5 }, { ...TIME_REMAP_NODE.defaultParams, ease: "linear" }, wired()).time,
    ).toBe(0);
    expect(
      TIME_REMAP_NODE.evaluate({ time: 99 }, { ...TIME_REMAP_NODE.defaultParams, ease: "linear" }, wired()).time,
    ).toBe(1);

    const smooth = TIME_REMAP_NODE.evaluate({ time: 0.5 }, TIME_REMAP_NODE.defaultParams, wired());
    expect(smooth.time).toBeCloseTo(0.5);
  });

  it("loops when enabled", () => {
    const looped = TIME_REMAP_NODE.evaluate(
      { time: 1.5, inStart: 0, inEnd: 1, outStart: 0, outEnd: 100, loop: 1 },
      { ...TIME_REMAP_NODE.defaultParams, ease: "linear" },
      wired(),
    );
    expect(looped.time).toBeCloseTo(50);
  });
});

describe("ORBIT_NODE", () => {
  const base = ORBIT_NODE.defaultParams;
  const posOf = (res: Record<string, unknown>) => res.position as THREE.Vector3;

  it("starts on +X and circles the origin in the XZ plane", () => {
    const start = posOf(ORBIT_NODE.evaluate({ time: 0, radius: 5, speed: 90 }, base, wired()));
    expect(start.x).toBeCloseTo(5);
    expect(start.y).toBeCloseTo(0);
    expect(start.z).toBeCloseTo(0);

    // A quarter turn at 90°/s.
    const quarter = posOf(ORBIT_NODE.evaluate({ time: 1, radius: 5, speed: 90 }, base, wired()));
    expect(quarter.x).toBeCloseTo(0, 5);
    expect(quarter.z).toBeCloseTo(-5);
  });

  it("orbits around a target geometry's world position", () => {
    const target = new THREE.Mesh();
    target.position.set(10, 2, -3);
    target.updateMatrixWorld(true);
    const p = posOf(ORBIT_NODE.evaluate({ target, time: 0, radius: 4, speed: 0 }, base, wired()));
    expect(p.x).toBeCloseTo(14);
    expect(p.y).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(-3);
  });

  it("accepts a matrix as the target", () => {
    const m = new THREE.Matrix4().makeTranslation(0, 5, 0);
    const p = posOf(ORBIT_NODE.evaluate({ target: m, time: 0, radius: 2, speed: 0 }, base, wired()));
    expect(p.y).toBeCloseTo(5);
    expect(p.x).toBeCloseTo(2);
  });

  it("keeps a constant distance from the centre as it turns", () => {
    for (const t of [0, 0.3, 1.7, 4.2]) {
      const p = posOf(ORBIT_NODE.evaluate({ time: t, radius: 3, speed: 57 }, base, wired()));
      expect(p.length()).toBeCloseTo(3, 5);
    }
  });

  it("lifts the orbit along its axis with Height", () => {
    const p = posOf(ORBIT_NODE.evaluate({ time: 0, radius: 5, height: 8 }, base, wired()));
    expect(p.y).toBeCloseTo(8);
  });

  it("orbits the other planes on demand", () => {
    const onX = posOf(ORBIT_NODE.evaluate({ time: 0, radius: 5, speed: 0 }, { ...base, axis: "X" }, wired()));
    expect(onX.y).toBeCloseTo(5);
    expect(onX.x).toBeCloseTo(0);

    const onZ = posOf(ORBIT_NODE.evaluate({ time: 0, radius: 5, speed: 0 }, { ...base, axis: "Z" }, wired()));
    expect(onZ.x).toBeCloseTo(5);
    expect(onZ.z).toBeCloseTo(0);
  });

  it("tilts the orbit plane without moving its starting point", () => {
    const flat = posOf(ORBIT_NODE.evaluate({ time: 0, radius: 5, speed: 0 }, base, wired()));
    const tilted = posOf(
      ORBIT_NODE.evaluate({ time: 0, radius: 5, speed: 0 }, { ...base, tilt: 30 }, wired()),
    );
    expect(tilted.x).toBeCloseTo(flat.x);
    expect(tilted.y).toBeCloseTo(flat.y);

    // A quarter turn in *does* leave the flat plane once tilted.
    const quarterTilted = posOf(
      ORBIT_NODE.evaluate({ time: 1, radius: 5, speed: 90 }, { ...base, tilt: 30 }, wired()),
    );
    expect(Math.abs(quarterTilted.y)).toBeGreaterThan(0.1);
  });

  it("writes the orbit position into the matrix", () => {
    const res = ORBIT_NODE.evaluate({ time: 0, radius: 5, speed: 0 }, base, wired());
    const t = new THREE.Vector3().setFromMatrixPosition(res.matrix as THREE.Matrix4);
    expect(t.x).toBeCloseTo(5);
  });

  it("aims -Z at the centre when Face Target is on", () => {
    const res = ORBIT_NODE.evaluate(
      { time: 0, radius: 5, speed: 0 },
      { ...base, faceTarget: true },
      wired(),
    );
    const matrix = res.matrix as THREE.Matrix4;
    const position = posOf(res);
    const forward = new THREE.Vector3(0, 0, -1).applyMatrix4(
      new THREE.Matrix4().extractRotation(matrix),
    );
    // Standing at +X looking at the origin means looking down -X.
    expect(forward.x).toBeCloseTo(-1, 5);
    // And the matrix still carries the orbit position.
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(position)).toBeCloseTo(0);
  });

  it("falls back to the graph clock when Time is unwired", () => {
    const res = ORBIT_NODE.evaluate({ radius: 5, speed: 90 }, base, { ...CTX, time: 1 });
    expect(posOf(res).z).toBeCloseTo(-5);
  });
});
