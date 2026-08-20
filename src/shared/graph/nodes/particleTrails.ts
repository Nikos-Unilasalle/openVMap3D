import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { asColor, numberInput } from "./object";
import { readPositionsSync, textureSizeFor } from "../particleRuntime";
import { toBoolean } from "../sockets";

/**
 * A texel is "alive" once its age reaches 0 — the same test
 * POINT_VERTEX_SHADER already uses for `vAlive` (particles/render hides
 * anything with age < 0). Two things share the "not alive yet" bucket this
 * one check covers: the genuinely dead sentinel POSITION_SHADER writes for
 * a texel past the active count (-1.0e6, `idx >= activeCount`), and — this
 * is the one that actually matters for a node that records history — every
 * texel's *own* staggered startup age. createSimulation seeds age as
 * `-((i / capacity) * lifetimeGuess)` for every texel so the population
 * doesn't all burst-spawn on frame 1, but that seed only writes the alpha
 * channel — the position stays at the texture's zeroed default (world
 * origin) until that texel's age counts up past 0 and it takes its first
 * real respawn. Using the old, looser "not the dead sentinel" test recorded
 * that parked-at-the-origin position into the trail for however many frames
 * of stagger it had left, then jumped straight to the real spawn point the
 * instant it activated — one huge, fast segment per particle, staggered
 * across roughly the first lifetime of playback, exactly the "curves rush
 * in fast and hirsute, then settle" symptom reported. Matching
 * POINT_VERTEX_SHADER's own alive test skips both cases in one comparison:
 * a pre-spawn texel's age is a small negative number, well short of 0.
 */
export function isAlive(age: number): boolean {
  return age >= 0;
}

/**
 * Total segments (particles × history samples) this node will ever build in
 * one frame. The point of the node is a *few* particles with long, smooth
 * trails — not a particle-count node — so this caps the product rather than
 * either factor alone: a request for more particles than that leaves room
 * quietly shortens every trail instead of refusing to render.
 *
 * Generous on purpose: Particle Simulate's active-particle count is
 * spawnRate × lifetime (see activeParticleCount in particleRuntime.ts), not
 * something this node controls — raising Lifetime to keep a particle (and
 * its trail) around longer *also* raises the population, and a low cap here
 * silently ate that population growth by shrinking History Length instead,
 * which looked exactly like "the sliders don't work". A previous value of
 * 20000 meant the default emitter's spawnRate (200) with a 10s lifetime
 * (2000 active particles, not an unusual ask) floored History Length to 10
 * regardless of what the param said. This cap still exists purely so an
 * accidental few-thousand-particle graph can't hang the tab rebuilding a
 * multi-million-segment buffer every frame — it should never bind for the
 * "handful of particles, long trails" case the node is actually for.
 */
const MAX_TRAIL_SEGMENTS = 300000;

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

/** The History Length a live particle count actually gets to keep — see MAX_TRAIL_SEGMENTS. Exported for its own test rather than only reachable through a live GPU readback. */
export function effectiveHistoryLength(requestedHistory: number, liveCount: number): number {
  return Math.max(2, Math.min(requestedHistory, Math.floor(MAX_TRAIL_SEGMENTS / Math.max(1, liveCount))));
}

/**
 * How many discrete opacity steps the tail fade is built from. LineMaterial
 * has no per-vertex alpha — vertexColors only ever feeds RGB, and its
 * fragment shader writes `gl_FragColor.a` from the single material-level
 * `opacity` uniform, never from vertex color (see the fuller writeup where
 * these buckets are used below) — so a smooth *transparency* fade needs
 * several materials at different opacities rather than one. 6 steps reads
 * as a smooth gradient at this node's line widths without paying for a
 * draw call per segment.
 */
const FADE_BUCKETS = 6;

/** Which fade bucket a segment at fade-position `t` (0 = tail, 1 = head) falls into. Exported for its own test. */
export function bucketFor(t: number, buckets = FADE_BUCKETS): number {
  return Math.max(0, Math.min(buckets - 1, Math.floor(t * buckets)));
}

/** The material opacity for bucket `index` — 0 is the most transparent (tail), `buckets - 1` is full `baseOpacity` (head). Exported for its own test. */
export function bucketOpacity(baseOpacity: number, index: number, buckets = FADE_BUCKETS): number {
  return (baseOpacity * (index + 1)) / buckets;
}

interface Bucket {
  line?: LineSegments2;
  lineGeometry?: LineSegmentsGeometry;
  material?: LineMaterial;
  bufferCapacity: number;
  positions?: Float32Array;
  colors?: Float32Array;
}

interface TrailState {
  /** One growing position list per live particle index — oldest first. */
  histories: Map<number, number[]>;
  lastAge: Map<number, number>;
  group?: THREE.Group;
  buckets: Bucket[];
}

const trailCache = createNodeCache<TrailState>((s) => {
  for (const b of s.buckets) {
    if (b.lineGeometry) b.lineGeometry.dispose();
    if (b.material) b.material.dispose();
    if (b.line) b.line.removeFromParent();
  }
  if (s.group) s.group.removeFromParent();
});

function getState(nodeId: string): TrailState {
  let state = trailCache.get(nodeId);
  if (!state) {
    state = { histories: new Map(), lastAge: new Map(), buckets: [] };
    trailCache.set(nodeId, state);
  }
  return state;
}

