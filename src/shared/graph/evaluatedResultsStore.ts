import { EvalResult } from "./evaluate";

/**
 * The per-frame evaluation results, published outside React.
 *
 * Every viewport tick used to call `setEvaluatedResults(results)` — a fresh
 * Map, unconditionally, even when paused — which re-rendered the whole
 * MainEditor tree (TopBar, GraphEditor, Timeline, both panes) at frame rate.
 * The consumers that actually read these values are few and leaf-shaped (the
 * param panel, the viewport HUD, the timeline), so the results now live in
 * this module store and those leaves subscribe via `useSyncExternalStore`.
 * Callbacks that only need the latest map at event time read
 * `getEvaluatedResultsSnapshot()` imperatively.
 *
 * Several viewports publish per frame (editor pane + split preview + the
 * output window); the last publisher of the frame wins, exactly as the old
 * last-`setState`-wins behaviour did.
 */

let snapshot: EvalResult | null = null;
const listeners = new Set<() => void>();

export function publishEvaluatedResults(results: EvalResult): void {
  snapshot = results;
  for (const listener of listeners) listener();
}

export function subscribeEvaluatedResults(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The latest frame's results, or null before the first evaluation. Stable reference between publishes. */
export function getEvaluatedResultsSnapshot(): EvalResult | null {
  return snapshot;
}
