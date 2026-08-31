/**
 * What dragging a keyframe selection does to it.
 *
 * "move" slides the selection, every key keeping its distance from the others.
 * "scale" works on the spacing *between* them instead, around the playhead —
 * drag away from it and the selection spreads, drag toward it and it packs in,
 * the same gesture Blender's dope sheet gives S. Retiming a section is
 * otherwise a keyframe-by-keyframe job.
 */
export type TimelineDragMode = "move" | "scale";

export interface DragTransform {
  mode: TimelineDragMode;
  /** move: frames slid. */
  delta: number;
  /** scale: multiplier on each key's distance from the pivot. */
  factor: number;
  /** scale: the frame everything is scaled about — the playhead. */
  pivot: number;
}

export const IDENTITY_DRAG: DragTransform = { mode: "move", delta: 0, factor: 1, pivot: 0 };

/**
 * The lever arm below which scaling is refused.
 *
 * The factor is "how far the mouse is from the pivot" over "how far the grab
 * started from it", so grabbing a key sitting on the playhead divides by
 * nothing: the smallest twitch would blow the selection across the timeline.
 * Under a frame of separation there is no usable lever, so the drag holds at
 * 1 until the pointer has somewhere to lever from.
 */
const MIN_LEVER_FRAMES = 1;

/** Reads the pointer's position into the transform the drag is applying. */
export function buildDragTransform(
  mode: TimelineDragMode,
  startFrame: number,
  pointerFrame: number,
  pivot: number,
): DragTransform {
  if (mode === "move") {
    return { mode, delta: pointerFrame - startFrame, factor: 1, pivot };
  }
  const lever = startFrame - pivot;
  if (Math.abs(lever) < MIN_LEVER_FRAMES) {
    return { mode, delta: 0, factor: 1, pivot };
  }
  return { mode, delta: 0, factor: (pointerFrame - pivot) / lever, pivot };
}

/**
 * Where a key ends up under a drag. Rounded, since keyframes live on whole
 * frames — a scale can land two keys on the same one, which is the same
 * collapse a move onto an occupied frame already allows.
 */
export function applyDragTransform(frame: number, t: DragTransform): number {
  if (t.mode === "move") return frame + t.delta;
  return Math.round(t.pivot + (frame - t.pivot) * t.factor);
}

/** True when the drag would leave every key exactly where it is. */
export function isNoOpDrag(t: DragTransform): boolean {
  return t.mode === "move" ? t.delta === 0 : t.factor === 1;
}

/** What the drag readout shows next to the pointer. */
export function formatDragTransform(t: DragTransform): string {
  if (t.mode === "move") return `${t.delta > 0 ? "+" : ""}${t.delta}`;
  return `×${t.factor.toFixed(2)}`;
}