function ensureBucketCapacity(bucket: Bucket, segments: number): void {
  // The lineGeometry truthy check matters on the very first real frame:
  // bufferCapacity starts at 0, and a legitimate `segments` of 0 would
  // otherwise short-circuit before the geometry is ever built at all.
  if (bucket.bufferCapacity >= segments && bucket.lineGeometry) return;
  const capacity = Math.max(segments, Math.ceil(bucket.bufferCapacity * 1.5) + 64);
  bucket.bufferCapacity = capacity;
  bucket.positions = new Float32Array(capacity * 6);
  bucket.colors = new Float32Array(capacity * 6);

  if (bucket.lineGeometry) bucket.lineGeometry.dispose();
  const lineGeometry = new LineSegmentsGeometry();
  lineGeometry.setPositions(bucket.positions);
  lineGeometry.setColors(bucket.colors);
  bucket.lineGeometry = lineGeometry;

  if (!bucket.material) {
    bucket.material = new LineMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  }
  if (!bucket.line) {
    bucket.line = new LineSegments2(lineGeometry, bucket.material);
    bucket.line.frustumCulled = false;
  } else {
    bucket.line.geometry = lineGeometry;
  }
}

/**
 * Every bucket's Line2, parented under one Group — creating/reusing the
 * buckets and the group itself only once per node, not once per frame.
 */
function getGroup(state: TrailState, nodeId: string): THREE.Group {
  if (!state.group) {
    state.group = new THREE.Group();
    state.group.userData.nodeId = nodeId;
  }
  while (state.buckets.length < FADE_BUCKETS) {
    const bucket: Bucket = { bufferCapacity: 0 };
    ensureBucketCapacity(bucket, 0);
    state.group.add(bucket.line!);
    state.buckets.push(bucket);
  }
  return state.group;
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
    const requestedHistory = Math.max(2, Math.min(5000, Math.round(numberInput(inputs.historyLength, params.historyLength, 60))));
    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffb86b)));
    const opacity = numberInput(inputs.opacity, params.opacity, 0.85);
    const fadeAlongTrail = toBoolean(params.fadeAlongTrail);

    const group = getGroup(state, ctx.nodeId);

    if (!texture || capacity === 0 || !ctx.renderer) {
      for (const b of state.buckets) if (b.lineGeometry) b.lineGeometry.instanceCount = 0;
      return { geometry: group, segmentCount: 0, trails: [] as THREE.Vector3[][] };
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
      if (isAlive(buffer[i * 4 + 3])) liveCount++;
    }
    const historyLength = effectiveHistoryLength(requestedHistory, liveCount);

    const live = new Set<number>();
    let segmentTotal = 0;
    for (let i = 0; i < capacity; i++) {
      const age = buffer[i * 4 + 3];
      if (!isAlive(age)) continue;
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

    // s=0 is the oldest segment per particle (the tail), fading toward
    // fully transparent; the newest segment (closest to the particle's
    // current position) stays at full Opacity. LineMaterial has no
    // per-vertex alpha — vertexColors only ever feeds RGB (three's own
    // shader writes `gl_FragColor.a` from the single `opacity` uniform,
    // never from vertex color) — so fading *color* toward black used to
    // look like the tail turning solid black, not fading away. Real
    // transparency needs a real opacity value, which only exists per
    // *material* here, so the trail is split across FADE_BUCKETS separate
    // LineSegments2 draws, each its own LineMaterial at a different opacity
    // step; vertex color inside a bucket stays the plain user Color.
    const linewidth = Math.max(0.01, numberInput(inputs.linewidth, params.linewidth, 1.5));
    const worldUnits = Boolean(params.worldUnits);
    const resWidth = ctx.renderSize?.width ?? 1920;
    const resHeight = ctx.renderSize?.height ?? 1080;

    const bucketPositions: number[][] = Array.from({ length: FADE_BUCKETS }, () => []);
    const bucketColors: number[][] = Array.from({ length: FADE_BUCKETS }, () => []);
    for (const history of state.histories.values()) {
      const samples = history.length / 3;
      for (let s = 0; s < samples - 1; s++) {
        const t = fadeAlongTrail ? (samples <= 2 ? 1 : s / (samples - 2)) : 1;
        const bucketIndex = bucketFor(t);
        bucketPositions[bucketIndex].push(
          history[s * 3], history[s * 3 + 1], history[s * 3 + 2],
          history[(s + 1) * 3], history[(s + 1) * 3 + 1], history[(s + 1) * 3 + 2],
        );
        bucketColors[bucketIndex].push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    }

    let cursor = 0;
    for (let i = 0; i < FADE_BUCKETS; i++) {
      const bucket = state.buckets[i];
      const segCount = bucketPositions[i].length / 6;
      cursor += segCount;
      ensureBucketCapacity(bucket, segCount);
      bucket.positions!.set(bucketPositions[i]);
      bucket.colors!.set(bucketColors[i]);

      const lineGeometry = bucket.lineGeometry!;
      (lineGeometry.attributes.instanceStart as THREE.InterleavedBufferAttribute).needsUpdate = true;
      (lineGeometry.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).needsUpdate = true;
      lineGeometry.instanceCount = segCount;

      const material = bucket.material!;
      material.color.set(color);
      // Bucket 0 is the tail (most transparent), the last bucket is the
      // head (full Opacity) — fadeAlongTrail off puts everything in the
      // last bucket already (see the `t` calc above), so this still lands
      // on `opacity` exactly in that case.
      material.opacity = bucketOpacity(opacity, i);
      material.linewidth = linewidth;
      material.worldUnits = worldUnits;
      material.resolution.set(resWidth, resHeight);
      bucket.line!.userData.nodeId = ctx.nodeId;
    }

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

    return { geometry: group, segmentCount: cursor, trails };
  },
};
