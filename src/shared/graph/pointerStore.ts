/**
 * Where the mouse is, in the coordinate space of whichever viewport it is
 * over, together with the camera that viewport is actually rendering from.
 *
 * The Mouse node cannot work this out on its own. `EvalContext` gives it a
 * renderer and an `activeCameraPose`, but the pose is resolved from the
 * graph's *Camera nodes* — it is null in the common case of a graph with no
 * Camera node, where the pane is being flown by the editor's own orbit
 * camera. A node reading only the context therefore had a pointer position
 * but nothing to unproject it with, which is exactly the "3D estimate stays
 * at 0,0,0" symptom. The viewport is the only thing that knows both its
 * canvas and its live camera, so it publishes them here (mirrors
 * inputZoneStore: a small module the panes register with, read by whoever
 * needs the answer).
 *
 * Several viewports can be registered at once (editor pane, split preview,
 * the output window). The read picks the one the pointer is inside, so the
 * node follows the pane being pointed at rather than an arbitrary one.
 */
import * as THREE from "three";

interface PointerViewport {
  element: HTMLElement;
  /** A getter, not the camera itself — the viewport swaps its camera object when toggling ortho/perspective. */
  getCamera: () => THREE.Camera;
}

const viewports: PointerViewport[] = [];

let clientX = 0;
let clientY = 0;
let seen = false;

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointermove",
    (e) => {
      clientX = e.clientX;
      clientY = e.clientY;
      seen = true;
    },
    { passive: true },
  );
}

/** Registers a viewport as a pointer target. Returns the unregister function. */
export function registerPointerViewport(viewport: PointerViewport): () => void {
  viewports.push(viewport);
  return () => {
    const i = viewports.indexOf(viewport);
    if (i >= 0) viewports.splice(i, 1);
  };
}

export interface PointerSample {
  /** Pixels from the viewport's top-left corner. */
  x: number;
  y: number;
  /** Normalized device coordinates, -1..1, y up. */
  ndcX: number;
  ndcY: number;
  /** False while the pointer is over some other part of the UI (the coordinates then describe where it last was, extrapolated). */
  inside: boolean;
  width: number;
  height: number;
  camera: THREE.Camera;
}

function sampleOf(viewport: PointerViewport, rect: DOMRect): PointerSample {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return {
    x,
    y,
    ndcX: (x / rect.width) * 2 - 1,
    ndcY: -(y / rect.height) * 2 + 1,
    inside: x >= 0 && x <= rect.width && y >= 0 && y <= rect.height,
    width: rect.width,
    height: rect.height,
    camera: viewport.getCamera(),
  };
}

/**
 * The pointer against the viewport it is over, or against the first laid-out
 * viewport when it is elsewhere. Null before the first pointer event, or when
 * no viewport is registered (tests, a headless evaluate call).
 */
export function readViewportPointer(): PointerSample | null {
  if (!seen) return null;
  let fallback: PointerSample | null = null;
  for (const viewport of viewports) {
    const rect = viewport.element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const sample = sampleOf(viewport, rect);
    if (sample.inside) return sample;
    if (!fallback) fallback = sample;
  }
  return fallback;
}

/** Test seam — feeds a pointer position without a real pointer event. */
export function simulatePointerMove(x: number, y: number): void {
  clientX = x;
  clientY = y;
  seen = true;
}
