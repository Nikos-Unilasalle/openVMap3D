/**
 * The maths behind the motion graph, kept out of the component so it can be
 * tested without a DOM: channel extraction, the value<->pixel mapping, axis
 * ticks, curve sampling and the bezier-handle round trip.
 *
 * The graph draws in *value space* and the component only ever deals in
 * screen pixels through `ValueAxis`, so nothing here needs to know how tall
 * the panel is until it is asked.
 */

import { computeSegmentEasing, resolveSegmentEasing } from "../shared/graph/evaluate";
import { Graph, Keyframe, NodeRegistry } from "../shared/graph/types";

/** One editable curve: a single node parameter's keyframe track. */
export interface Channel {
  /** `nodeId::paramKey` — stable across renders, used as the React key. */
  id: string;
  nodeId: string;
  paramKey: string;
  /** What the channel list shows. Prefixed with the node when several nodes are open. */
  label: string;
  color: string;
  keys: Keyframe[];
  /** Value range of this channel's keys, used by Normalize and by Fit. */
  min: number;
  max: number;
}

/**
 * Vector and colour parameters are already stored as separate scalar tracks
 * (`location.x`, `location.y`, …) by the keyframe evaluator, so the graph gets
 * component channels for free — it only has to colour them like the axes they
 * are, the way Blender's F-Curve list does.
 */
const COMPONENT_COLORS: Record<string, string> = {
  x: "#f87171",
  y: "#a3e635",
  z: "#60a5fa",
  r: "#f87171",
  g: "#a3e635",
  b: "#60a5fa",
  w: "#c084fc",
};

/** A stable, well-spread hue for a track that isn't a vector component. */
export function channelColor(paramKey: string): string {
  const dot = paramKey.lastIndexOf(".");
  if (dot >= 0) {
    const suffix = paramKey.slice(dot + 1).toLowerCase();
    const known = COMPONENT_COLORS[suffix];
    if (known) return known;
  }
  let hash = 0;
  for (let i = 0; i < paramKey.length; i++) {
    hash = (hash * 31 + paramKey.charCodeAt(i)) | 0;
  }
  // Golden-angle stride keeps successive params visually far apart.
  const hue = Math.abs(hash * 137.508) % 360;
  return `hsl(${hue.toFixed(0)}, 70%, 62%)`;
}

function isNumericTrack(list: Keyframe[]): boolean {
  return list.length > 0 && list.every((k) => Number.isFinite(Number(k.value)));
}

/**
 * The numeric tracks of the given nodes, sorted by frame. Non-numeric
 * keyframes (text, booleans stored as strings, whole objects) have no place on
 * a value axis and are dropped rather than drawn at zero.
 */
export function buildChannels(graph: Graph, nodeIds: string[], registry?: NodeRegistry): Channel[] {
  const channels: Channel[] = [];
  const showNodePrefix = nodeIds.length > 1;

  for (const nodeId of nodeIds) {
    const nodeKeys = graph.keyframes?.[nodeId];
    if (!nodeKeys) continue;
    const instance = graph.nodes.find((n) => n.id === nodeId);
    const nodeLabel = (instance && registry?.get(instance.type)?.label) || instance?.type || nodeId;

    for (const paramKey of Object.keys(nodeKeys).sort()) {
      const list = nodeKeys[paramKey];
      if (!isNumericTrack(list)) continue;
      const keys = [...list].sort((a, b) => a.frame - b.frame);
      let min = Infinity;
      let max = -Infinity;
      for (const k of keys) {
        const v = Number(k.value);
        if (v < min) min = v;
        if (v > max) max = v;
      }
      channels.push({
        id: `${nodeId}::${paramKey}`,
        nodeId,
        paramKey,
        label: showNodePrefix ? `${nodeLabel} · ${paramKey}` : paramKey,
        color: channelColor(paramKey),
        keys,
        min,
        max,
      });
    }
  }
  return channels;
}

/**
 * Vertical view of the value axis: which value sits at the middle of the
 * panel, and how many value units half its height covers. Zooming and panning
 * only ever touch these two numbers.
 */
export interface ValueView {
  center: number;
  /** Always > 0. Half the visible value span. */
  halfSpan: number;
}

export const DEFAULT_VALUE_VIEW: ValueView = { center: 0, halfSpan: 1.2 };

