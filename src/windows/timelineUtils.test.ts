import { describe, expect, it } from "vitest";
import { KeyframeStore } from "../shared/graph/types";
import {
  copyKeyframesToClipboard,
  formatParamValue,
  formatTimecode,
  getClipboardKeyframes,
  makeKeyframeId,
  parseKeyframeId,
} from "./timelineUtils";

describe("timelineUtils", () => {
  it("makes and parses keyframe IDs reliably", () => {
    const id = makeKeyframeId("node1", "position.x", 42);
    expect(id).toBe("node1::position.x::42");

    const parsed = parseKeyframeId(id);
    expect(parsed).toEqual({
      nodeId: "node1",
      paramKey: "position.x",
      frame: 42,
    });

    expect(parseKeyframeId("invalid")).toBeNull();
    expect(parseKeyframeId("node1::position.x::invalid_num")).toBeNull();
  });

  it("formats timecode for 30fps and 60fps correctly", () => {
    expect(formatTimecode(0, 30)).toBe("00:00:00");
    expect(formatTimecode(45, 30)).toBe("00:01:15");
    expect(formatTimecode(1800, 30)).toBe("01:00:00");
  });

  it("formats parameter values cleanly", () => {
    expect(formatParamValue(undefined)).toBe("-");
    expect(formatParamValue(42)).toBe("42");
    expect(formatParamValue(3.14159)).toBe("3.14");
    expect(formatParamValue(true)).toBe("true");
    expect(formatParamValue({ x: 10, y: 20.5, z: 0 })).toBe("(10, 20.5, 0)");
  });

  it("copies selected keyframes to clipboard buffer with relative offsets", () => {
    const sampleStore: KeyframeStore = {
      nodeA: {
        x: [
          { frame: 10, value: 100, easeIn: "smooth" },
          { frame: 25, value: 200, easeIn: "linear" },
        ],
      },
    };

    const success = copyKeyframesToClipboard(
      [
        { nodeId: "nodeA", paramKey: "x", frame: 10 },
        { nodeId: "nodeA", paramKey: "x", frame: 25 },
      ],
      sampleStore,
    );

    expect(success).toBe(true);
    const clip = getClipboardKeyframes();
    expect(clip).toBeDefined();
    expect(clip?.baseFrame).toBe(10);
    expect(clip?.items.length).toBe(2);
    expect(clip?.items[0].relativeFrame).toBe(0);
    expect(clip?.items[1].relativeFrame).toBe(15);
    expect(clip?.items[1].value).toBe(200);
    expect(clip?.items[1].easeIn).toBe("linear");
  });
});
