import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { Graph } from "./graph/types";

export interface MonitorInfo {
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  isPrimary: boolean;
}

export async function listMonitors(): Promise<MonitorInfo[]> {
  return invoke<MonitorInfo[]>("list_monitors");
}

export async function openOutputWindow(monitor: MonitorInfo, fullscreen: boolean): Promise<void> {
  await invoke("open_output_window", {
    monitorX: monitor.x,
    monitorY: monitor.y,
    monitorWidth: monitor.width,
    monitorHeight: monitor.height,
    fullscreen,
  });
}

export async function closeOutputWindow(): Promise<void> {
  await invoke("close_output_window");
}

const GRAPH_UPDATE_EVENT = "graph:update";
const OUTPUT_READY_EVENT = "output:ready";
const OUTPUT_CLOSED_EVENT = "output:closed";

export interface GraphPayload {
  graph: Graph;
  /**
   * The epoch clock.ts's Time node counts steps from — generated once per
   * app session (not re-stamped per edit, unlike OpenVMap 2D's physics
   * epoch: there's no discontinuous "world" to restart here, just a
   * continuous animation phase both windows should agree on). Included in
   * every broadcast so a late-opened output window's Viewport starts in
   * phase with the main window instead of its own Date.now() at mount.
   */
  epochMs: number;
  /** The node currently being calibrated in the main editor (Camera node selected), or null. Lets the output window know whose calibration handles to draw over the projection — alignment is judged against the real room in the actual projected light, not in the editor preview. */
  calibratingNodeId: string | null;
}

/**
 * Call once from the main window. Broadcasts the graph (+ shared clock
 * epoch) to the output window whenever it changes — not per frame; each
 * window's own render loop derives per-frame animation state locally from
 * the shared epoch (see clock.ts), so this is structural-change-only IPC,
 * same "zero per-frame IPC" contract as OpenVMap 2D's physicsClock.
 */
export function startBroadcasting(getPayload: () => GraphPayload): () => void {
  const readyPromise = listen(OUTPUT_READY_EVENT, () => {
    void emit(GRAPH_UPDATE_EVENT, getPayload());
  });
  return () => {
    void readyPromise.then((unlisten) => unlisten());
  };
}

export function broadcastGraph(payload: GraphPayload): void {
  void emit(GRAPH_UPDATE_EVENT, payload);
}

/** Call once from the output window. Applies whatever the main window broadcasts, and handshakes for the current state on mount. */
export function startReceiving(onUpdate: (payload: GraphPayload) => void): () => void {
  const listenPromise = listen<GraphPayload>(GRAPH_UPDATE_EVENT, (event) => onUpdate(event.payload));
  void emit(OUTPUT_READY_EVENT);
  return () => {
    void listenPromise.then((unlisten) => unlisten());
  };
}

/** Call once from the output window, on unmount — lets the main window's "is the output open" UI state track an OS-level close (red X), not just its own close button. Best-effort: a hard process kill won't fire this. */
export function notifyOutputClosed(): void {
  void emit(OUTPUT_CLOSED_EVENT);
}

export function onOutputClosed(callback: () => void): () => void {
  const listenPromise = listen(OUTPUT_CLOSED_EVENT, callback);
  return () => {
    void listenPromise.then((unlisten) => unlisten());
  };
}
