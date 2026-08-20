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
  uniform float boundsRadius;

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
    // A particle that has drifted past the bounds radius is treated as if it
    // had just aged out — it respawns through the exact same jittered-emitter
    // path below, so there is only one spawn rule to keep in sync rather than
    // a second copy of it guarded by a distance check.
    if (boundsRadius > 0.0 && length(pos.rgb) > boundsRadius) {
      age = lifetime + 1.0;
    }
    if (age > lifetime) {
      float seed = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
      vec3 jitter = (vec3(seed, fract(seed * 7.0), fract(seed * 13.0)) - 0.5) * 0.25;
      gl_FragColor = vec4(emitterPosition + jitter, age - lifetime);
    } else {
      gl_FragColor = vec4(pos.rgb + vel.rgb * delta, age);
    }
  }
`;

/**
 * Ashima Arts / Stefan Gustavson's analytic-derivative 3D simplex noise
 * (webgl-noise, MIT) — same public-domain-grade algorithm every curl-noise
 * flow field in the field uses (Book of Shaders, countless Genuary/shader
 * demos), reimplemented here rather than copied from any one of them.
 * Returns (gradient.xyz, value) in one evaluation, which is what makes curl
 * noise cheap: curl needs the gradient, not the value, and a derivative-free
 * noise would need 6 extra taps (finite differences) to approximate it.
 */
const SIMPLEX_GRADIENT_NOISE_GLSL = /* glsl */ `
  vec3 mod289v3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289v4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute289(vec4 x) { return mod289v4(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  vec4 simplexGrad(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289v3(i);
    vec4 p = permute289(permute289(permute289(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 g0 = vec3(a0.xy, h.x);
    vec3 g1 = vec3(a0.zw, h.y);
    vec3 g2 = vec3(a1.xy, h.z);
    vec3 g3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(g0, g0), dot(g1, g1), dot(g2, g2), dot(g3, g3)));
    g0 *= norm.x; g1 *= norm.y; g2 *= norm.z; g3 *= norm.w;

    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    vec4 m2 = m * m;
    vec4 m4 = m2 * m2;

    vec4 pdotx = vec4(dot(g0, x0), dot(g1, x1), dot(g2, x2), dot(g3, x3));

    float value = 42.0 * dot(m4, pdotx);

    vec4 temp = m2 * m * pdotx;
    vec3 gradient = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
    gradient += m4.x * g0 + m4.y * g1 + m4.z * g2 + m4.w * g3;
    gradient *= 42.0;

    return vec4(gradient, value);
  }

  /**
   * Curl of a vector potential built from 3 independent noise channels (the
   * Bridson/McEwan trick: sample the *same* scalar field at 3 widely-offset
   * points instead of building 3 truly independent fields — one evaluation
   * each is enough because the offsets already decorrelate them). The result
   * is divergence-free by construction, which is what keeps particles
   * flowing rather than clumping or blowing apart at sinks/sources — a
   * scalar field's raw gradient would do both.
   *
   * \`time\` is folded into the sample position (not a 4th noise dimension —
   * that needs a whole extra derivative to carry through) so the field
   * itself drifts, rather than each particle just riding a fixed field
   * faster.
   */
  vec3 curlNoise(vec3 p, float noiseScale, float speed, float time) {
    vec3 offsetY = vec3(31.416, -47.853, 12.793);
    vec3 offsetZ = vec3(-233.145, -113.408, 71.996);
    vec3 drift = vec3(time * speed);

    vec3 gx = simplexGrad((p) * noiseScale + drift).xyz;
    vec3 gy = simplexGrad((p + offsetY) * noiseScale + drift).xyz;
    vec3 gz = simplexGrad((p + offsetZ) * noiseScale + drift).xyz;

    return vec3(gy.z - gz.y, gz.x - gx.z, gx.y - gy.x);
  }
`;

const VELOCITY_SHADER = /* glsl */ `
  uniform float delta;
  uniform float gravity;
  uniform vec3 wind;
  uniform float lifetime;
  uniform float activeCount;
  uniform vec3 emitterVelocity;
  uniform float noiseStrength;
  uniform float noiseScale;
  uniform float noiseSpeed;
  uniform float time;
  uniform float maxSpeed;

  ${SIMPLEX_GRADIENT_NOISE_GLSL}

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
      vec3 flow = noiseStrength > 0.0
        ? curlNoise(pos.rgb, noiseScale, noiseSpeed, time) * noiseStrength
        : vec3(0.0);
      vec3 v = vel.rgb + vec3(0.0, -gravity, 0.0) * delta + wind * delta + flow * delta;
      // Pure integration with no drag term — an accelerating force (the flow
      // field, but gravity/wind too given enough lifetime) would otherwise
      // grow v without bound. maxSpeed <= 0.0 keeps the old unclamped
      // behavior, so a graph that only ever used gravity/wind (where the
      // scene's own lifetime already kept speeds in a sane range) renders
      // identically to before this param existed.
      if (maxSpeed > 0.0) {
        float speed = length(v);
        if (speed > maxSpeed) v *= maxSpeed / speed;
      }
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
  /**
   * The flow field's own clock, in seconds — advanced by STEP_SECONDS once
   * per `compute()` call rather than read from ctx.time, so a run of capped
   * catch-up steps (see MAX_STEPS_PER_FRAME) still sees the field evolve one
   * fixed increment per step instead of jumping straight to wall-clock time.
   */
  simSeconds: number;
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
  positionVar.material.uniforms.boundsRadius = { value: 0 };
  velocityVar.material.uniforms.emitterVelocity = { value: new THREE.Vector3() };
  velocityVar.material.uniforms.gravity = { value: 0 };
  velocityVar.material.uniforms.wind = { value: new THREE.Vector3() };
  velocityVar.material.uniforms.noiseStrength = { value: 0 };
  velocityVar.material.uniforms.noiseScale = { value: 1 };
  velocityVar.material.uniforms.noiseSpeed = { value: 0.1 };
  velocityVar.material.uniforms.time = { value: 0 };
  velocityVar.material.uniforms.maxSpeed = { value: 0 };

  const error = gpuCompute.init();
  if (error) console.error(`particles/simulate (${nodeId}): GPUComputationRenderer init failed — ${error}`);

  const sim: Simulation = {
    gpuCompute,
    renderer,
    positionVar,
    velocityVar,
    size,
    lastSteppedStep: currentStep,
    simSeconds: currentStep * STEP_SECONDS,
  };
  simCache.set(nodeId, sim);
  return sim;
}

const MAX_STEPS_PER_FRAME = 240;

export interface SimulationResult {
  positionsTexture: THREE.Texture;
  capacity: number;
}

/** Curl-noise flow field force — see curlNoise() in VELOCITY_SHADER. Strength 0 skips the noise entirely. */
export interface FlowFieldConfig {
  strength: number;
  scale: number;
  speed: number;
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
  flowField: FlowFieldConfig = { strength: 0, scale: 1, speed: 0.1 },
  boundsRadius = 0,
  maxSpeed = 0,
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
  sim.positionVar.material.uniforms.boundsRadius.value = Math.max(0, boundsRadius);
  sim.velocityVar.material.uniforms.emitterVelocity.value.copy(emitter.velocity);
  sim.velocityVar.material.uniforms.gravity.value = gravity;
  sim.velocityVar.material.uniforms.wind.value.copy(wind);
  sim.velocityVar.material.uniforms.noiseStrength.value = flowField.strength;
  sim.velocityVar.material.uniforms.noiseScale.value = flowField.scale;
  sim.velocityVar.material.uniforms.noiseSpeed.value = flowField.speed;
  sim.velocityVar.material.uniforms.maxSpeed.value = Math.max(0, maxSpeed);

  const steps = stepsSince(sim.lastSteppedStep, currentStep, MAX_STEPS_PER_FRAME);
  for (let i = 0; i < steps; i++) {
    sim.velocityVar.material.uniforms.time.value = sim.simSeconds;
    sim.simSeconds += STEP_SECONDS;
    sim.gpuCompute.compute();
  }
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
