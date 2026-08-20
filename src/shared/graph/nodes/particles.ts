import * as THREE from "three";
import { NodeDefinition } from "../types";
import { EmitterConfig, ForceFieldDescriptor, buildEmitterConfig, getOrCreateSimulation } from "../particleRuntime";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { growingSockets } from "../dynamicInputs";
import { sampleSurfacePoints } from "../../three/bvh";
import { createPRNG } from "../../math/random";

function asVector(v: unknown, fallback: THREE.Vector3): THREE.Vector3 {
  if (v instanceof THREE.Vector3) return v;
  return fallback;
}

function asColor(v: unknown, fallback: THREE.Color): THREE.Color {
  if (v instanceof THREE.Color) return v;
  return fallback;
}

function numberInput(input: unknown, param: unknown, fallback: number): number {
  const raw = input !== undefined ? input : param;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Hard ceiling on Particle Simulate's texture capacity (256x256 texels).
 * Unclamped, a typo or a dragged-too-far Max Particles field builds a
 * GPUComputationRenderer texture pair sized to whatever was typed —
 * multi-thousand-square textures either exceed the GPU's max texture
 * dimension outright or just allocate hundreds of MB of VRAM per texture,
 * both of which crashed the tab rather than erroring gracefully. Well above
 * any count this app's demos or nodes actually use.
 */
const MAX_PARTICLE_CAPACITY = 65536;

export function clampParticleCapacity(raw: unknown): number {
  return Math.max(1, Math.min(MAX_PARTICLE_CAPACITY, Math.round(Number(raw) || 4096)));
}

/** BIBLE.md's Particle Emitter — spawn rate, initial position/velocity. Pure config bundle, no GPU state of its own. */
export const PARTICLE_EMITTER_NODE: NodeDefinition = {
  type: "particles/emitter",
  label: "Particle Emitter",
  category: "particles",
  inputs: [
    { id: "position", label: "Position", type: "vector" },
    { id: "velocity", label: "Velocity", type: "vector" },
    { id: "spawnRate", label: "Spawn Rate", type: "value" },
    { id: "diameter", label: "Diameter", type: "value" },
    { id: "emit", label: "Emit", type: "value" },
  ],
  outputs: [{ id: "emitter", label: "Emitter", type: "any" }],
  defaultParams: {
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    spawnRate: 200,
    // Matches the jitter magnitude every emitter used before this param
    // existed — 0 here would collapse every respawn onto the exact same
    // point, which reads as a rigid line/lattice rather than a cloud.
    diameter: 0.25,
    emit: 1,
  },
  paramFields: [
    { id: "position", label: "Position (fallback)", kind: "vector" },
    { id: "velocity", label: "Velocity (fallback)", kind: "vector" },
    { id: "spawnRate", label: "Spawn Rate", kind: "number", step: 10 },
    { id: "diameter", label: "Diameter", kind: "number", step: 0.05 },
    { id: "emit", label: "Emit", kind: "boolean" },
  ],
  evaluate: (inputs, params) => {
    const position = asVector(inputs.position, asVector(params.position, new THREE.Vector3()));
    const velocity = asVector(inputs.velocity, asVector(params.velocity, new THREE.Vector3()));
    const spawnRate = numberInput(inputs.spawnRate, params.spawnRate, 200);
    const diameter = Math.max(0, numberInput(inputs.diameter, params.diameter, 0.25));
      // Not a param fallback of 1 by accident: an Emit input left unwired
      // must keep emitting, so the socket only gates when something is
      // actually driving it. Wire an Oscillator, Trigger, Toggle or Compare
      // in to make emission a function of time rather than a constant.
    const emit = numberInput(inputs.emit, params.emit, 1) > 0.5;
    return { emitter: buildEmitterConfig(position, velocity, spawnRate, undefined, diameter, false, emit) };
  },
};

function toNumberList(v: unknown): number[] {
  if (!Array.isArray(v)) return typeof v === "number" ? [v] : [];
  return v.map((x) => Number(x) || 0);
}

interface SeedState {
  lastX?: unknown;
  lastY?: unknown;
  lastZ?: unknown;
  seedPositions?: Float32Array;
}

const seedCache = createNodeCache<SeedState>();

function getSeedState(nodeId: string): SeedState {
  let state = seedCache.get(nodeId);
  if (!state) {
    state = {};
    seedCache.set(nodeId, state);
  }
  return state;
}

/**
 * Particle Emitter (From Points) — wire a Point Cloud's (or CSV Reader's)
 * xValues/yValues/zValues straight in and every respawning particle lands on
 * one of those points instead of the single jittered spot the plain Particle
 * Emitter uses (see EmitterConfig.seedPositions and its respawn branch in
 * POSITION_SHADER). The imported shape becomes the flow field's starting
 * pattern; Particle Simulate takes it from there.
 *
 * Rebuilding the flat seed array is skipped when the three lists are
 * reference-identical to last frame — Point Cloud's own evaluate() already
 * hands back the same array when nothing upstream changed, so this is a
 * no-op most frames rather than a per-frame reallocation.
 */
export const PARTICLE_EMITTER_FROM_POINTS_NODE: NodeDefinition = {
  type: "particles/emitter-from-points",
  label: "Particle Emitter (From Points)",
  category: "particles",
  inputs: [
    { id: "xValues", label: "X Values (List)", type: "list" },
    { id: "yValues", label: "Y Values (List)", type: "list" },
    { id: "zValues", label: "Z Values (List)", type: "list" },
    { id: "velocity", label: "Velocity", type: "vector" },
    { id: "spawnRate", label: "Spawn Rate", type: "value" },
    { id: "emit", label: "Emit", type: "value" },
  ],
  outputs: [{ id: "emitter", label: "Emitter", type: "any" }],
  defaultParams: { velocity: new THREE.Vector3(0, 0, 0), spawnRate: 200, randomSpawnPick: false, emit: 1 },
  paramFields: [
    { id: "velocity", label: "Velocity (fallback)", kind: "vector" },
    {
      id: "randomSpawnPick",
      label: "Random Spawn Point (off = one particle per point)",
      kind: "boolean",
    },
    { id: "emit", label: "Emit", kind: "boolean" },
    {
      id: "spawnRate",
      label: "Spawn Rate",
      kind: "number",
      step: 10,
      // Population size is still the existing rate×lifetime formula (see
      // activeParticleCount in particleRuntime.ts) — seeding only changes
      // *where* a particle respawns, not how many are ever active. Set this
      // so rate×lifetime lands near a multiple of the point count for a
      // clean "every particle owns one point" look.
    },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getSeedState(ctx.nodeId);
    const velocity = asVector(inputs.velocity, asVector(params.velocity, new THREE.Vector3()));
    const spawnRate = numberInput(inputs.spawnRate, params.spawnRate, 200);

    if (state.lastX !== inputs.xValues || state.lastY !== inputs.yValues || state.lastZ !== inputs.zValues) {
      const xValues = toNumberList(inputs.xValues);
      const yValues = toNumberList(inputs.yValues);
      const zValues = toNumberList(inputs.zValues);
      const count = Math.min(xValues.length, yValues.length, zValues.length);
      let seedPositions: Float32Array | undefined;
      if (count > 0) {
        seedPositions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          seedPositions[i * 3] = xValues[i];
          seedPositions[i * 3 + 1] = yValues[i];
          seedPositions[i * 3 + 2] = zValues[i];
        }
      }
      state.lastX = inputs.xValues;
      state.lastY = inputs.yValues;
      state.lastZ = inputs.zValues;
      state.seedPositions = seedPositions;
    }

    return {
      emitter: buildEmitterConfig(
        new THREE.Vector3(),
        velocity,
        spawnRate,
        state.seedPositions,
        undefined,
        params.randomSpawnPick === true,
        numberInput(inputs.emit, params.emit, 1) > 0.5,
      ),
    };
  },
};

