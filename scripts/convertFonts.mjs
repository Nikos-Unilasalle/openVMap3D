// Converts Google Fonts TTF files to three.js FontLoader JSON (the format the
// Text node bundles). Run once per font set: place the .ttf files at the paths
// below, then `node scripts/convertFonts.mjs`. Output goes to
// src/shared/three/fonts/. The FontLoader accepts 'm'/'l'/'q'/'b' commands, so
// opentype.js M/L/Q/C map straight across (Z omitted — Shape auto-closes).
import opentype from "opentype.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FONTS = [
  { ttf: "/tmp/ttf/Abel-Regular.ttf", out: "abel.json", name: "Abel" },
  { ttf: "/tmp/ttf/Anton-Regular.ttf", out: "anton.json", name: "Anton" },
  { ttf: "/tmp/ttf/Bangers-Regular.ttf", out: "bangers.json", name: "Bangers" },
  { ttf: "/tmp/ttf/Cinzel.ttf", out: "cinzel.json", name: "Cinzel" },
  { ttf: "/tmp/ttf/Lobster-Regular.ttf", out: "lobster.json", name: "Lobster" },
  { ttf: "/tmp/ttf/Montserrat.ttf", out: "montserrat.json", name: "Montserrat" },
  { ttf: "/tmp/ttf/Oswald.ttf", out: "oswald.json", name: "Oswald" },
  { ttf: "/tmp/ttf/Pacifico-Regular.ttf", out: "pacifico.json", name: "Pacifico" },
  { ttf: "/tmp/ttf/Poppins-Regular.ttf", out: "poppins.json", name: "Poppins" },
  { ttf: "/tmp/ttf/Quicksand.ttf", out: "quicksand.json", name: "Quicksand" },
  { ttf: "/tmp/ttf/Raleway.ttf", out: "raleway.json", name: "Raleway" },
  { ttf: "/tmp/ttf/Doto-Regular.ttf", out: "doto.json", name: "Doto" },
  { ttf: "/tmp/ttf/NovaMono-Regular.ttf", out: "nova-mono.json", name: "Nova Mono" },
  { ttf: "/tmp/ttf/Workbench-Regular.ttf", out: "workbench.json", name: "Workbench" },
];

const round = (n) => Math.round(n * 100) / 100;

// Keep the bundle lean: printable ASCII + Latin-1 (covers French accents).
const isPrintable = (cp) => (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff);

function outline(font, char) {
  try {
    const path = font.getPath(char, 0, 0, font.unitsPerEm);
    const parts = [];
    // opentype.js getPath() uses SVG coordinates (y down); the three.js Font
    // format uses y up (like the bundled helvetiker) — so negate every y.
    const neg = (n) => round(-n);
    for (const cmd of path.commands) {
      if (cmd.type === "M") parts.push(`m ${round(cmd.x)} ${neg(cmd.y)}`);
      else if (cmd.type === "L") parts.push(`l ${round(cmd.x)} ${neg(cmd.y)}`);
      else if (cmd.type === "Q") parts.push(`q ${round(cmd.x)} ${neg(cmd.y)} ${round(cmd.x1)} ${neg(cmd.y1)}`);
      else if (cmd.type === "C") parts.push(`b ${round(cmd.x)} ${neg(cmd.y)} ${round(cmd.x1)} ${neg(cmd.y1)} ${round(cmd.x2)} ${neg(cmd.y2)}`);
    }
    return parts.join(" ");
  } catch {
    return "";
  }
}

const outDir = join(__dirname, "../src/shared/three/fonts");
mkdirSync(outDir, { recursive: true });

let total = 0;
for (const { ttf, out, name } of FONTS) {
  const buffer = readFileSync(ttf);
  const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  const glyphs = {};
  for (const glyph of Object.values(font.glyphs.glyphs)) {
    const unicode = glyph.unicode ?? (Array.isArray(glyph.unicodes) ? glyph.unicodes[0] : null);
    if (unicode === undefined || unicode === null || !isPrintable(unicode)) continue;
    const char = String.fromCodePoint(unicode);
    if (char.length !== 1) continue;
    glyphs[char] = {
      x_min: Math.round(glyph.xMin),
      x_max: Math.round(glyph.xMax),
      ha: Math.round(glyph.advanceWidth),
      o: outline(font, char),
    };
  }
  const data = {
    familyName: name,
    cssFontWeight: "normal",
    cssFontStyle: "normal",
    resolution: font.unitsPerEm,
    ascender: Math.round(font.ascender),
    descender: Math.round(font.descender),
    lineHeight: Math.round(font.ascender - font.descender),
    underlineThickness: 50,
    underlinePosition: -100,
    boundingBox: {
      yMin: Math.round(font.descender),
      xMin: -50,
      yMax: Math.round(font.ascender),
      xMax: 1000,
    },
    glyphs,
  };
  const json = JSON.stringify(data);
  writeFileSync(join(outDir, out), json);
  total += json.length;
  console.log(`${out}: ${(json.length / 1024).toFixed(0)}KB, ${Object.keys(glyphs).length} glyphs`);
}
console.log(`total: ${(total / 1024 / 1024).toFixed(2)}MB`);
