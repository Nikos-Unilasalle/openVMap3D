/**
 * A canvas switch asked for from inside the node tree (see CANVAS_GOTO_NODE
 * in canvas.ts), picked up by the editor after evaluation.
 *
 * Same shape as inspectorStore: a node's `evaluate` can't reach React state,
 * so it leaves the request in a module-level slot and the app collects it on
 * its own terms. Only one request is ever held — the latest wins. Two
 * viewports evaluating the same graph in the same window (Split View) both
 * run the node, but the rising-edge state behind it is itself per-node-id at
 * module scope, so the second evaluation sees no edge and asks for nothing.
 *
 * Requests are *asked for*, not applied: the editor clamps and validates the
 * index, and is free to ignore one entirely (the output window never
 * collects, it just follows whatever the editor broadcasts).
 */

let requested: number | null = null;

/** Ask for canvas `index` (0-based) to become the active one. */
export function requestCanvasSwitch(index: number): void {
  requested = index;
}

/** Takes the pending request, if any, and clears it — so one trigger switches once. */
export function consumeCanvasSwitchRequest(): number | null {
  const pending = requested;
  requested = null;
  return pending;
}