/** Vertical padding, in px, kept clear at the top and bottom of the curve area. */
export const VALUE_AXIS_PAD = 10;

export interface ValueAxis {
  toY: (value: number) => number;
  toValue: (y: number) => number;
  /** Value units per pixel — for turning a pixel drag into a value delta. */
  unitsPerPixel: number;
}

export function makeValueAxis(view: ValueView, height: number): ValueAxis {
  const usable = Math.max(1, height - VALUE_AXIS_PAD * 2);
  const halfSpan = Math.max(1e-9, view.halfSpan);
  const unitsPerPixel = (halfSpan * 2) / usable;
  return {
    toY: (value) => VALUE_AXIS_PAD + usable / 2 - ((value - view.center) / halfSpan) * (usable / 2),
    toValue: (y) => view.center + ((VALUE_AXIS_PAD + usable / 2 - y) / (usable / 2)) * halfSpan,
    unitsPerPixel,
  };
}

/**
 * A view that frames `values` with a margin. An empty set, or one with no
 * spread at all, still yields a usable window rather than an infinite or
 * zero-height one.
 */
export function fitValueView(values: number[], marginRatio = 0.15): ValueView {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { ...DEFAULT_VALUE_VIEW };
  let min = Infinity;
  let max = -Infinity;
  for (const v of finite) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const center = (min + max) / 2;
  const span = max - min;
  // A flat curve has no span to frame, so fall back to a window around it that
  // is proportional to the value itself (a track sitting at 500 needs a wider
  // window than one sitting at 0.5 before the flatness reads as flat).
  const halfSpan = span > 1e-9 ? (span / 2) * (1 + marginRatio) : Math.max(0.5, Math.abs(center) * 0.2);
  return { center, halfSpan };
}

/** Zooms about a fixed value — the one under the cursor stays put. */
export function zoomValueView(view: ValueView, factor: number, anchorValue: number): ValueView {
  const halfSpan = clamp(view.halfSpan * factor, 1e-6, 1e9);
  const ratio = halfSpan / view.halfSpan;
  return { center: anchorValue + (view.center - anchorValue) * ratio, halfSpan };
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Round numbers to label the value axis with — the 1 / 2 / 5 / 10 ladder, so
 * the gridlines land on values a human would have chosen.
 */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const raw = (max - min) / Math.max(1, target);
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const step = (normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  // The guard is a safety net against a pathological step, not an expected path.
  for (let v = start, i = 0; v <= max && i < 200; v += step, i++) {
    // Re-round: repeated addition of a fractional step drifts off the ladder.
    ticks.push(Math.round(v / step) * step);
  }
  return ticks;
}

/** Formats an axis label at a precision that suits the tick spacing. */
export function formatTick(value: number, step: number): string {
  if (!Number.isFinite(value)) return "";
  const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
  const text = value.toFixed(decimals);
  // Avoid the "-0" that toFixed produces for tiny negatives.
  return text === `-${(0).toFixed(decimals)}` ? (0).toFixed(decimals) : text;
}

/**
 * Maps a channel's own value range onto -1..1 so tracks with wildly different
 * units (degrees against a 0..1 opacity) can be compared in one view — the
 * same trick as Blender's Normalize toggle. Returns an identity mapping for a
 * channel with no spread, so a flat track stays on its own line instead of
 * being blown up by division by ~0.
 */
export interface ChannelNormalizer {
  forward: (value: number) => number;
  inverse: (normalized: number) => number;
}

export function makeNormalizer(channel: Channel, enabled: boolean): ChannelNormalizer {
  if (!enabled || !Number.isFinite(channel.min) || channel.max - channel.min < 1e-9) {
    return { forward: (v) => v, inverse: (v) => v };
  }
  const mid = (channel.min + channel.max) / 2;
  const half = (channel.max - channel.min) / 2;
  return {
    forward: (v) => (v - mid) / half,
    inverse: (n) => n * half + mid,
  };
}

export interface CurvePoint {
  frame: number;
  value: number;
}

/**
 * Samples the curve between two keyframes using the same easing the evaluator
 * will use at playback (see resolveSegmentEasing). `samples` scales with the
 * segment's on-screen width so a long segment doesn't look like a polyline and
 * a two-pixel one doesn't cost 24 points.
 */
export function sampleSegment(keys: Keyframe[], index: number, samples: number): CurvePoint[] {
  const k1 = keys[index];
  const k2 = keys[index + 1];
  if (!k1 || !k2) return [];
  const v1 = Number(k1.value);
  const v2 = Number(k2.value);
  const { easing, strength, bezier } = resolveSegmentEasing(keys, index);
  const n = Math.max(2, Math.min(200, Math.round(samples)));
  const out: CurvePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const eased = computeSegmentEasing(p, easing, strength, bezier);
    out.push({ frame: k1.frame + (k2.frame - k1.frame) * p, value: v1 + (v2 - v1) * eased });
  }
  return out;
}

