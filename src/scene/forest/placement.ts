import type { ForestConfig } from './config';
import { fbm, hash3, rng, smoothstep } from './random';

/*
 * What stands where in one chunk: plain data, generated from the chunk's world position and
 * the seed only, so a chunk is identical every time it is generated (returning to a place
 * shows the same forest). Trees sit on a jittered grid aligned in world space, so chunk
 * borders are invisible.
 */

/** living tree shapes (see geometry.ts), then dead ones */
export const LIVING_VARIANTS = 6;
export const DEAD_VARIANTS = 2;
export const TREE_VARIANTS = LIVING_VARIANTS + DEAD_VARIANTS;
/** trunk radius at the base of each variant at scale 1 (m), used for collision */
export const TRUNK_RADIUS = [0.55, 0.48, 0.62, 0.5, 0.58, 0.45, 0.4, 0.42];

export interface TreeInst {
  variant: number;
  x: number;
  z: number;
  rot: number;
  scale: number;
  /** collision radius of the trunk (m) */
  radius: number;
}

export type PropKind = 'rock' | 'log' | 'stump' | 'mushroom' | 'glowshroom' | 'grass' | 'leaf' | 'bush';
export const PROP_VARIANTS: Record<PropKind, number> = {
  rock: 3, log: 2, stump: 1, mushroom: 1, glowshroom: 1, grass: 2, leaf: 1, bush: 2,
};

export interface PropInst {
  kind: PropKind;
  variant: number;
  x: number;
  z: number;
  rot: number;
  scale: number;
  /** leaves: colour index */
  tint?: number;
}

export interface ChunkData {
  cx: number;
  cz: number;
  trees: TreeInst[];
  props: PropInst[];
}

/** where the fighters start: the middle of the spawn clearing */
export const SPAWN_CENTRE = { x: 1.8, z: 0 };

/** 0 = forest, 1 = open clearing (natural ones from noise, plus the spawn clearing) */
export function clearingAt(x: number, z: number, cfg: ForestConfig): number {
  const n = fbm(x, z, 46, cfg.seed + 11, 2);
  const t = 1 - cfg.clearingFrequency * 4.4;
  let c = smoothstep(t, t + 0.07, n);
  const ds = Math.hypot(x - SPAWN_CENTRE.x, z - SPAWN_CENTRE.z);
  c = Math.max(c, 1 - smoothstep(cfg.spawnClearing - 1, cfg.spawnClearing + 1, ds));
  return c;
}

/** uneven tree density: thickets and thinner stretches */
export function densityAt(x: number, z: number, cfg: ForestConfig): number {
  return 0.35 + 1.1 * fbm(x, z, 28, cfg.seed + 23, 2);
}

export function generateChunk(cx: number, cz: number, cfg: ForestConfig): ChunkData {
  const S = cfg.chunkSize;
  const x0 = cx * S;
  const z0 = cz * S;
  const trees: TreeInst[] = [];
  const props: PropInst[] = [];

  // --- trees: a jittered grid in world space (5 x 5 cells per 32 m chunk)
  const cell = S / 5;
  const perCell = cfg.treeDensity * cell * cell;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const gx = cx * 5 + i;
      const gz = cz * 5 + j;
      const r = rng(hash3(gx, gz, 1, cfg.seed));
      const x = x0 + (i + 0.5) * cell + (r() - 0.5) * cell * 0.7;
      const z = z0 + (j + 0.5) * cell + (r() - 0.5) * cell * 0.7;
      const ds = Math.hypot(x - SPAWN_CENTRE.x, z - SPAWN_CENTRE.z);
      const roll = r();
      let scale = 0.75 + r() * 0.5;
      const pick = r();
      let present: boolean;
      let variant: number;
      if (ds < cfg.spawnClearing) {
        present = false;
        variant = 0;
      } else if (ds < cfg.spawnClearing + 6) {
        // the spawn clearing's ring: always a tree, old and big
        present = true;
        scale = 1.25 + r() * 0.4;
        variant = Math.floor(pick * LIVING_VARIANTS);
      } else {
        const p = perCell * densityAt(x, z, cfg) * (1 - clearingAt(x, z, cfg));
        present = roll < p;
        variant = pick < 0.12 ? LIVING_VARIANTS + Math.floor(r() * DEAD_VARIANTS) : Math.floor(r() * LIVING_VARIANTS);
      }
      if (!present) continue;
      trees.push({ variant, x, z, rot: r() * Math.PI * 2, scale, radius: TRUNK_RADIUS[variant] * scale * 0.85 });
    }
  }

  // --- ground props, each kind with its own deterministic stream
  const pr = rng(hash3(cx, cz, 2, cfg.seed));
  const place = (kind: PropKind, count: number, scale: [number, number], avoidTrees = 0, where?: (x: number, z: number) => number) => {
    for (let k = 0; k < count; k++) {
      const x = x0 + pr() * S;
      const z = z0 + pr() * S;
      const keep = where ? where(x, z) : 1;
      const variant = Math.floor(pr() * PROP_VARIANTS[kind]);
      const rot = pr() * Math.PI * 2;
      const s = scale[0] + pr() * (scale[1] - scale[0]);
      const tint = pr();
      if (pr() > keep) continue;
      if (avoidTrees > 0 && trees.some((t) => Math.hypot(t.x - x, t.z - z) < t.radius + avoidTrees * s)) continue;
      props.push({ kind, variant, x, z, rot, scale: s, tint });
    }
  };
  const nearSpawn = (x: number, z: number) => Math.hypot(x - SPAWN_CENTRE.x, z - SPAWN_CENTRE.z);
  // nothing big where the duel starts
  const offSpawn = (x: number, z: number) => smoothstep(cfg.spawnClearing * 0.55, cfg.spawnClearing * 0.85, nearSpawn(x, z));
  if (cfg.rocksEnabled) place('rock', 7, [0.35, 1.3], 1.0, offSpawn);
  place('log', 2, [0.8, 1.2], 1.4, offSpawn);
  place('stump', 2, [0.8, 1.2], 0.8, offSpawn);
  place('bush', 7, [0.7, 1.3], 0.6, offSpawn);
  // mushrooms grow in little clusters around tree roots
  for (const t of trees) {
    if (pr() > 0.35) continue;
    const n = 2 + Math.floor(pr() * 5);
    const a0 = pr() * Math.PI * 2;
    const glow = pr() < 0.25;
    for (let k = 0; k < n; k++) {
      const a = a0 + (pr() - 0.5) * 1.2;
      const d = t.radius + 0.3 + pr() * 0.9;
      props.push({ kind: glow ? 'glowshroom' : 'mushroom', variant: 0, x: t.x + Math.cos(a) * d, z: t.z + Math.sin(a) * d,
        rot: pr() * 6.28, scale: 0.6 + pr() * 0.8 });
    }
  }
  // grass grows best in the open; leaf litter everywhere, thicker under the trees
  place('grass', 70, [0.6, 1.3], 0.3, (x, z) => 0.25 + 0.75 * clearingAt(x, z, cfg));
  place('leaf', 320, [0.7, 1.5], 0, (x, z) => 0.7 + 0.3 * (1 - clearingAt(x, z, cfg)));
  return { cx, cz, trees, props };
}
