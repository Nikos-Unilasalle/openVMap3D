import * as THREE from "three";

/**
 * Deterministic coherent noise and Fractal Brownian Motion (fBm) generator
 * based on Jacques Lucke's Animation Nodes noise algorithms.
 */

// Gradient hashing function for 1D/2D/3D lattice points
function hash1D(n: number): number {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * 1D Gradient Noise with C2 quintic smoothstep interpolation.
 * Returns smooth coherent noise in [-1, 1].
 */
export function simplexNoise1D(t: number, seed = 0): number {
  const s = t + seed * 100.1337;
  const i0 = Math.floor(s);
  const i1 = i0 + 1;
  const f = s - i0;

  // Quintic smoothstep: 6f^5 - 15f^4 + 10f^3
  const u = f * f * f * (f * (f * 6 - 15) + 10);

  // Gradients at lattice points [-1, 1]
  const g0 = hash1D(i0 * 12.9898 + seed * 78.233) * 2 - 1;
  const g1 = hash1D(i1 * 12.9898 + seed * 78.233) * 2 - 1;

  // Extrapolate and blend
  const v0 = g0 * f;
  const v1 = g1 * (f - 1);

  return (v0 + u * (v1 - v0)) * 2.0;
}

/**
 * 1D Fractal Brownian Motion (fBm) with configurable octaves, persistence, and lacunarity.
 * Normalizes output to [-1, 1].
 */
export function fbm1D(
  t: number,
  seed = 0,
  octaves = 3,
  persistance = 0.5,
  lacunarity = 2.0
): number {
  const oct = Math.max(1, Math.min(8, Math.round(octaves)));
  let total = 0;
  let frequency = 1.0;
  let amplitude = 1.0;
  let maxValue = 0;

  for (let i = 0; i < oct; i++) {
    total += simplexNoise1D(t * frequency, seed + i * 133.71) * amplitude;
    maxValue += amplitude;
    amplitude *= persistance;
    frequency *= lacunarity;
  }

  return maxValue > 0 ? total / maxValue : 0;
}

/**
 * 3D Fractal Brownian Motion (fBm) generating 3 decorrelated noise coordinates.
 * Returns Vector3 with each component normalized to [-1, 1].
 */
export function fbm3D(
  t: number,
  seed = 0,
  octaves = 3,
  persistance = 0.5,
  lacunarity = 2.0
): THREE.Vector3 {
  const x = fbm1D(t, seed, octaves, persistance, lacunarity);
  const y = fbm1D(t, seed + 1000.37, octaves, persistance, lacunarity);
  const z = fbm1D(t, seed + 2000.73, octaves, persistance, lacunarity);
  return new THREE.Vector3(x, y, z);
}
