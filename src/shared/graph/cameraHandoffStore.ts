/**
 * A camera hand-off asked for from inside the node tree, collected by the
 * editor after evaluation — same shape as canvasSwitchStore and, before it,
 * inspectorStore: `evaluate` cannot reach React state, so it leaves the
 * request in a module slot and the app picks it up on its own terms.
 *
 * Used by Fly To's "Auto Switch Active Cam": when a flight lands, the node
 * it flew *to* becomes the active camera. Without it the Fly To node simply
 * stopped claiming control and the viewport fell back to the first active
 * Camera node — which is the one the flight started from, so the view
 * snapped straight back to where it came from the instant it arrived.
 *
 * Only one request is ever held; the latest wins. The node asks once per
 * landing (it remembers having done so), so this is not a per-frame write.
 */

let requested: string | null = null;

/** Ask for `nodeId` to become the active camera. */
export function requestCameraHandoff(nodeId: string): void {
  requested = nodeId;
}

/** Takes the pending request, if any, and clears it. */
export function consumeCameraHandoffRequest(): string | null {
  const pending = requested;
  requested = null;
  return pending;
}
