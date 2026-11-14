import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './random';
import { LIVING_VARIANTS, TRUNK_RADIUS } from './placement';
import { logLength } from './colliders';

/*
 * The forest's shapes, built once from code (no model files) and reused by every chunk
 * through instancing. Every geometry is non-indexed with position, normal and colour, so
 * parts can be merged into one mesh per shape.
 */

type Col = [number, number, number];
const hex = (h: string): Col => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};
const mix = (a: Col, b: Col, t: number): Col => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const BARK_DARK = hex('#2c241e');
const BARK = hex('#4a3f35');
const BARK_LIGHT = hex('#665a4c');
const MOSS = hex('#34452c');
const DEAD_WOOD = hex('#4f4b46');
const DEAD_LIGHT = hex('#6f6a63');
const LEAVES = [hex('#1d2b22'), hex('#243523'), hex('#2b3c27')];

/** finish a part: non-indexed, flat colour attribute filled by colourAt(vertex position) */
function finish(g: THREE.BufferGeometry, colourAt: (p: THREE.Vector3, i: number) => Col): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('uv');
  out.computeVertexNormals();
  const pos = out.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const c = colourAt(p, i);
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/**
 * A tube that narrows from r0 to r1 along a path, with knobbly bumps (bark, roots, branches).
 * colour(t, bump): t from 0 (start) to 1 (end).
 */
