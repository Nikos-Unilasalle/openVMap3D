/** BIBLE.md's base node catalog sections — one color per category, shown on the node header, the param panel, and the palette alike. */
export type NodeCategory =
  | "calibration"
  | "compose"
  | "converter"
  | "curve"
  | "instance"
  | "io"
  | "lighting"
  | "list"
  | "logic"
  | "math"
  | "object"
  | "particles"
  | "physics"
  | "post"
  | "postprocess"
  | "sound"
  | "structure"
  | "text"
  | "texture"
  | "time"
  | "transform";

/** Palette/section display order — alphabetically sorted. */
export const CATEGORY_ORDER: NodeCategory[] = [
  "calibration",
  "compose",
  "converter",
  "curve",
  "instance",
  "io",
  "lighting",
  "list",
  "logic",
  "math",
  "object",
  "particles",
  "physics",
  "postprocess",
  "post",
  "sound",
  "structure",
  "text",
  "texture",
  "time",
  "transform",
];

export const CATEGORY_LABEL: Record<NodeCategory, string> = {
  calibration: "Calibration",
  compose: "Compose",
  converter: "Converter",
  curve: "Curve / Path",
  instance: "Instance",
  io: "I/O",
  lighting: "Lighting & Shadows",
  list: "List",
  logic: "Logic",
  math: "Math",
  object: "Object",
  particles: "Particles",
  physics: "Physics",
  postprocess: "Post-Process & FX",
  post: "Post-render 2D",
  sound: "Sound / Audio",
  structure: "Structure",
  text: "Text",
  texture: "Texture",
  time: "Time / Animation",
  transform: "Transform",
};

/**
 * Extends OpenVMap's existing panel-tone convention to the catalog.
 */
export const CATEGORY_COLOR: Record<NodeCategory, string> = {
  calibration: "#94a3b8",
  compose: "#0ea5e9",
  converter: "#10b981",
  curve: "#84cc16",
  instance: "#14b8a6",
  io: "#6366f1",
  lighting: "#f59e0b",
  list: "#8b5cf6",
  logic: "#fb923c",
  math: "#f2c14e",
  object: "#0284c7",
  particles: "#2dd4bf",
  physics: "#22c55e",
  postprocess: "#c084fc",
  post: "#f43f5e",
  sound: "#06b6d4",
  structure: "#38bdf8",
  text: "#f97316",
  texture: "#2dd4bf",
  time: "#ec4899",
  transform: "#a855f7",
};

export const UNKNOWN_CATEGORY_COLOR = "#6b7280";
