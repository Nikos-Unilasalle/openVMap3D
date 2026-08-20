import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { asColor, numberInput } from "./object";
import { readPositionsSync, textureSizeFor } from "../particleRuntime";

/** Same "past the active count" sentinel POSITION_SHADER writes — see connectivity.ts's identical constant for the full explanation. */
const DEAD_AGE_THRESHOLD = -1000;

/**
 * Total segments (particles × history samples) this node will ever build in
 * one frame. The point of the node is a *few* particles with long, smooth
 * trails — not a particle-count node — so this caps the product rather than
 * either factor alone: a request for more particles than that leaves room
 * for quietly shortens every trail instead of refusing to render.
 */
const MAX_TRAIL_SEGMENTS = 20000;

/**
 * Fixed count of per-particle "Trail N Points" list outputs — a Vector3[]
 * per socket, ready to wire straight into a Curve from Points (then Curve to
 * Line/Mesh) for an actual curve, not just the LineSegments2 preview this
 * node draws itself. Static sockets rather than one dynamically grown per
 * live particle: which particles exist is GPU/runtime data, only known
 * inside evaluate(), while a node's socket list has to be decidable before
 * that (see NodeDefinition.dynamicInputs/dynamicOutputs — both are functions
 * of *graph connections*, not of evaluated data). Particle index 0..N-1 maps
 * to Trail 1..N Points in order — stable since GPU particles keep their
 * texel identity across frames (unlike Array/Instance's clones), so "Trail 1"
 * is the same particle every frame, not just whichever came first. Beyond
 * this node's "a handful of particles" scale (MAX_TRAIL_SEGMENTS), the rest
 * still draw in Trails (Geometry) — they just don't get an individual curve
 * output.
 */
const MAX_TRACKED_TRAILS = 8;

interface TrailState {
  /** One growing position list per live particle index — oldest first. */
  histories: Map<number, number[]>;
  lastAge: Map<number, number>;
  line?: LineSegments2;
  lineGeometry?: LineSegmentsGeometry;
  material?: LineMaterial;
  bufferCapacity: number;
  positions?: Float32Array;
  colors?: Float32Array;
}

const trailCache = createNodeCache<TrailState>((s) => {
  if (s.lineGeometry) s.lineGeometry.dispose();
  if (s.material) s.material.dispose();
  if (s.line) s.line.removeFromParent();
});

function getState(nodeId: string): TrailState {
  let state = trailCache.get(nodeId);
  if (!state) {
    state = { histories: new Map(), lastAge: new Map(), bufferCapacity: 0 };
    trailCache.set(nodeId, state);
  }
  return state;
}

function ensureCapacity(state: TrailState, segments: number): void {
  // The lineGeometry truthy check matters on the very first real frame:
  // bufferCapacity starts at 0, and a legitimate `segments` of 0 (every
  // particle has only one sample so far, no segment to draw yet) would
  // otherwise short-circuit before the geometry is ever built at all.
  if (state.bufferCapacity >= segments && state.lineGeometry) return;
  const capacity = Math.max(segments, Math.ceil(state.bufferCapacity * 1.5) + 64);
  state.bufferCapacity = capacity;
  state.positions = new Float32Array(capacity * 6);
  state.colors = new Float32Array(capacity * 6);

  if (state.lineGeometry) state.lineGeometry.dispose();
  const lineGeometry = new LineSegmentsGeometry();
  lineGeometry.setPositions(state.positions);
  lineGeometry.setColors(state.colors);
  state.lineGeometry = lineGeometry;

  if (!state.material) {
    state.material = new LineMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  }
  if (!state.line) {
    state.line = new LineSegments2(lineGeometry, state.material);
    state.line.frustumCulled = false;
  } else {
    state.line.geometry = lineGeometry;
  }
}

