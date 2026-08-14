import { createNodeCache } from "./nodeCaches";

/** Parsed .xyz point-cloud data, cached per node id — same pattern as csvStore.ts. */
export interface XyzData {
  x: number[];
  y: number[];
  z: number[];
  /** null when the file carried no per-point color columns at all. */
  colors: [number, number, number][] | null;
}

const xyzCache = createNodeCache<XyzData>();

export function getXyz(nodeId: string): XyzData | undefined {
  return xyzCache.get(nodeId);
}

export function setXyz(nodeId: string, data: XyzData): void {
  xyzCache.set(nodeId, data);
}

/**
 * Classic ASCII .xyz point-cloud text: one point per line, whitespace- or
 * comma-separated "x y z" or "x y z r g b" (color as 0-255 or already
 * 0-1 — detected per file from whether any channel exceeds 1, since both
 * conventions show up in the wild depending on the exporter). Lines that
 * don't parse to at least 3 numbers — blank lines, "#" comments, a stray
 * point-count header some exporters prepend — are skipped rather than
 * failing the whole load, since one malformed line is common and shouldn't
 * cost the rest of the file.
 */
export function parseXyzText(content: string): XyzData {
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  const rawColors: [number, number, number][] = [];
  let hasColor = false;
  let maxChannel = 0;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Molecular-style XYZ (Blender's "Atomic Blender - XYZ" addon, most
    // chemistry tools) leads each line with an element symbol — "C 1.2 3.4
    // 5.6" rather than a bare coordinate. Drop a single non-numeric leading
    // token before reading x/y/z so both conventions parse the same way.
    const tokens = trimmed.split(/[\s,]+/);
    const coordTokens = Number.isFinite(Number(tokens[0])) ? tokens : tokens.slice(1);
    const fields = coordTokens.map(Number);
    if (fields.length < 3 || fields.slice(0, 3).some((n) => !Number.isFinite(n))) continue;

    x.push(fields[0]);
    y.push(fields[1]);
    z.push(fields[2]);

    if (fields.length >= 6 && fields.slice(3, 6).every((n) => Number.isFinite(n))) {
      hasColor = true;
      const [r, g, b] = fields.slice(3, 6);
      rawColors.push([r, g, b]);
      maxChannel = Math.max(maxChannel, r, g, b);
    } else {
      rawColors.push([1, 1, 1]);
    }
  }

  const normalize = maxChannel > 1;
  const colors: [number, number, number][] | null = hasColor
    ? rawColors.map(([r, g, b]) => (normalize ? [r / 255, g / 255, b / 255] : [r, g, b]))
    : null;

  return { x, y, z, colors };
}
