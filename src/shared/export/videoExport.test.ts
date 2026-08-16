import { describe, expect, test } from "vitest";
import { mimeToExtension } from "./videoExport";

describe("mimeToExtension", () => {
  test("mp4 mime types get a .mp4 extension", () => {
    expect(mimeToExtension("video/mp4;codecs=avc1")).toBe("mp4");
    expect(mimeToExtension("video/mp4")).toBe("mp4");
  });

  test("anything else (webm, empty) gets .webm — the universal fallback", () => {
    expect(mimeToExtension("video/webm;codecs=vp9")).toBe("webm");
    expect(mimeToExtension("")).toBe("webm");
  });
});
