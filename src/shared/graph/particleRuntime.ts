import { GPUComputationRenderer, Variable } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import * as THREE from "three";
import { STEP_SECONDS, stepsSince } from "./clock";
import { createNodeCache } from "./nodeCaches";

/**
 * GPGPU particle pipeline per BIBLE.md: particle state (position, velocity,
 * age) lives in floating-point textures, updated by a fragment shader,
 * ping-ponged between two render targets — three.js's own established
 * pattern for this (GPUComputationRenderer), not a CPU array, to stay cheap
 * at scale.
 *
 * Population size follows the standard steady-state relation
 * population = spawnRate × lifetime (see activeParticleCount) rather than
 * tracking individual spawn timers — every texel below that count cycles
 * itself (age exceeds lifetime → respawn at the emitter) independently, no
 * shared spawn queue needed; texels above it stay permanently parked. Both
 * the position and velocity shaders recompute the same respawn condition
 * from the same inputs (age, delta, lifetime) — deterministic per texel, so
 * they agree without talking to each other.
 */

/** Smallest square texture whose texel count covers `capacity` particles. */
export function textureSizeFor(capacity: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(0, capacity))));
}

export interface EmitterConfig {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  spawnRate: number;
}

export function buildEmitterConfig(position: THREE.Vector3, velocity: THREE.Vector3, spawnRate: number): EmitterConfig {
  return { position, velocity, spawnRate };
}

/** How many of `capacity` texels are actually alive-capable — population = rate × lifetime, capped. */
export function activeParticleCount(spawnRate: number, lifetime: number, capacity: number): number {
  if (!Number.isFinite(spawnRate) || !Number.isFinite(lifetime) || lifetime <= 0) return 0;
  return Math.min(capacity, Math.max(0, Math.round(spawnRate * lifetime)));
}

const POSITION_SHADER = /* glsl */ `
  uniform float delta;
  uniform float lifetime;
  uniform float activeCount;
  uniform vec3 emitterPosition;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 pos = texture2D(texturePosition, uv);
    vec4 vel = texture2D(textureVelocity, uv);
    float idx = floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x);

    if (idx >= activeCount) {
      gl_FragColor = vec4(pos.rgb, -1.0e6);
      return;
    }

    float age = pos.a + delta;
    if (age > lifetime) {
      float seed = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
      vec3 jitter = (vec3(seed, fract(seed * 7.0), fract(seed * 13.0)) - 0.5) * 0.25;
      gl_FragColor = vec4(emitterPosition + jitter, age - lifetime);
    } else {
      gl_FragColor = vec4(pos.rgb + vel.rgb * delta, age);
    }
  }
`;

const VELOCITY_SHADER = /* glsl */ `
  uniform float delta;
  uniform float gravity;
  uniform vec3 wind;
  uniform float lifetime;
  uniform float activeCount;
  uniform vec3 emitterVelocity;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 pos = texture2D(texturePosition, uv);
    vec4 vel = texture2D(textureVelocity, uv);
    float idx = floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x);

    if (idx >= activeCount) {
      gl_FragColor = vec4(0.0);
      return;
    }

    float age = pos.a + delta;
    if (age > lifetime) {
      float seed = fract(sin(dot(uv, vec2(93.9898, 47.233))) * 24634.6345);
      vec3 jitter = (vec3(seed, fract(seed * 5.0), fract(seed * 11.0)) - 0.5) * 0.5;
      gl_FragColor = vec4(emitterVelocity + jitter, 0.0);
    } else {
      vec3 v = vel.rgb + vec3(0.0, -gravity, 0.0) * delta + wind * delta;
      gl_FragColor = vec4(v, 0.0);
    }
  }
`;

interface Simulation {
  gpuCompute: GPUComputationRenderer;
  /**
   * The renderer the GPUComputationRenderer was built against. Its render
   * targets live in *that* WebGL context, so a second viewport (the output
   * window, or the offscreen export viewport) reading them would sample an
   * empty texture. Rebuilding when the renderer changes hands the sim to
   * whoever is evaluating now instead of silently rendering nothing.
   */
  renderer: THREE.WebGLRenderer;
  positionVar: Variable;
  velocityVar: Variable;
  size: number;
  lastSteppedStep: number;
}

const simCache = createNodeCache<Simulation>((s) => s.gpuCompute.dispose());
let warnedMissingRenderer = false;

function initialPositionTexture(gpuCompute: GPUComputationRenderer, size: number, lifetimeGuess: number): THREE.DataTexture {
  const texture = gpuCompute.createTexture();
  const data = texture.image.data as Float32Array;
  const capacity = size * size;
  for (let i = 0; i < capacity; i++) {
    // Staggered negative age so particles don't all burst on frame 1 — spread
    // across one lifetime's worth of "already elapsed" time.
    data[i * 4 + 3] = -((i / capacity) * lifetimeGuess);
  }
  return texture;
}