export function taperedTube(path: THREE.Vector3[], r0: number, r1: number, radial: number, segs: number, rand: () => number,
  bump: number, colour: (t: number, b: number) => Col, flare = 0): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(path);
  const frames = curve.computeFrenetFrames(segs, false);
  const verts: number[] = [];
  const idx: number[] = [];
  const bumps: number[] = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const c = curve.getPointAt(t);
    const n = frames.normals[s];
    const b = frames.binormals[s];
    const ring = r0 + (r1 - r0) * Math.pow(t, 0.8) + flare * Math.pow(1 - t, 8);
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const kn = 1 + (rand() - 0.5) * bump * 2;
      const r = ring * kn;
      verts.push(c.x + (Math.cos(a) * n.x + Math.sin(a) * b.x) * r, c.y + (Math.cos(a) * n.y + Math.sin(a) * b.y) * r,
        c.z + (Math.cos(a) * n.z + Math.sin(a) * b.z) * r);
      bumps.push(kn);
    }
  }
  for (let s = 0; s < segs; s++) {
    for (let k = 0; k < radial; k++) {
      const a = s * radial + k;
      const b = s * radial + ((k + 1) % radial);
      const c = (s + 1) * radial + k;
      const d = (s + 1) * radial + ((k + 1) % radial);
      idx.push(a, b, c, b, d, c);              // counter-clockwise seen from outside: faces point out
    }
  }
  // closed tip
  const tip = curve.getPointAt(1);
  const ti = verts.length / 3;
  verts.push(tip.x, tip.y, tip.z);
  bumps.push(1);
  for (let k = 0; k < radial; k++) idx.push(segs * radial + k, segs * radial + ((k + 1) % radial), ti);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  const tOf = (vi: number) => (vi >= ti ? 1 : Math.floor(vi / radial) / segs);
  // colour per vertex of the indexed mesh, carried into the non-indexed copy
  const cols = new Float32Array((verts.length / 3) * 3);
  for (let v = 0; v < verts.length / 3; v++) {
    const c = colour(tOf(v), bumps[v]);
    cols.set(c, v * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const out = g.toNonIndexed();
  out.computeVertexNormals();
  return out;
}

/** a low-poly lump (rock, leaf clump): an icosahedron with jittered vertices */
export function lump(radius: number, detail: number, rand: () => number, jitter: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const pos = g.getAttribute('position');
  // move shared corners together (the icosahedron is non-indexed): key by rounded position
  const moved = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let k = moved.get(key);
    if (k === undefined) {
      k = 1 + (rand() - 0.5) * 2 * jitter;
      moved.set(key, k);
    }
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  g.deleteAttribute('uv');
  return g;
}

export function pathFrom(start: THREE.Vector3, dir: THREE.Vector3, length: number, bend: THREE.Vector3, steps: number,
  rand: () => number, wander: number): THREE.Vector3[] {
  const pts = [start.clone()];
  const d = dir.clone().normalize();
  const p = start.clone();
  for (let i = 1; i <= steps; i++) {
    d.addScaledVector(bend, 1 / steps).add(new THREE.Vector3((rand() - 0.5) * wander, (rand() - 0.5) * wander * 0.5, (rand() - 0.5) * wander)).normalize();
    p.addScaledVector(d, length / steps);
    pts.push(p.clone());
  }
  return pts;
}

/**
 * One tree shape, in three levels of detail: 0 near the player (~1100 triangles), 1 middle
 * distance, 2 far (in the fog, ~150). The same random stream drives every level, so a tree
 * keeps its silhouette when it changes level.
 * Variants 0-5 are living (twisted trunk, branches, sparse dark canopy), 6-7 dead and bare.
 */
export function treeGeometry(variant: number, lod: 0 | 1 | 2): THREE.BufferGeometry {
  const rand = rng(9100 + variant * 977);
  const dead = variant >= LIVING_VARIANTS;
  const radial = [7, 5, 4][lod];
  const parts: THREE.BufferGeometry[] = [];
  const H = dead ? 8 + rand() * 3 : 11 + rand() * 5;
  const R = TRUNK_RADIUS[variant];
  const barkCol = (t: number, b: number): Col => {
    const base = dead ? mix(DEAD_WOOD, DEAD_LIGHT, t * 0.6) : mix(BARK_DARK, BARK, Math.min(1, t * 1.6));
    let c = mix(base, dead ? DEAD_LIGHT : BARK_LIGHT, Math.max(0, b - 1) * 4);
    if (!dead && t < 0.18) c = mix(c, MOSS, (1 - t / 0.18) * 0.6);
    return c;
  };
  // trunk: leans, twists in an S, flares at the base
  const lean = new THREE.Vector3((rand() - 0.5) * 0.5, 1, (rand() - 0.5) * 0.5);
  const trunkPts: THREE.Vector3[] = [];
  const twist = rand() * Math.PI * 2;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const s = Math.sin(t * Math.PI * 1.3 + twist) * 0.55 * t;
    trunkPts.push(new THREE.Vector3(lean.x * t * H * 0.25 + s, t * H, lean.z * t * H * 0.25 + Math.cos(t * 3 + twist) * 0.35 * t));
  }
  const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
  parts.push(taperedTube(trunkPts, R, R * (dead ? 0.22 : 0.16), radial, [12, 7, 5][lod], rand, lod === 0 ? 0.09 : 0.05, barkCol, R * 1.3));

  // exposed roots spreading over the ground
  const roots = lod === 0 ? 5 + Math.floor(rand() * 3) : lod === 1 ? 3 : 0;
  for (let k = 0; k < roots; k++) {
    const a = (k / roots) * Math.PI * 2 + rand() * 0.6;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const start = new THREE.Vector3(out.x * R * 0.6, 0.35 + rand() * 0.5, out.z * R * 0.6);
    const pts = [start, start.clone().addScaledVector(out, 0.7 + rand() * 0.4).setY(0.12),
      start.clone().addScaledVector(out, 1.5 + rand() * 1.4).setY(-0.05 + rand() * 0.08)];
    parts.push(taperedTube(pts, R * 0.42, 0.04, lod === 0 ? 5 : 4, lod === 0 ? 5 : 3, rand, 0.12, (t, b) => barkCol(t * 0.15, b)));
  }

  // branches, angled up and out; living trees carry sparse dark leaf clumps at the tips
  const nb = dead ? 4 + Math.floor(rand() * 3) : 5 + Math.floor(rand() * 4);
  for (let k = 0; k < nb; k++) {
    const t = 0.38 + rand() * 0.55;
    const start = trunkCurve.getPointAt(t);
    const a = rand() * Math.PI * 2;
    const up = dead ? 0.05 + rand() * 0.6 : 0.35 + rand() * 0.9;
    const dir = new THREE.Vector3(Math.cos(a), up, Math.sin(a));
    const len = (dead ? 1.8 + rand() * 2.6 : 2.4 + rand() * 3.6) * (1.15 - t * 0.5);
    const droop = new THREE.Vector3(0, dead ? -0.4 : -0.15 - rand() * 0.3, 0);
    const pts = pathFrom(start, dir, len, droop, 4, rand, 0.5);
    const br = R * (0.36 - t * 0.18);
    if (lod === 2 && k > 3) continue;                  // far trees: the main limbs only
    parts.push(taperedTube(pts, br, 0.03, lod === 0 ? 5 : 3, lod === 0 ? 5 : 3, rand, 0.1, (tt, b) => barkCol(0.5 + tt * 0.5, b)));
    // a twig or two off each branch (detailed trees)
    if (lod === 0) {
      const subs = 1 + Math.floor(rand() * 2);
      for (let s = 0; s < subs; s++) {
        const p = pts[1 + Math.floor(rand() * (pts.length - 2))];
        const sa = a + (rand() - 0.5) * 2.2;
        const sd = new THREE.Vector3(Math.cos(sa), 0.2 + rand() * 0.8, Math.sin(sa));
        parts.push(taperedTube(pathFrom(p, sd, 0.8 + rand() * 1.4, droop, 3, rand, 0.6), br * 0.45, 0.02, 4, 3, rand, 0.1,
          (tt, b) => barkCol(0.7 + tt * 0.3, b)));
      }
    }
    if (!dead) {
      const clumps = 1 + Math.floor(rand() * 2);
      for (let c = 0; c < clumps; c++) {
        const tip = pts[pts.length - 1 - c];
        const sz = 0.9 + rand() * 1.3;
        const g = lump(1, 0, rand, 0.35);
        g.scale(sz * 1.4, sz * 0.75, sz * 1.3);
        g.rotateY(rand() * 6.28);
        g.translate(tip.x, tip.y + sz * 0.2, tip.z);
        const lc = LEAVES[Math.floor(rand() * LEAVES.length)];
        parts.push(finish(g, (p) => mix(lc, mix(lc, hex('#2f4030'), 0.6), Math.max(0, Math.min(1, (p.y - tip.y) / sz)))));
      }
    }
  }
  // crown clump on living trees
  if (!dead) {
    const top = trunkCurve.getPointAt(1);
    const g = lump(1, 0, rand, 0.3);
    const sz = 1.6 + rand() * 1.2;
    g.scale(sz * 1.5, sz * 0.9, sz * 1.5);
    g.translate(top.x, top.y, top.z);
    parts.push(finish(g, () => LEAVES[1]));
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

export function rockGeometry(variant: number): THREE.BufferGeometry {
  const rand = rng(5300 + variant * 131);
  const g = lump(1, 1, rand, 0.28);
  g.scale(1.0 + rand() * 0.4, 0.55 + rand() * 0.25, 0.8 + rand() * 0.3);
  g.translate(0, 0.18, 0);
  const stone = hex(['#3e434a', '#474b4f', '#3a3d3f'][variant % 3]);
  const g2 = finish(g, () => stone);
  // moss on the top faces
  const n = g2.getAttribute('normal');
  const c = g2.getAttribute('color');
  for (let i = 0; i < n.count; i++) {
    const m = Math.max(0, n.getY(i) - 0.55) * 1.8;
    const v = mix(stone, MOSS, Math.min(1, m));
    c.setXYZ(i, v[0], v[1], v[2]);
  }
  return g2;
}

export function logGeometry(variant: number): THREE.BufferGeometry {
  const rand = rng(6100 + variant * 71);
  rand();                                          // the draw logLength() makes
  const L = logLength(variant);                    // shared with the log's collider
  const pts = [new THREE.Vector3(-L / 2, 0.22, 0), new THREE.Vector3(-L / 6, 0.26, (rand() - 0.5) * 0.4),
    new THREE.Vector3(L / 6, 0.24, (rand() - 0.5) * 0.4), new THREE.Vector3(L / 2, 0.18, 0)];
  const parts = [taperedTube(pts, 0.26, 0.17, 8, 8, rand, 0.1, (t, b) => mix(BARK_DARK, BARK_LIGHT, Math.max(0, b - 1) * 4 + t * 0.2))];
  // a couple of broken branch stubs
  for (let k = 0; k < 2; k++) {
    const p = new THREE.Vector3((rand() - 0.5) * L * 0.6, 0.3, 0);
    parts.push(taperedTube([p, p.clone().add(new THREE.Vector3(rand() - 0.5, 0.5, rand() - 0.5))], 0.08, 0.02, 5, 2, rand, 0.1,
      () => BARK));
  }
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return g;
}

export function stumpGeometry(): THREE.BufferGeometry {
  const rand = rng(7001);
  const body = taperedTube([new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0.03, 0.45, 0), new THREE.Vector3(0, 0.8, 0.02)],
    0.48, 0.4, 10, 5, rand, 0.12, (t, b) => mix(mix(MOSS, BARK, t), BARK_LIGHT, Math.max(0, b - 1) * 4), 0.35);
  const cap = new THREE.CircleGeometry(0.42, 10);
  cap.rotateX(-Math.PI / 2);
  cap.translate(0, 0.8, 0.02);
  const capG = finish(cap, (p) => mix(hex('#5c4b3b'), hex('#7a6550'), Math.min(1, Math.hypot(p.x, p.z) / 0.42)));
  const g = mergeGeometries([body, capG], false)!;
  body.dispose();
  capG.dispose();
  return g;
}

export function mushroomGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.025, 0.035, 0.14, 6);
  stem.translate(0, 0.07, 0);
  const cap = new THREE.SphereGeometry(0.07, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.6, 1);
  cap.translate(0, 0.13, 0);
  const a = finish(stem, () => hex('#cfc7b4'));
  const b = finish(cap, (p) => mix(hex('#8a7b62'), hex('#b8ab8e'), Math.min(1, (p.y - 0.13) / 0.04)));
  const g = mergeGeometries([a, b], false)!;
  a.dispose();
  b.dispose();
  return g;
}

