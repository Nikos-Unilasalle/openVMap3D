import { describe, expect, it } from "vitest";
import { getInputZone, isGraphZone, isTimelineZone, setInputZone } from "./inputZoneStore";

describe("inputZoneStore", () => {
  it("defaults to no zone", () => {
    setInputZone(null);
    expect(getInputZone()).toBeNull();
    expect(isGraphZone()).toBe(false);
    expect(isTimelineZone()).toBe(false);
  });

  it("tracks the graph zone and reports it", () => {
    setInputZone("graph");
    expect(getInputZone()).toBe("graph");
    expect(isGraphZone()).toBe(true);
    expect(isTimelineZone()).toBe(false);
  });

  it("tracks the timeline zone and reports it", () => {
    setInputZone("timeline");
    expect(getInputZone()).toBe("timeline");
    expect(isTimelineZone()).toBe(true);
    expect(isGraphZone()).toBe(false);
  });
});
