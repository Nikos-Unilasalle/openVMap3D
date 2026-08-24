import { NodeDefinition } from "../types";

/**
 * Reads the graph's timeline markers ([[types.ts]]'s Marker, edited on the
 * timeline with 'm' / double-click-to-label) against the current time — the
 * After Effects "marker.nearestKey()" pattern (trigger-on-marker, fade over
 * marker duration), without threading the markers array through a wire.
 */
export const MARKER_NODE: NodeDefinition = {
  type: "time/marker",
  label: "Marker",
  category: "time",
  inputs: [],
  outputs: [
    { id: "index", label: "Index", type: "value" },
    { id: "time", label: "Time (s)", type: "value" },
    { id: "label", label: "Label", type: "text" },
    { id: "sinceMarker", label: "Since Marker (s)", type: "value" },
    { id: "duration", label: "Duration (s)", type: "value" },
    { id: "triggered", label: "Triggered", type: "value" },
  ],
  defaultParams: { label: "" },
  paramFields: [
    { id: "label", label: "Match Label (blank = any)", kind: "text" },
  ],
  evaluate: (_inputs, params, ctx) => {
    const fps = ctx.fps || 30;
    const filterLabel = String(params.label || "").trim();
    const markers = (ctx.markers || [])
      .filter((m) => !filterLabel || m.label === filterLabel)
      .slice()
      .sort((a, b) => a.frame - b.frame);

    if (markers.length === 0) {
      return { index: -1, time: 0, label: "", sinceMarker: 0, duration: 0, triggered: false };
    }

    const currentFrame = ctx.currentFrame ?? ctx.time * fps;

    let index = -1;
    for (let i = 0; i < markers.length; i++) {
      if (markers[i].frame <= currentFrame) index = i;
      else break;
    }

    if (index === -1) {
      const first = markers[0];
      return {
        index: -1,
        time: first.frame / fps,
        label: "",
        sinceMarker: 0,
        duration: first.frame / fps,
        triggered: 0,
      };
    }

    const marker = markers[index];
    const next = markers[index + 1];
    const markerTime = marker.frame / fps;
    const nextTime = next ? next.frame / fps : markerTime;

    return {
      index,
      time: markerTime,
      label: marker.label ?? "",
      sinceMarker: Math.max(0, ctx.time - markerTime),
      duration: next ? Math.max(0, nextTime - markerTime) : 0,
      triggered: currentFrame === marker.frame ? 1 : 0,
    };
  },
};