/**
 * Particle Emitter (From Surface) — the geometry-driven sibling of Particle
 * Emitter (From Points): area-weighted-samples the input geometry's surface
 * (sampleSurfacePoints, the same BVH-accelerated sampler Sample Surface and
 * Random Vector already use) into a pool of seed positions, then hands them
 * to Particle Simulate exactly like an imported point cloud would
 * (EmitterConfig.seedPositions). Re-sampled every evaluate() rather than
 * cached by input reference: the geometry socket typically carries the
 * *same* THREE.Object3D across frames even while it moves or deforms (a
 * Transform/Wiggle upstream mutates its pose or vertices in place, it
 * doesn't hand back a new object each frame), so caching on reference
 * equality would silently freeze the emission surface in its first pose.
 * Cheap at this node's target pool size (a few hundred points).
 */
export const PARTICLE_EMITTER_FROM_SURFACE_NODE: NodeDefinition = {
  type: "particles/emitter-from-surface",
  label: "Particle Emitter (From Surface)",
  category: "particles",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "velocity", label: "Velocity", type: "vector" },
    { id: "spawnRate", label: "Spawn Rate", type: "value" },
    { id: "points", label: "Surface Points", type: "value" },
    { id: "seed", label: "Seed", type: "value" },
    { id: "emit", label: "Emit", type: "value" },
  ],
  outputs: [{ id: "emitter", label: "Emitter", type: "any" }],
  defaultParams: {
    velocity: new THREE.Vector3(0, 0, 0),
    spawnRate: 200,
    points: 200,
    seed: 1,
    // Default on: a surface emitter binding each particle to a fixed sample
    // point makes every particle retrace one identical path per life, which
    // reads as a handful of streaks rather than a surface emitting.
    randomSpawnPick: true,
    emit: 1,
  },
  paramFields: [
    { id: "velocity", label: "Velocity (fallback)", kind: "vector" },
    { id: "spawnRate", label: "Spawn Rate", kind: "number", step: 10 },
    { id: "points", label: "Surface Points", kind: "number", step: 10 },
    { id: "randomSpawnPick", label: "Random Spawn Point", kind: "boolean" },
    { id: "emit", label: "Emit", kind: "boolean" },
    { id: "seed", label: "Seed", kind: "number", step: 1 },
  ],
  evaluate: (inputs, params) => {
    const object = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    const velocity = asVector(inputs.velocity, asVector(params.velocity, new THREE.Vector3()));
    const spawnRate = numberInput(inputs.spawnRate, params.spawnRate, 200);

    if (!object) {
      return {
        emitter: buildEmitterConfig(
          new THREE.Vector3(),
          velocity,
          spawnRate,
          undefined,
          undefined,
          false,
          numberInput(inputs.emit, params.emit, 1) > 0.5,
        ),
      };
    }

    const pointCount = Math.max(1, Math.min(20000, Math.round(numberInput(inputs.points, params.points, 200))));
    const seed = numberInput(inputs.seed, params.seed, 1);

    const prng = createPRNG(seed);
    const { positions } = sampleSurfacePoints(object, pointCount, prng);

    const seedPositions = new Float32Array(positions.length * 3);
    positions.forEach((p, i) => {
      seedPositions[i * 3] = p.x;
      seedPositions[i * 3 + 1] = p.y;
      seedPositions[i * 3 + 2] = p.z;
    });

    return {
      emitter: buildEmitterConfig(
        new THREE.Vector3(),
        velocity,
        spawnRate,
        seedPositions,
        undefined,
        params.randomSpawnPick !== false,
        numberInput(inputs.emit, params.emit, 1) > 0.5,
      ),
    };
  },
};

