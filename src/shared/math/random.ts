/**
 * Deterministic Seeded Pseudo-Random Number Generator (PRNG) library for Tsuji.
 * Supports Mulberry32, Gaussian (Box-Muller), 1D Noise, and Exponential distributions.
 */

/**
 * Mulberry32 32-bit seeded PRNG generator.
 * Returns a function that outputs deterministic float values in [0, 1).
 */
export function createPRNG(seed: number): () => number {
  let s = (seed | 0) ^ 0x12345678;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 8), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform random number between min and max */
export function randomUniform(rng: () => number, min = 0, max = 1): number {
  return min + rng() * (max - min);
}

/** Gaussian (Normal) distribution using Box-Muller transform */
export function randomGaussian(rng: () => number, mean = 0.5, stdDev = 0.15): number {
  let u1 = rng();
  let u2 = rng();
  while (u1 <= Number.EPSILON) u1 = rng();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z0 * stdDev;
}

/** Exponential distribution */
export function randomExponential(rng: () => number, lambda = 1): number {
  let u = rng();
  while (u <= Number.EPSILON) u = rng();
  return -Math.log(1 - u) / Math.max(0.0001, lambda);
}

/** Simple 1D smooth gradient noise based on seed offset */
export function randomNoise1D(seed: number, t: number): number {
  const x = seed + t * 0.5;
  const xi = Math.floor(x);
  const xf = x - xi;
  const u = xf * xf * (3 - 2 * xf);

  const hash0 = Math.sin(xi * 12.9898 + seed * 78.233) * 43758.5453;
  const hash1 = Math.sin((xi + 1) * 12.9898 + seed * 78.233) * 43758.5453;

  const g0 = (hash0 - Math.floor(hash0)) * 2 - 1;
  const g1 = (hash1 - Math.floor(hash1)) * 2 - 1;

  return 0.5 + 0.5 * (g0 + u * (g1 - g0));
}
