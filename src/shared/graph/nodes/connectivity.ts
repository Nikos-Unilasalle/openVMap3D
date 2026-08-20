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
 * POINT_VERTEX_SHADER uses for `vAlive` (particles/render hides anything
 * with age < 0). Covers both the genuinely dead sentinel (-1.0e6,
 * `idx >= activeCount`) and a texel still in its staggered startup delay:
 * createSimulation seeds every texel's age negative on purpose so the
 * population doesn't all burst-spawn on frame 1, and until that age counts
 * up past 0 the texel's *position* is still the texture's zeroed default
 * (world origin), not a real particle location yet. A looser threshold here
 * drew connections to that origin-parked cluster during the first
 * lifetime of playback — see particleTrails.ts's identical fix for the
 * fuller writeup (same bug, worse there since it corrupts recorded history,
 * not just one frame's line positions).
 */
export function isAliveParticle(age: number): boolean {
  return age >= 0;
}

export interface Candidate {
  index: number;
  x: number;
  y: number;
  z: number;
}

export interface Edge {
  a: number;
  b: number;
  distanceSq: number;
}

/** Spatial hash over the active points, cell size = maxDistance — every pair within range shares a cell or a face-adjacent one. */
function buildGrid(points: Candidate[], cellSize: number): Map<string, Candidate[]> {
  const grid = new Map<string, Candidate[]>();
  const inv = 1 / cellSize;
  for (const p of points) {
    const key = `${Math.floor(p.x * inv)},${Math.floor(p.y * inv)},${Math.floor(p.z * inv)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(p);
    else grid.set(key, [p]);
  }
  return grid;
}

/**
 * Nearest neighbors within `maxDistance` for every active point, capped at
 * `maxPerPoint` (closest first) so a dense cluster doesn't produce a solid
 * mass of lines. Edges are deduped by canonical (min, max) index pair, but
 * kept if *either* endpoint's own top-K includes the other — a plain mutual
 * intersection reads as visibly sparser than the reference, since two points
 * whose only close neighbor is each other can still each be closer to a
 * third, denser cluster.
 */
export function findConnections(points: Candidate[], maxDistance: number, maxPerPoint: number): Edge[] {
  const grid = buildGrid(points, maxDistance);
  const maxDistSq = maxDistance * maxDistance;
  const inv = 1 / maxDistance;

  const perPoint: Array<{ b: number; distanceSq: number }[]> = points.map(() => []);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const cx = Math.floor(p.x * inv);
    const cy = Math.floor(p.y * inv);
    const cz = Math.floor(p.z * inv);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!bucket) continue;
          for (const q of bucket) {
            if (q.index === p.index) continue;
            const ddx = q.x - p.x;
            const ddy = q.y - p.y;
            const ddz = q.z - p.z;
            const distanceSq = ddx * ddx + ddy * ddy + ddz * ddz;
            if (distanceSq <= maxDistSq) perPoint[i].push({ b: q.index, distanceSq });
          }
        }
      }
    }
    perPoint[i].sort((x, y) => x.distanceSq - y.distanceSq);
    if (perPoint[i].length > maxPerPoint) perPoint[i].length = maxPerPoint;
  }

  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i].index;
    for (const { b, distanceSq } of perPoint[i]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a, b, distanceSq });
    }
  }
  return edges;
}

interface ConnectState {
  line?: LineSegments2;
  lineGeometry?: LineSegmentsGeometry;
  material?: LineMaterial;
  /** Segment-count the buffers were sized for — only grows, never shrinks, so a busy frame never reallocates mid-scrub. */
  bufferCapacity: number;
  positions?: Float32Array;
  colors?: Float32Array;
}

const connectCache = createNodeCache<ConnectState>((s) => {
  if (s.lineGeometry) s.lineGeometry.dispose();
  if (s.material) s.material.dispose();
  if (s.line) s.line.removeFromParent();
});

function getState(nodeId: string): ConnectState {
  let state = connectCache.get(nodeId);
  if (!state) {
    state = { bufferCapacity: 0 };
    connectCache.set(nodeId, state);
  }
  return state;
}

function ensureCapacity(state: ConnectState, segments: number): void {
  // The lineGeometry truthy check matters on the very first real frame:
  // bufferCapacity starts at 0, and a legitimate `segments` of 0 (no pair of
  // particles within range yet) would otherwise short-circuit before the
  // geometry is ever built at all, and the unconditional `.attributes` read
  // further down throws on the undefined geometry.
  if (state.bufferCapacity >= segments && state.lineGeometry) return;
  // Grow in bigger jumps than the exact ask — a slowly climbing particle
  // count would otherwise reallocate (and rebuild the GPU buffers) on
  // practically every frame.
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
 * Connect Nearby Points Node — reads a Particle Simulate position texture
 * back to the CPU and draws a line between every pair of active particles
 * within range, capped per point. The "constellation" look (Genuary
 * 2022/spite's flow-field demo): a flow field or any other Particle Simulate
 * setup, its cloud of points laced together as they drift.
 *
 * Distance search runs on the CPU (a spatial hash, not the GPU all-pairs
 * distance matrix the reference demo uses) — this app's particle counts stay
 * in the low thousands for an interactive editor with a scrubbable timeline,
 * where a CPU pass wins on simplicity without costing the frame rate a GPU
 * approach would only pay back at far larger counts.
 */
export const CONNECT_NEARBY_NODE: NodeDefinition = {
  type: "particles/connect-nearby",
  label: "Connect Nearby Points",
  category: "particles",
  inputs: [
    { id: "positions", label: "Positions", type: "texture" },
    { id: "count", label: "Count", type: "value" },
    { id: "maxDistance", label: "Max Distance", type: "value" },
    { id: "maxConnections", label: "Max Connections / Point", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Lines (Geometry)", type: "geometry" },
    { id: "connectionCount", label: "Connection Count", type: "value" },
  ],
  defaultParams: {
    maxDistance: 1.5,
    maxConnections: 6,
    color: new THREE.Color(0xffffff),
    opacity: 0.6,
    linewidth: 1.5,
    worldUnits: false,
    fadeByDistance: true,
  },
  dynamicParamFields: () => [
    { id: "maxDistance", label: "Max Distance", kind: "number", step: 0.1 },
    { id: "maxConnections", label: "Max Connections / Point", kind: "number", step: 1 },
    { id: "color", label: "Color", kind: "color", group: "Style" },
    { id: "opacity", label: "Opacity", kind: "number", step: 0.05, group: "Style" },
    { id: "fadeByDistance", label: "Fade by Distance", kind: "boolean", group: "Style" },
    { id: "linewidth", label: "Width", kind: "number", step: 0.1, group: "Line" },
    { id: "worldUnits", label: "World Units (width in scene units)", kind: "boolean", group: "Line" },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getState(ctx.nodeId);

    const texture = inputs.positions instanceof THREE.Texture ? inputs.positions : null;
    // Capacity of the source texture (particles/simulate's "count" output is
    // the texture's texel count, not how many of those are alive right now —
    // see isAliveParticle above), clamped the same way Ray Burst clamps its own
    // particle-scale input against a CPU pass blowing up.
    const capacity = Math.max(0, Math.min(6000, Math.round(numberInput(inputs.count, params.count, 0))));
    const maxDistance = Math.max(0.0001, numberInput(inputs.maxDistance, params.maxDistance, 1.5));
    const maxConnections = Math.max(1, Math.min(64, Math.round(numberInput(inputs.maxConnections, params.maxConnections, 6))));
    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffffff)));
    const opacity = numberInput(inputs.opacity, params.opacity, 0.6);
    const fadeByDistance = toBoolean(params.fadeByDistance);

    if (!texture || capacity === 0 || !ctx.renderer) {
      ensureCapacity(state, 0);
      if (state.lineGeometry) state.lineGeometry.instanceCount = 0;
      return { geometry: state.line ?? new THREE.Group(), connectionCount: 0 };
    }

    const size = textureSizeFor(capacity);
    const buffer = readPositionsSync(ctx.renderer, texture, size, ctx.nodeId);

    const points: Candidate[] = [];
    for (let i = 0; i < capacity; i++) {
      const age = buffer[i * 4 + 3];
      if (!isAliveParticle(age)) continue;
      points.push({ index: i, x: buffer[i * 4], y: buffer[i * 4 + 1], z: buffer[i * 4 + 2] });
    }

    const edges = findConnections(points, maxDistance, maxConnections);
    const byIndex = new Map(points.map((p) => [p.index, p]));

    ensureCapacity(state, edges.length);
    const positions = state.positions!;
    const colors = state.colors!;
    for (let e = 0; e < edges.length; e++) {
      const edge = edges[e];
      const pa = byIndex.get(edge.a)!;
      const pb = byIndex.get(edge.b)!;
      const o = e * 6;
      positions[o] = pa.x;
      positions[o + 1] = pa.y;
      positions[o + 2] = pa.z;
      positions[o + 3] = pb.x;
      positions[o + 4] = pb.y;
      positions[o + 5] = pb.z;

      const t = fadeByDistance ? 1 - Math.min(1, Math.sqrt(edge.distanceSq) / maxDistance) : 1;
      colors[o] = color.r * t;
      colors[o + 1] = color.g * t;
      colors[o + 2] = color.b * t;
      colors[o + 3] = color.r * t;
      colors[o + 4] = color.g * t;
      colors[o + 5] = color.b * t;
    }

    const lineGeometry = state.lineGeometry!;
    // instanceStart/instanceEnd share one interleaved buffer (positions), as
    // do instanceColorStart/instanceColorEnd (colors) — flagging either half
    // of each pair marks the underlying buffer dirty for both.
    (lineGeometry.attributes.instanceStart as THREE.InterleavedBufferAttribute).needsUpdate = true;
    (lineGeometry.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).needsUpdate = true;
    lineGeometry.instanceCount = edges.length;

    const material = state.material!;
    material.color.set(color);
    material.opacity = opacity;
    material.linewidth = Math.max(0.01, numberInput(inputs.linewidth, params.linewidth, 1.5));
    material.worldUnits = Boolean(params.worldUnits);
    material.resolution.set(ctx.renderSize?.width ?? 1920, ctx.renderSize?.height ?? 1080);

    state.line!.userData.nodeId = ctx.nodeId;

    return { geometry: state.line!, connectionCount: edges.length };
  },
};