/** Prefix for particles/simulate's growing "Force Field N" sockets — see FIELD_INPUTS and dynamicInputs below. */
const FIELD_PREFIX = "field";

const FIELD_INPUTS: NodeDefinition["inputs"] = [
  { id: "emitter", label: "Emitter", type: "any" },
  { id: "gravity", label: "Gravity", type: "value" },
  { id: "wind", label: "Wind", type: "vector" },
  { id: "lifetime", label: "Lifetime", type: "value" },
  { id: "flowStrength", label: "Flow Field Strength", type: "value" },
  { id: "flowScale", label: "Flow Field Scale", type: "value" },
  { id: "flowSpeed", label: "Flow Field Speed", type: "value" },
  { id: "boundsRadius", label: "Bounds Radius", type: "value" },
  { id: "maxSpeed", label: "Max Speed", type: "value" },
];

/** BIBLE.md's Particle Simulate — the update shader: gravity, wind, lifetime. Owns the GPUComputationRenderer, see particleRuntime.ts. */
export const PARTICLE_SIMULATE_NODE: NodeDefinition = {
  type: "particles/simulate",
  label: "Particle Simulate",
  category: "particles",
  inputs: [...FIELD_INPUTS, { id: `${FIELD_PREFIX}0`, label: "Force Field 1", type: "any" }],
  // Force fields (particles/force-field) grow the same way Merge's "In N"
  // sockets do — always exactly one empty one to drag the next wire into.
  dynamicInputs: (connections) => [
    ...FIELD_INPUTS,
    ...growingSockets(connections, FIELD_PREFIX, (i) => ({
      id: `${FIELD_PREFIX}${i}`,
      label: `Force Field ${i + 1}`,
      type: "any" as const,
    })),
  ],
  outputs: [
    { id: "positions", label: "Positions", type: "texture" },
    { id: "count", label: "Count", type: "value" },
  ],
  defaultParams: {
    gravity: 5,
    wind: new THREE.Vector3(0, 0, 0),
    lifetime: 3,
    count: 4096,
    // Off by default (0 strength) — every existing graph that only wires
    // gravity/wind keeps behaving exactly as before.
    flowStrength: 0,
    flowScale: 1,
    flowSpeed: 0.1,
    // 0 = unbounded, same as before this param existed.
    boundsRadius: 0,
    // 0 = unclamped, same as before this param existed. Worth setting once
    // Flow Field Strength is non-zero — an accelerating force with no drag
    // otherwise grows velocity without bound (see maxSpeed's comment in
    // particleRuntime.ts's VELOCITY_SHADER).
    maxSpeed: 0,
  },
  paramFields: [
    { id: "gravity", label: "Gravity", kind: "number", step: 0.5 },
    { id: "wind", label: "Wind (fallback)", kind: "vector" },
    { id: "lifetime", label: "Lifetime (s)", kind: "number", step: 0.5 },
    { id: "count", label: "Max Particles (capped at 65536)", kind: "number", step: 100 },
    { id: "flowStrength", label: "Flow Field Strength", kind: "number", step: 0.5, group: "Flow Field" },
    { id: "flowScale", label: "Flow Field Scale", kind: "number", step: 0.1, group: "Flow Field" },
    { id: "flowSpeed", label: "Flow Field Speed", kind: "number", step: 0.05, group: "Flow Field" },
    { id: "boundsRadius", label: "Bounds Radius (0 = unbounded)", kind: "number", step: 0.5, group: "Flow Field" },
    { id: "maxSpeed", label: "Max Speed (0 = unclamped)", kind: "number", step: 0.5, group: "Flow Field" },
  ],
  evaluate: (inputs, params, ctx) => {
    const emitter = inputs.emitter as EmitterConfig | undefined;
    if (!emitter) return { positions: null, count: 0 };

    const gravity = numberInput(inputs.gravity, params.gravity, 5);
    const wind = asVector(inputs.wind, asVector(params.wind, new THREE.Vector3()));
    const lifetime = numberInput(inputs.lifetime, params.lifetime, 3);
    const capacity = clampParticleCapacity(params.count);
    const flowField = {
      strength: numberInput(inputs.flowStrength, params.flowStrength, 0),
      scale: numberInput(inputs.flowScale, params.flowScale, 1),
      speed: numberInput(inputs.flowSpeed, params.flowSpeed, 0.1),
    };
    const boundsRadius = numberInput(inputs.boundsRadius, params.boundsRadius, 0);
    const maxSpeed = numberInput(inputs.maxSpeed, params.maxSpeed, 0);
    // Sorted by socket index rather than trusting object key order — plain
    // objects don't guarantee it for non-integer-looking keys like "field10".
    const forces = Object.entries(inputs)
      .filter(([key, value]) => key.startsWith(FIELD_PREFIX) && value)
      .sort(([a], [b]) => Number(a.slice(FIELD_PREFIX.length)) - Number(b.slice(FIELD_PREFIX.length)))
      .map(([, value]) => value as ForceFieldDescriptor);

    const result = getOrCreateSimulation(
      ctx.nodeId,
      ctx.renderer,
      capacity,
      emitter,
      gravity,
      wind,
      lifetime,
      ctx.step,
      flowField,
      boundsRadius,
      maxSpeed,
      forces,
    );
    if (!result) return { positions: null, count: 0 };
    return { positions: result.positionsTexture, count: result.capacity };
  },
};

