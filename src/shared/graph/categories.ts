/** BIBLE.md's base node catalog sections — one color per category, shown on the node header, the param panel, and the palette alike. */
export type NodeCategory =
  | "structure"
  | "transform"
  | "math"
  | "converter"
  | "text"
  | "list"
  | "sound"
  | "time"
  | "logic"
  | "io"
  | "physics"
  | "particles"
  | "post"
  | "calibration";

/** Palette/section display order — matches BIBLE.md's catalog order. */
export const CATEGORY_ORDER: NodeCategory[] = [
  "structure",
  "transform",
  "math",
  "converter",
  "text",
  "list",
  "sound",
  "time",
  "logic",
  "io",
  "physics",
  "particles",
  "post",
  "calibration",
];

export const CATEGORY_LABEL: Record<NodeCategory, string> = {
  structure: "Structure",
  transform: "Transform",
  math: "Math",
  converter: "Converter",
  text: "Text",
  list: "List",
  sound: "Sound / Audio",
  time: "Time / Animation",
  logic: "Logic",
  io: "I/O",
  physics: "Physics",
  particles: "Particles",
  post: "Post-render 2D",
  calibration: "Calibration",
};

/**
 * Extends OpenVMap's existing panel-tone convention (physics=green,
 * transform=purple, motion=pink, shape=cyan — see BIBLE.md's Visual
 * Identity section) to the rest of the catalog rather than inventing a
 * fresh palette from scratch.
 */
export const CATEGORY_COLOR: Record<NodeCategory, string> = {
  structure: "#38bdf8",
  transform: "#a855f7",
  math: "#f2c14e",
  converter: "#10b981",
  text: "#f97316",
  list: "#8b5cf6",
  sound: "#06b6d4",
  time: "#ec4899",
  logic: "#fb923c",
  io: "#6366f1",
  physics: "#22c55e",
  particles: "#2dd4bf",
  post: "#f43f5e",
  calibration: "#94a3b8",
};

export const UNKNOWN_CATEGORY_COLOR = "#6b7280";