function createSimulation(nodeId: string, renderer: THREE.WebGLRenderer, size: number, lifetimeGuess: number, currentStep: number): Simulation {
  const gpuCompute = new GPUComputationRenderer(size, size, renderer);
  const position0 = initialPositionTexture(gpuCompute, size, lifetimeGuess);
  const velocity0 = gpuCompute.createTexture();

  const positionVar = gpuCompute.addVariable("texturePosition", POSITION_SHADER, position0);
  const velocityVar = gpuCompute.addVariable("textureVelocity", VELOCITY_SHADER, velocity0);
  gpuCompute.setVariableDependencies(positionVar, [positionVar, velocityVar]);
  gpuCompute.setVariableDependencies(velocityVar, [positionVar, velocityVar]);

  for (const uniforms of [positionVar.material.uniforms, velocityVar.material.uniforms]) {
    uniforms.delta = { value: STEP_SECONDS };
    uniforms.lifetime = { value: lifetimeGuess };
    uniforms.activeCount = { value: 0 };
  }
  positionVar.material.uniforms.emitterPosition = { value: new THREE.Vector3() };
  velocityVar.material.uniforms.emitterVelocity = { value: new THREE.Vector3() };
  velocityVar.material.uniforms.gravity = { value: 0 };
  velocityVar.material.uniforms.wind = { value: new THREE.Vector3() };

  const error = gpuCompute.init();
  if (error) console.error(`particles/simulate (${nodeId}): GPUComputationRenderer init failed — ${error}`);

  const sim: Simulation = { gpuCompute, renderer, positionVar, velocityVar, size, lastSteppedStep: currentStep };
  simCache.set(nodeId, sim);
  return sim;
}

const MAX_STEPS_PER_FRAME = 240;

export interface SimulationResult {
  positionsTexture: THREE.Texture;
  capacity: number;
}

/**
 * Renderer-less contexts (tests, a headless evaluate call) get a one-time
 * warning and no texture rather than a thrown error — same "degrade
 * gracefully, log once" contract as EvalContext.renderer's own doc.
 */
export function getOrCreateSimulation(
  nodeId: string,
  renderer: THREE.WebGLRenderer | undefined,
  capacity: number,
  emitter: EmitterConfig,
  gravity: number,
  wind: THREE.Vector3,
  lifetime: number,
  currentStep: number,
): SimulationResult | null {
  if (!renderer) {
    if (!warnedMissingRenderer) {
      console.error("particles/simulate: no WebGLRenderer in EvalContext — particle simulation skipped");
      warnedMissingRenderer = true;
    }
    return null;
  }

  const size = textureSizeFor(capacity);
  let sim = simCache.get(nodeId);
  // A clock that jumped *backwards* — the timeline scrubbed back, or a video
  // export restarting at frame 0 after the preview already ran — can't be
  // caught up by stepping forward, and leaving the sim where it was made the
  // first exported frames show a simulation that is minutes old. Rebuilding
  // restarts it from the same deterministic initial state every time.
  const rewound = sim !== undefined && currentStep < sim.lastSteppedStep;
  if (!sim || sim.size !== size || sim.renderer !== renderer || rewound) {
    if (sim) {
      sim.gpuCompute.dispose();
    }
    sim = createSimulation(nodeId, renderer, size, lifetime, currentStep);
  }

  const active = activeParticleCount(emitter.spawnRate, lifetime, size * size);
  for (const uniforms of [sim.positionVar.material.uniforms, sim.velocityVar.material.uniforms]) {
    uniforms.lifetime.value = lifetime;
    uniforms.activeCount.value = active;
  }
  sim.positionVar.material.uniforms.emitterPosition.value.copy(emitter.position);
  sim.velocityVar.material.uniforms.emitterVelocity.value.copy(emitter.velocity);
  sim.velocityVar.material.uniforms.gravity.value = gravity;
  sim.velocityVar.material.uniforms.wind.value.copy(wind);

  const steps = stepsSince(sim.lastSteppedStep, currentStep, MAX_STEPS_PER_FRAME);
  for (let i = 0; i < steps; i++) sim.gpuCompute.compute();
  sim.lastSteppedStep += steps;

  return {
    positionsTexture: sim.gpuCompute.getCurrentRenderTarget(sim.positionVar).texture,
    capacity: size * size,
  };
}

/**
 * Disposes every cached GPU simulation (render targets, shader materials)
 * and drops the cache, so the next evaluate() rebuilds fresh — what a
 * viewport "reset simulation" control calls. Actually frees GPU resources
 * rather than just dropping references: a reset control is expected to be
 * clicked repeatedly while iterating, and GPUComputationRenderer owns real
 * WebGLRenderTargets that won't otherwise be reclaimed until the renderer
 * itself is torn down.
 */
export function resetAllParticleSimulations(): void {
  for (const sim of simCache.values()) sim.gpuCompute.dispose();
  simCache.clear();
}
