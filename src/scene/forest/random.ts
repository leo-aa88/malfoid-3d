/** Deterministic randomness: the same seed and world position always give the same forest. */

/** 32-bit integer hash of up to three integers and the seed */
export function hash3(a: number, b: number, c: number, seed: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return h >>> 0;
}

/** small fast PRNG (mulberry32): returns a function giving numbers in [0, 1) */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** value noise in [0, 1], smooth, defined everywhere in world space */
export function noise2(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fz = fade(z - iz);
  const v = (i: number, j: number) => hash3(ix + i, iz + j, 0, seed) / 4294967296;
  const a = v(0, 0) + (v(1, 0) - v(0, 0)) * fx;
  const b = v(0, 1) + (v(1, 1) - v(0, 1)) * fx;
  return a + (b - a) * fz;
}

/** a few octaves of noise2 (scale: size of the biggest features in m), in [0, 1] */
export function fbm(x: number, z: number, scale: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1 / scale;
  for (let o = 0; o < octaves; o++) {
    sum += noise2(x * f, z * f, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