export function grassGeometry(variant: number): THREE.BufferGeometry {
  const rand = rng(8200 + variant * 37);
  const parts: THREE.BufferGeometry[] = [];
  const blades = 6 + Math.floor(rand() * 4);
  const green = hex('#34442b');
  const straw = hex('#5d5842');
  for (let k = 0; k < blades; k++) {
    const a = rand() * Math.PI * 2;
    const h = 0.25 + rand() * 0.35;
    const lean = 0.08 + rand() * 0.18;
    const w = 0.035;
    const ox = Math.cos(a) * 0.05;
    const oz = Math.sin(a) * 0.05;
    const tx = ox + Math.cos(a) * lean;
    const tz = oz + Math.sin(a) * lean;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      ox - Math.sin(a) * w, 0, oz + Math.cos(a) * w, ox + Math.sin(a) * w, 0, oz - Math.cos(a) * w, tx, h, tz,
    ], 3));
    const dry = rand() < (variant === 1 ? 0.6 : 0.2);
    parts.push(finish(g, (p) => mix(mix(hex('#1c2418'), dry ? straw : green, Math.min(1, p.y / h + 0.2)), green, 0)));
  }
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return g;
}

/** a dead leaf lying on the ground (coloured per instance) */
export function leafGeometry(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(0.14, 5);
  g.scale(1, 0.6, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.012, 0);
  return finish(g, () => [1, 1, 1]);
}

export function bushGeometry(variant: number): THREE.BufferGeometry {
  const rand = rng(8800 + variant * 53);
  const parts: THREE.BufferGeometry[] = [];
  const n = 7 + Math.floor(rand() * 5);
  for (let k = 0; k < n; k++) {
    const a = rand() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6);
    const pts = pathFrom(new THREE.Vector3(0, 0, 0), dir, 0.5 + rand() * 0.8, new THREE.Vector3(Math.cos(a), -0.3, Math.sin(a)), 3, rand, 0.7);
    parts.push(taperedTube(pts, 0.025, 0.006, 4, 3, rand, 0.1, (t) => mix(hex('#2d2722'), hex('#4c443b'), t)));
  }
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return g;
}