const POINT_VERTEX_SHADER = /* glsl */ `
  uniform sampler2D positions;
  uniform float pointSize;
  attribute vec2 reference;
  varying float vAlive;

  void main() {
    vec4 data = texture2D(positions, reference);
    vAlive = data.a >= 0.0 ? 1.0 : 0.0;
    vec4 mvPosition = modelViewMatrix * vec4(data.xyz, 1.0);
    gl_PointSize = vAlive * pointSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const POINT_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 color;
  uniform sampler2D sprite;
  uniform float useSprite;
  varying float vAlive;

  void main() {
    if (vAlive < 0.5) discard;
    // useSprite gates whether the sampled texel is used at all — sampling an
    // unbound uniform when useSprite is 0 is harmless, its result is thrown away.
    vec4 texel = useSprite > 0.5 ? texture2D(sprite, gl_PointCoord) : vec4(1.0);
    float alpha = useSprite > 0.5 ? texel.a : smoothstep(0.5, 0.3, distance(gl_PointCoord, vec2(0.5)));
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color * texel.rgb, alpha);
  }
`;

/** Bundled sprite presets from public/img — shared across every Particle Render instance, loaded once per key. */
const SPRITE_PATHS: Record<string, string> = {
  circle: "/img/circle.png",
  fire: "/img/fire.png",
  smoke: "/img/smoke.png",
  "rad-grad": "/img/rad-grad.png",
};

