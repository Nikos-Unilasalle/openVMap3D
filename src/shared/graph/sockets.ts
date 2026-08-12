import * as THREE from "three";

/**
 * The type system BIBLE.md settled on: seven socket kinds, no dedicated
 * Trigger/pulse type — a rising-edge-detector node turns a continuous
 * boolean into a discrete "just happened" event where that distinction
 * actually matters, instead of the graph needing a second primitive for it.
 *
 * Built directly on three.js's own math/scene classes (Vector3, Matrix4,
 * Color, Object3D, Texture) rather than parallel value types — this engine
 * exists to feed a three.js renderer, so there is no independent math layer
 * to keep in sync with it.
 */
export type SocketType =
  | "value"
  | "vector"
  | "matrix"
  | "color"
  | "geometry"
  | "texture"
  | "list"
  | "text"
  | "any";

/** The runtime value a socket of each type actually carries during evaluation. */
export interface SocketValueMap {
  /** Also carries booleans (0/1) — no separate boolean socket type, see BIBLE.md. */
  value: number;
  vector: THREE.Vector3;
  matrix: THREE.Matrix4;
  color: THREE.Color;
  geometry: THREE.Object3D;
  texture: THREE.Texture;
  list: unknown[];
  text: string;
  any: unknown;
}

export type SocketValue<T extends SocketType = SocketType> = SocketValueMap[T];

export interface SocketDef {
  id: string;
  label: string;
  type: SocketType;
}

/**
 * One color per socket type, shared by node handles and the wires between
 * them — a wire is always the color of the type flowing through it, so a
 * mismatched drag reads as wrong before the connection is even attempted.
 */
export const SOCKET_COLOR: Record<SocketType, string> = {
  value: "#f2c14e",
  vector: "#38bdf8",
  matrix: "#a855f7",
  color: "#ec4899",
  geometry: "#22c55e",
  texture: "#2dd4bf",
  list: "#94a3b8",
  text: "#f97316",
  any: "#e2e8f0",
};

/** Booleans travel as 0/1 on a `value` socket — see the module doc above. */
export function toBoolean(v: unknown): boolean {
  return typeof v === "number" && v !== 0;
}

export function fromBoolean(b: boolean): number {
  return b ? 1 : 0;
}
