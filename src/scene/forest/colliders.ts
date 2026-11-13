import { rng } from './random';
import { ChunkData, TRUNK_RADIUS } from './placement';

/*
 * What a body can't walk through in the forest, as simple shapes on the ground plane: trees
 * (the flared foot of the trunk), large rocks and stumps (circles) and fallen logs (capsules).
 * Roots, grass, bushes, leaves and mushrooms stay walk-through. Pure functions: the same
 * shapes the meshes are built from, no rendering.
 */

/** the trunk's flare at body height (~0.5 m) relative to its base radius (geometry.ts: R + 1.3 R (1 - t)^8) */
export const TRUNK_FOOT = 1.85;
/** rocks smaller than this scale can be stepped over */
export const ROCK_SOLID_SCALE = 0.55;

/** length of a fallen log variant at scale 1 (m): the same random draw geometry.ts uses */
export function logLength(variant: number): number {
  return 3 + rng(6100 + variant * 71)() * 2;
}

export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'capsule'; ax: number; az: number; bx: number; bz: number; r: number };

/** the colliders of one chunk (computed once per chunk and cached by the caller) */
export function chunkColliders(c: ChunkData): Collider[] {
  const out: Collider[] = [];
  for (const t of c.trees) out.push({ kind: 'circle', x: t.x, z: t.z, r: TRUNK_RADIUS[t.variant] * TRUNK_FOOT * t.scale });
  for (const p of c.props) {
    if (p.kind === 'rock' && p.scale >= ROCK_SOLID_SCALE) {
      out.push({ kind: 'circle', x: p.x, z: p.z, r: 0.95 * p.scale });
    } else if (p.kind === 'stump') {
      out.push({ kind: 'circle', x: p.x, z: p.z, r: 0.62 * p.scale });
    } else if (p.kind === 'log') {
      // the log lies along its local x axis, centred; rotating by rot about +y sends x to (cos, -sin)
      const h = (logLength(p.variant) / 2) * p.scale;
      const dx = Math.cos(p.rot) * h;
      const dz = -Math.sin(p.rot) * h;
      out.push({ kind: 'capsule', ax: p.x - dx, az: p.z - dz, bx: p.x + dx, bz: p.z + dz, r: 0.3 * p.scale });
    }
  }
  return out;
}

/**
 * Push a body (feet at x, z, radius r) out of every collider it overlaps; returns the
 * corrected position. Circles push straight out, so a body slides round trunks and rocks.
 */
export function pushOut(x: number, z: number, r: number, colliders: readonly Collider[]): [number, number] {
  for (let pass = 0; pass < 2; pass++) {                 // two passes settle a body wedged between two shapes
    for (const c of colliders) {
      let cx: number;
      let cz: number;
      if (c.kind === 'circle') {
        cx = c.x;
        cz = c.z;
      } else {
        // nearest point on the log's axis
        const sx = c.bx - c.ax;
        const sz = c.bz - c.az;
        const u = Math.max(0, Math.min(1, ((x - c.ax) * sx + (z - c.az) * sz) / (sx * sx + sz * sz)));
        cx = c.ax + sx * u;
        cz = c.az + sz * u;
      }
      const min = c.r + r;
      const ex = x - cx;
      const ez = z - cz;
      const d2 = ex * ex + ez * ez;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-6) {
        x = cx + min;                                    // dead centre: out along +x
        continue;
      }
      x = cx + (ex / d) * min;
      z = cz + (ez / d) * min;
    }
  }
  return [x, z];
}
