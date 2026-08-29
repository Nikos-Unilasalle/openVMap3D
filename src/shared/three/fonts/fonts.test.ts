import { describe, expect, it } from "vitest";
import { BUILTIN_FONTS, FONT_NAMES } from "./fonts";

describe("BUILTIN_FONTS", () => {
  it("parses every bundled font without throwing, each with real glyph data", () => {
    for (const name of FONT_NAMES) {
      const font = BUILTIN_FONTS[name];
      expect(font.data.glyphs, name).toBeTruthy();
      expect(Object.keys(font.data.glyphs).length, name).toBeGreaterThan(0);
    }
  });

  it("includes the fonts converted from Google Fonts TTFs", () => {
    for (const name of ["Doto", "Nova Mono", "Workbench"]) {
      expect(FONT_NAMES, name).toContain(name);
      expect(Object.keys(BUILTIN_FONTS[name].data.glyphs).length).toBeGreaterThan(50);
    }
  });
});
