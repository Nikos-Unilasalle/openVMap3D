import { describe, expect, it } from "vitest";
import { clipPixelRange } from "./audioWaveform";

describe("clipPixelRange", () => {
  // A 300-frame timeline drawn 600px wide: 2px per frame.
  const strip = { totalFrames: 300, width: 600 };

  it("lays the clip on the timeline's own frame axis, not across the whole strip", () => {
    // A 2-second track at 30fps is 60 frames — a fifth of a 300-frame timeline.
    const r = clipPixelRange(0, 2, 30, strip.totalFrames, strip.width);
    expect(r).toEqual({ x: 0, width: 120 });
  });

  it("offsets the clip by its start frame", () => {
    const r = clipPixelRange(90, 2, 30, strip.totalFrames, strip.width);
    expect(r!.x).toBe(180);
    expect(r!.width).toBe(120);
  });

  it("scales with the project frame rate", () => {
    // The same 2-second file covers twice as many frames at 60fps.
    const at30 = clipPixelRange(0, 2, 30, strip.totalFrames, strip.width)!;
    const at60 = clipPixelRange(0, 2, 60, strip.totalFrames, strip.width)!;
    expect(at60.width).toBeCloseTo(at30.width * 2);
  });

  it("lets a clip run off the end rather than squashing it to fit", () => {
    // 20 seconds at 30fps is 600 frames — twice the timeline.
    const r = clipPixelRange(0, 20, 30, strip.totalFrames, strip.width)!;
    expect(r.width).toBe(1200);
    expect(r.x).toBe(0);
  });

  it("still reports a clip that starts before frame 0", () => {
    const r = clipPixelRange(-30, 4, 30, strip.totalFrames, strip.width)!;
    expect(r.x).toBe(-60);
    expect(r.width).toBe(240);
  });

  it("returns null for a clip entirely off either end", () => {
    expect(clipPixelRange(400, 1, 30, strip.totalFrames, strip.width)).toBeNull();
    expect(clipPixelRange(-500, 1, 30, strip.totalFrames, strip.width)).toBeNull();
  });

  it("returns null when there is nothing to draw", () => {
    expect(clipPixelRange(0, 0, 30, 300, 600)).toBeNull();
    expect(clipPixelRange(0, 2, 0, 300, 600)).toBeNull();
    expect(clipPixelRange(0, 2, 30, 0, 600)).toBeNull();
    expect(clipPixelRange(0, 2, 30, 300, 0)).toBeNull();
    expect(clipPixelRange(0, NaN, 30, 300, 600)).toBeNull();
  });
});
