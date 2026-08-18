/**
 * Which part of the UI the mouse is currently over, so window-level keyboard
 * shortcuts act on the right thing and don't "telescope" across zones.
 *
 * The classic bug: a node is selected in the canvas and keyframes are selected
 * in the timeline; pressing Delete with the cursor over the canvas deletes the
 * node *and* the keyframes, because both panels listen to the same global
 * keydown. Each panel registers its container (onMouseEnter/Leave) here, and
 * every shortcut handler checks `getInputZone()` before acting.
 */
export type InputZone = "graph" | "timeline" | "viewport" | "panel" | null;

let currentZone: InputZone = null;

export function setInputZone(zone: InputZone): void {
  currentZone = zone;
}

export function getInputZone(): InputZone {
  return currentZone;
}

/** True when the cursor is over a container that handles node-tree editing. */
export function isGraphZone(): boolean {
  return currentZone === "graph";
}

/** True when the cursor is over the timeline (drawer or bottom bar). */
export function isTimelineZone(): boolean {
  return currentZone === "timeline";
}