/**
 * Capture Trails Node — reads a Particle Simulate positions texture back to
 * the CPU (same readback connect-nearby uses) and keeps a short position
 * history per particle index, drawn as one ribbon of line segments per
 * particle. The point: run a handful of particles through a force field or
 * curl-noise flow, and get their paths out as a curve rather than a snapshot
 * of where they are right now — "jolies courbes representatives du
 * mouvement", not a point cloud. The node draws its own LineSegments2
 * preview (Trails (Geometry)), but also hands back each tracked particle's
 * raw point history as its own "Trail N Points" list output — wire one
 * straight into a Curve from Points for an actual editable curve.
 *
 * Per-particle history rather than a GPU ring buffer: a texel's index is a
 * stable particle identity frame to frame (unlike Array/Instance's cloned
 * meshes — see motionBlur.ts's velocityKey), so a plain JS array per index
 * is enough, and building it from a CPU readback is far simpler than a
 * second ping-ponged GPU texture just to hold trail history. Costs a
 * CPU→GPU→CPU round trip already priced in by connect-nearby at this app's
 * particle scale (see MAX_TRAIL_SEGMENTS — this node is built for a handful
 * of particles with long trails, not a dense cloud).
 *
 * A respawn (age drops instead of climbing — POSITION_SHADER resets it near
 * 0) clears that particle's history rather than drawing a line across the
 * whole scene from its old position to its new one.
 */
