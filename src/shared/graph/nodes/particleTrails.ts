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
 * Safety cap on how many per-particle point lists "Point Lists" ever hands
 * back in one array — not a fixed socket count (a single "list" output can
 * hold as many sub-lists as there are live particles, however many that is
 * this frame; see the "trails" output below), just a ceiling so a graph
 * that accidentally feeds this node thousands of particles doesn't build an
 * enormous nested array every frame. Well above this node's actual target
 * scale (a handful of particles, per MAX_TRAIL_SEGMENTS).
 */
const MAX_TRAIL_LISTS = 64;

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
 * preview (Trails (Geometry)), but also hands back every tracked particle's
 * raw point history as "Point Lists" — a list of Vector3[] lists, one per
 * live particle, however many that is this frame. A node that fans a list
 * of lists out into one curve each (not built yet) turns that into N actual
 * editable curves.
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
    { id: "trails", label: "Point Lists (List of Lists)", type: "list" },
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

    const texture = inputs.positions instanceof THREE.Texture ? inputs.positions : null;
    const capacity = Math.max(0, Math.min(6000, Math.round(numberInput(inputs.count, params.count, 0))));
    const requestedHistory = Math.max(2, Math.min(600, Math.round(numberInput(inputs.historyLength, params.historyLength, 60))));
    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffb86b)));
    const opacity = numberInput(inputs.opacity, params.opacity, 0.85);
    const fadeAlongTrail = params.fadeAlongTrail !== false;

    if (!texture || capacity === 0 || !ctx.renderer) {
      ensureCapacity(state, 0);
      if (state.lineGeometry) state.lineGeometry.instanceCount = 0;
      return { geometry: state.line ?? new THREE.Group(), segmentCount: 0, trails: [] as THREE.Vector3[][] };
    }

    const size = textureSizeFor(capacity);
    const buffer = readPositionsSync(ctx.renderer, texture, size, ctx.nodeId);

    // The history-length budget divides by how many particles are actually
    // *alive* right now, not `capacity` (the texture's full size, i.e. Max
    // Particles on Particle Simulate) — capacity is routinely much bigger
    // than the live count (headroom, or a low spawn rate), and dividing by
    // it instead silently floored every trail to a handful of samples
    // regardless of the History Length param. A quick pass over the ages
    // already in `buffer` (cheap: one float compare per texel) gets the
    // real denominator before the accumulation loop needs it.
    let liveCount = 0;
    for (let i = 0; i < capacity; i++) {
      if (buffer[i * 4 + 3] >= DEAD_AGE_THRESHOLD) liveCount++;
    }
    const historyLength = Math.max(2, Math.min(requestedHistory, Math.floor(MAX_TRAIL_SEGMENTS / Math.max(1, liveCount))));

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

    // Sorted by particle index (stable identity — see the doc comment above)
    // rather than Map iteration order, so a respawn that re-inserts a key
    // doesn't shuffle which sub-list is "first" from one frame to the next.
    const liveIndices = [...state.histories.keys()].sort((a, b) => a - b).slice(0, MAX_TRAIL_LISTS);
    const trails: THREE.Vector3[][] = liveIndices.map((idx) => {
      const history = state.histories.get(idx)!;
      const points: THREE.Vector3[] = [];
      for (let s = 0; s < history.length; s += 3) {
        points.push(new THREE.Vector3(history[s], history[s + 1], history[s + 2]));
      }
      return points;
    });

    return { geometry: state.line!, segmentCount: cursor, trails };
  },
};
