import * as THREE from "three";
import { NodeDefinition } from "../types";
import { EmitterConfig, buildEmitterConfig, getOrCreateSimulation } from "../particleRuntime";
import { createNodeCache, disposeObject3D } from "../nodeCaches";

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

/** BIBLE.md's Particle Emitter — spawn rate, initial position/velocity. Pure config bundle, no GPU state of its own. */
export const PARTICLE_EMITTER_NODE: NodeDefinition = {
  type: "particles/emitter",
  label: "Particle Emitter",
  category: "particles",
  inputs: [
    { id: "position", label: "Position", type: "vector" },
    { id: "velocity", label: "Velocity", type: "vector" },
    { id: "spawnRate", label: "Spawn Rate", type: "value" },
  ],
  outputs: [{ id: "emitter", label: "Emitter", type: "any" }],
  defaultParams: { position: new THREE.Vector3(0, 0, 0), velocity: new THREE.Vector3(0, 0, 0), spawnRate: 200 },
  paramFields: [
    { id: "position", label: "Position (fallback)", kind: "vector" },
    { id: "velocity", label: "Velocity (fallback)", kind: "vector" },
    { id: "spawnRate", label: "Spawn Rate", kind: "number", step: 10 },
  ],
  evaluate: (inputs, params) => {
    const position = asVector(inputs.position, asVector(params.position, new THREE.Vector3()));
    const velocity = asVector(inputs.velocity, asVector(params.velocity, new THREE.Vector3()));
    const spawnRate = numberInput(inputs.spawnRate, params.spawnRate, 200);
    return { emitter: buildEmitterConfig(position, velocity, spawnRate) };
  },
};

/** BIBLE.md's Particle Simulate — the update shader: gravity, wind, lifetime. Owns the GPUComputationRenderer, see particleRuntime.ts. */
export const PARTICLE_SIMULATE_NODE: NodeDefinition = {
  type: "particles/simulate",
  label: "Particle Simulate",
  category: "particles",
  inputs: [
    { id: "emitter", label: "Emitter", type: "any" },
    { id: "gravity", label: "Gravity", type: "value" },
    { id: "wind", label: "Wind", type: "vector" },
    { id: "lifetime", label: "Lifetime", type: "value" },
    { id: "flowStrength", label: "Flow Field Strength", type: "value" },
    { id: "flowScale", label: "Flow Field Scale", type: "value" },
    { id: "flowSpeed", label: "Flow Field Speed", type: "value" },
    { id: "boundsRadius", label: "Bounds Radius", type: "value" },
    { id: "maxSpeed", label: "Max Speed", type: "value" },
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
    { id: "count", label: "Max Particles", kind: "number", step: 100 },
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
    const capacity = Number(params.count) || 4096;
    const flowField = {
      strength: numberInput(inputs.flowStrength, params.flowStrength, 0),
      scale: numberInput(inputs.flowScale, params.flowScale, 1),
      speed: numberInput(inputs.flowSpeed, params.flowSpeed, 0.1),
    };
    const boundsRadius = numberInput(inputs.boundsRadius, params.boundsRadius, 0);
    const maxSpeed = numberInput(inputs.maxSpeed, params.maxSpeed, 0);

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