export const CAPTURE_TRAILS_NODE: NodeDefinition = {
  type: "particles/capture-trails",
  label: "Capture Trails",
  category: "particles",
  inputs: [
    { id: "positions", label: "Positions", type: "texture" },
    { id: "count", label: "Count", type: "value" },
    { id: "historyLength", label: "History Length", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Trails (Geometry)", type: "geometry" },
    { id: "segmentCount", label: "Segment Count", type: "value" },
    ...Array.from({ length: MAX_TRACKED_TRAILS }, (_, i) => ({
      id: `trail${i}`,
      label: `Trail ${i + 1} Points`,
      type: "list" as const,
    })),
  ],
  defaultParams: {
    historyLength: 60,
    color: new THREE.Color(0xffb86b),
    opacity: 0.85,
    linewidth: 1.5,
    worldUnits: false,
    fadeAlongTrail: true,
  },
  dynamicParamFields: () => [
    { id: "historyLength", label: "History Length (samples)", kind: "number", step: 5 },
    { id: "color", label: "Color", kind: "color", group: "Style" },
    { id: "opacity", label: "Opacity", kind: "number", step: 0.05, group: "Style" },
    { id: "fadeAlongTrail", label: "Fade Tail", kind: "boolean", group: "Style" },
    { id: "linewidth", label: "Width", kind: "number", step: 0.1, group: "Line" },
    { id: "worldUnits", label: "World Units (width in scene units)", kind: "boolean", group: "Line" },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getState(ctx.nodeId);
    const emptyTrails = Object.fromEntries(Array.from({ length: MAX_TRACKED_TRAILS }, (_, i) => [`trail${i}`, [] as THREE.Vector3[]]));

    const texture = inputs.positions instanceof THREE.Texture ? inputs.positions : null;
    const capacity = Math.max(0, Math.min(6000, Math.round(numberInput(inputs.count, params.count, 0))));
    const requestedHistory = Math.max(2, Math.min(600, Math.round(numberInput(inputs.historyLength, params.historyLength, 60))));
    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffb86b)));
    const opacity = numberInput(inputs.opacity, params.opacity, 0.85);
    const fadeAlongTrail = params.fadeAlongTrail !== false;

    if (!texture || capacity === 0 || !ctx.renderer) {
      ensureCapacity(state, 0);
      if (state.lineGeometry) state.lineGeometry.instanceCount = 0;
      return { geometry: state.line ?? new THREE.Group(), segmentCount: 0, ...emptyTrails };
    }

    // A live particle count this small can afford a much longer history than
    // a dense cloud could — see MAX_TRAIL_SEGMENTS.
    const historyLength = Math.max(2, Math.min(requestedHistory, Math.floor(MAX_TRAIL_SEGMENTS / Math.max(1, capacity))));

    const size = textureSizeFor(capacity);
    const buffer = readPositionsSync(ctx.renderer, texture, size, ctx.nodeId);

    const live = new Set<number>();
    let segmentTotal = 0;
    for (let i = 0; i < capacity; i++) {
      const age = buffer[i * 4 + 3];
      if (age < DEAD_AGE_THRESHOLD) continue;
      live.add(i);

      const lastAge = state.lastAge.get(i);
      let history = state.histories.get(i);
      if (lastAge !== undefined && age < lastAge - 1e-4) {
        // Respawned — start this particle's trail over rather than drawing a
        // line from its old life to its new one.
        history = undefined;
      }
      if (!history) {
        history = [];
        state.histories.set(i, history);
      }
      state.lastAge.set(i, age);

      history.push(buffer[i * 4], buffer[i * 4 + 1], buffer[i * 4 + 2]);
      if (history.length > historyLength * 3) history.splice(0, history.length - historyLength * 3);
      segmentTotal += Math.max(0, history.length / 3 - 1);
    }

    // Drop particles no longer active (respawn-parked, or the emitter count
    // shrank) so their history doesn't leak for the rest of the session.
    if (state.histories.size > live.size) {
      for (const idx of state.histories.keys()) {
        if (!live.has(idx)) {
          state.histories.delete(idx);
          state.lastAge.delete(idx);
        }
      }
    }

    ensureCapacity(state, segmentTotal);
    const positions = state.positions!;
    const colors = state.colors!;
    let cursor = 0;
    for (const history of state.histories.values()) {
      const samples = history.length / 3;
      for (let s = 0; s < samples - 1; s++) {
        const o = cursor * 6;
        positions[o] = history[s * 3];
        positions[o + 1] = history[s * 3 + 1];
        positions[o + 2] = history[s * 3 + 2];
        positions[o + 3] = history[(s + 1) * 3];
        positions[o + 4] = history[(s + 1) * 3 + 1];
        positions[o + 5] = history[(s + 1) * 3 + 2];

        // s=0 is the oldest segment (the tail) — fades toward black; the
        // newest segment (closest to the particle's current position) stays
        // full brightness.
        const t = fadeAlongTrail ? (samples <= 2 ? 1 : s / (samples - 2)) : 1;
        colors[o] = color.r * t;
        colors[o + 1] = color.g * t;
        colors[o + 2] = color.b * t;
        colors[o + 3] = color.r * t;
        colors[o + 4] = color.g * t;
        colors[o + 5] = color.b * t;
        cursor++;
      }
    }

    const lineGeometry = state.lineGeometry!;
    (lineGeometry.attributes.instanceStart as THREE.InterleavedBufferAttribute).needsUpdate = true;
    (lineGeometry.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).needsUpdate = true;
    lineGeometry.instanceCount = cursor;

    const material = state.material!;
    material.color.set(color);
    material.opacity = opacity;
    material.linewidth = Math.max(0.01, numberInput(inputs.linewidth, params.linewidth, 1.5));
    material.worldUnits = Boolean(params.worldUnits);
    material.resolution.set(ctx.renderSize?.width ?? 1920, ctx.renderSize?.height ?? 1080);

    state.line!.userData.nodeId = ctx.nodeId;

    // Lowest-N live particle indices, in order — "Trail 1" names the same
    // particle every frame (see MAX_TRACKED_TRAILS's doc), not just whoever
    // happens to sort first this frame.
    const trailOutputs: Record<string, THREE.Vector3[]> = { ...emptyTrails };
    const liveIndices = [...state.histories.keys()].sort((a, b) => a - b).slice(0, MAX_TRACKED_TRAILS);
    liveIndices.forEach((idx, slot) => {
      const history = state.histories.get(idx)!;
      const points: THREE.Vector3[] = [];
      for (let s = 0; s < history.length; s += 3) {
        points.push(new THREE.Vector3(history[s], history[s + 1], history[s + 2]));
      }
      trailOutputs[`trail${slot}`] = points;
    });

    return { geometry: state.line!, segmentCount: cursor, ...trailOutputs };
  },
};