const spriteTextureCache = new Map<string, THREE.Texture>();

function getSpriteTexture(key: string): THREE.Texture | null {
  const path = SPRITE_PATHS[key];
  if (!path) return null;
  const existing = spriteTextureCache.get(key);
  if (existing) return existing;
  const texture = new THREE.TextureLoader().load(path);
  spriteTextureCache.set(key, texture);
  return texture;
}

interface PointsEntry {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  count: number;
}

const pointsCache = createNodeCache<PointsEntry>((e) => disposeObject3D(e.points));

/** One vertex per particle, carrying only a `reference` UV into the positions texture — the standard three.js GPGPU-points technique. Rebuilt only when `count` changes. */
function buildPoints(count: number): PointsEntry {
  const size = Math.max(1, Math.round(Math.sqrt(count)));
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const reference = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    reference[i * 2] = (i % size) / size;
    reference[i * 2 + 1] = Math.floor(i / size) / size;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("reference", new THREE.BufferAttribute(reference, 2));

  const material = new THREE.ShaderMaterial({
    vertexShader: POINT_VERTEX_SHADER,
    fragmentShader: POINT_FRAGMENT_SHADER,
    uniforms: {
      positions: { value: null },
      pointSize: { value: 4 },
      color: { value: new THREE.Color(0xffffff) },
      sprite: { value: null },
      useSprite: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, material, count };
}

/** BIBLE.md's Particle Render — draws the cloud (points/sprites). */
export const PARTICLE_RENDER_NODE: NodeDefinition = {
  type: "particles/render",
  label: "Particle Render",
  category: "particles",
  inputs: [
    { id: "positions", label: "Positions", type: "texture" },
    { id: "count", label: "Count", type: "value" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { size: 4, color: new THREE.Color(0xffffff), sprite: "circle" },
  paramFields: [
    { id: "size", label: "Point Size", kind: "number", step: 0.5 },
    { id: "color", label: "Color", kind: "color" },
    { id: "sprite", label: "Sprite", kind: "select", options: ["none", "circle", "fire", "smoke", "rad-grad"] },
  ],
  evaluate: (inputs, params, ctx) => {
    const count = typeof inputs.count === "number" && inputs.count > 0 ? inputs.count : 0;
    let entry = pointsCache.get(ctx.nodeId);
    if (!entry || entry.count !== count) {
      entry = buildPoints(count);
      pointsCache.set(ctx.nodeId, entry);
    }

    const spriteKey = typeof params.sprite === "string" ? params.sprite : "circle";
    const spriteTexture = spriteKey === "none" ? null : getSpriteTexture(spriteKey);

    entry.material.uniforms.positions.value = inputs.positions instanceof THREE.Texture ? inputs.positions : null;
    entry.material.uniforms.pointSize.value = Number(params.size) || 4;
    entry.material.uniforms.color.value = asColor(params.color, new THREE.Color(0xffffff));
    entry.material.uniforms.sprite.value = spriteTexture;
    entry.material.uniforms.useSprite.value = spriteTexture ? 1 : 0;

    return { geometry: entry.points };
  },
};
