import { describe, expect, it } from "vitest";
import { MARKER_NODE } from "./marker";
import { EvalContext } from "../types";

const markers = [
  { frame: 30, label: "Intro" },
  { frame: 90, label: "Drop" },
  { frame: 150 },
];

function ctx(overrides: Partial<EvalContext>): EvalContext {
  return { time: 0, step: 0, nodeId: "test", fps: 30, markers, ...overrides };
}

describe("MARKER_NODE", () => {
  it("reports no marker reached before the first one", () => {
    const res = MARKER_NODE.evaluate({}, { label: "" }, ctx({ time: 0, currentFrame: 0 }));
    expect(res.index).toBe(-1);
    expect(res.triggered).toBe(0);
  });

  it("resolves the nearest marker at/before current time, with duration to the next", () => {
    const res = MARKER_NODE.evaluate({}, { label: "" }, ctx({ time: 2, currentFrame: 60 }));
    expect(res.index).toBe(0);
    expect(res.label).toBe("Intro");
    expect(res.time).toBeCloseTo(1); // 30 frames / 30fps
    expect(res.sinceMarker).toBeCloseTo(1); // 2s - 1s
    expect(res.duration).toBeCloseTo(2); // (90-30)/30
  });

  it("flags triggered exactly on the marker's own frame", () => {
    const res = MARKER_NODE.evaluate({}, { label: "" }, ctx({ time: 1, currentFrame: 30 }));
    expect(res.triggered).toBe(1);
  });

  it("the last marker has zero duration (no next marker to bound it)", () => {
    const res = MARKER_NODE.evaluate({}, { label: "" }, ctx({ time: 6, currentFrame: 180 }));
    expect(res.index).toBe(2);
    expect(res.duration).toBe(0);
  });

  it("filters by label when Match Label is set", () => {
    const res = MARKER_NODE.evaluate({}, { label: "Drop" }, ctx({ time: 6, currentFrame: 180 }));
    expect(res.label).toBe("Drop");
    expect(res.index).toBe(0); // only one marker survives the filter
  });

  it("degrades gracefully with no markers on the graph", () => {
    const res = MARKER_NODE.evaluate({}, { label: "" }, ctx({ markers: [], currentFrame: 10 }));
    expect(res.index).toBe(-1);
    expect(res.time).toBe(0);
  });
});