/** The default control points a segment gets when it is converted to bezier. */
export const DEFAULT_BEZIER: [number, number, number, number] = [0.42, 0, 0.58, 1];

export interface BezierHandles {
  /** Control point leaving k1, in (frame, value) space. */
  out: CurvePoint;
  /** Control point arriving at k2, in (frame, value) space. */
  in: CurvePoint;
}

/**
 * Where a segment's two bezier control points sit in curve space. `easeBezier`
 * is stored normalized (0..1 of the segment on both axes), which is exactly
 * the CSS cubic-bezier convention — this only stretches it onto the segment.
 */
export function bezierHandlePositions(
  k1: Keyframe,
  k2: Keyframe,
  bezier: [number, number, number, number] = DEFAULT_BEZIER,
): BezierHandles {
  const f1 = k1.frame;
  const f2 = k2.frame;
  const v1 = Number(k1.value);
  const v2 = Number(k2.value);
  const df = f2 - f1;
  const dv = v2 - v1;
  return {
    out: { frame: f1 + df * bezier[0], value: v1 + dv * bezier[1] },
    in: { frame: f1 + df * bezier[2], value: v1 + dv * bezier[3] },
  };
}

/**
 * The inverse: a dragged handle position back into stored control points.
 *
 * X is clamped to the segment because a control point outside it makes the
 * curve non-monotonic in time — the evaluator's bezier solve assumes it can
 * bisect on x. Y is deliberately *not* clamped, since overshoot above 1 or
 * below 0 is the whole point of an anticipation or a bounce.
 *
 * A segment whose two keys hold the same value has no `dv` to divide by; the
 * previous Y is kept in that case, so dragging such a handle moves it in time
 * only instead of producing Infinity.
 */
export function bezierFromHandle(
  k1: Keyframe,
  k2: Keyframe,
  which: "out" | "in",
  point: CurvePoint,
  previous: [number, number, number, number] = DEFAULT_BEZIER,
): [number, number, number, number] {
  const df = k2.frame - k1.frame;
  const dv = Number(k2.value) - Number(k1.value);
  const next: [number, number, number, number] = [...previous] as [number, number, number, number];
  const x = df === 0 ? (which === "out" ? previous[0] : previous[2]) : clamp((point.frame - k1.frame) / df, 0, 1);
  const y =
    Math.abs(dv) < 1e-9
      ? which === "out"
        ? previous[1]
        : previous[3]
      : (point.value - Number(k1.value)) / dv;
  if (which === "out") {
    next[0] = x;
    next[1] = y;
  } else {
    next[2] = x;
    next[3] = y;
  }
  return next;
}

/**
 * Seeds bezier control points that reproduce an existing named easing, so
 * "convert to bezier and hand-tune it" starts from the curve that was already
 * on screen rather than snapping to a default S.
 */
export function bezierApproximating(
  easing: Keyframe["easeIn"],
  strength: number | undefined,
): [number, number, number, number] {
  const at = (p: number) => computeSegmentEasing(p, easing, strength);
  // Match the curve's height at a third and two thirds — enough to carry the
  // character of the easing (including overshoot) into the control points.
  const y1 = at(1 / 3);
  const y2 = at(2 / 3);
  // Inverting the cubic exactly isn't worth it: these two coefficients come
  // from solving B(1/3) and B(2/3) for the control values with x fixed at
  // thirds, which is the standard cubic-through-two-points fit.
  const p1 = (18 * y1 - 9 * y2 + 2) / 6;
  const p2 = (-9 * y1 + 18 * y2 - 5) / 6;
  return [1 / 3, p1, 2 / 3, p2];
}
