import * as THREE from "three";

export interface Hsv {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

const FALLBACK_HEX = "#ffffff";

export function parseColorToHex(v: unknown): string {
  if (!v) return FALLBACK_HEX;
  try {
    if (v instanceof THREE.Color) {
      return `#${v.getHexString()}`;
    }
    if (typeof v === "object" && v !== null && "r" in v && "g" in v && "b" in v) {
      const { r, g, b } = v as { r: number; g: number; b: number };
      return `#${new THREE.Color(r, g, b).getHexString()}`;
    }
    if (typeof v === "string") {
      const clean = v.trim();
      const hex = clean.startsWith("#") ? clean : `#${clean}`;
      return `#${new THREE.Color(hex).getHexString()}`;
    }
    if (typeof v === "number") {
      return `#${new THREE.Color(v).getHexString()}`;
    }
  } catch {
    return FALLBACK_HEX;
  }
  return FALLBACK_HEX;
}

export function isValidHex(hex: string): boolean {
  const clean = hex.trim().replace(/^#/, "");
  return /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean);
}

export function normalizeHex(hex: string): string {
  const clean = hex.trim().replace(/^#/, "").toLowerCase();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  return `#${full}`;
}

export function hexToHsv(hex: string): Hsv {
  const normalized = normalizeHex(hex);
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;

  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  const sector = Math.floor(h / 60) % 6;
  const rgb: [number, number, number] =
    sector === 0 ? [c, x, 0] :
    sector === 1 ? [x, c, 0] :
    sector === 2 ? [0, c, x] :
    sector === 3 ? [0, x, c] :
    sector === 4 ? [x, 0, c] :
    [c, 0, x];

  const toByte = (channel: number) => Math.round((channel + m) * 255).toString(16).padStart(2, "0");
  return `#${toByte(rgb[0])}${toByte(rgb[1])}${toByte(rgb[2])}`;
}

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
