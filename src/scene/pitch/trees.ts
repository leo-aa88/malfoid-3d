import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PitchConfig } from './config';
import { groundExtent } from './textures';
import { castleSite, landHeight } from './landscape';
import { fbm, rng } from '../forest/random';
import { lump, pathFrom, taperedTube } from '../forest/geometry';

/*
 * The trees round the stadium: healthy daylight conifers and broadleaf trees (the Forbidden
 * Woods' gnarled, sparse ones would look wrong on the sunny grounds). A few variants of each,
 * built once and instanced: every tree is one variant, turned, scaled and tinted. Far trees use
 * simpler variants. Scenery only (no collision).
 */

type Col = [number, number, number];
const col = (h: string): Col => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};
const mix = (a: Col, b: Col, t: number): Col => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const TREE = {
  /** variants of each kind per level of detail; trees within closeTo (m from the pitch's centre)
   *  get the smoothest crowns, beyond farFrom the simplest */
  variants: 3,
  closeTo: 150,
  farFrom: 230,
  bark: col('#4e3a29'),
  barkLight: col('#6a5038'),
  pineDark: col('#1c3322'),
  pineLight: col('#3d6a3c'),
  leafShade: col('#2c4626'),
  leafMid: col('#47703a'),
  leafSun: col('#6f9a48'),
};

/**
 * colour every vertex of a (non-indexed) geometry; smooth: the normal at a point (soft toon
 * shading instead of the hard facets of per-triangle normals)
 */
function paint(g: THREE.BufferGeometry, at: (p: THREE.Vector3, n: THREE.Vector3) => Col,
  smooth?: (p: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('uv');
  out.computeVertexNormals();
  const pos = out.getAttribute('position');
  const nor = out.getAttribute('normal');
  if (smooth) {
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      smooth(p.fromBufferAttribute(pos, i), n).normalize();
      nor.setXYZ(i, n.x, n.y, n.z);
    }
  }
  const c = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const k = at(p, n);
    c[i * 3] = k[0];
    c[i * 3 + 1] = k[1];
    c[i * 3 + 2] = k[2];
  }
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return out;
}

/** a conifer: a trunk under stacked drooping tiers with ragged rims, a pointed top (~10-14 m) */
export function conifer(variant: number, lod: 0 | 1 | 2): THREE.BufferGeometry {
  const far = lod === 2;
  const rand = rng(4400 + variant * 131 + lod * 7);
  const H = 10 + rand() * 4;
  const R0 = 2.4 + rand() * 0.9;
  const parts: THREE.BufferGeometry[] = [];
  const trunk = [new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0, H * 0.3, 0), new THREE.Vector3(0, H * 0.7, 0)];
  parts.push(taperedTube(trunk, 0.32, 0.12, far ? 5 : 7, 3, rand, 0.04, (t) => mix(TREE.bark, TREE.barkLight, t)));
  const tiers = far ? 4 : 6;
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const radius = R0 * Math.pow(1 - f, 0.8) + 0.35;
    const h = H * (0.34 - 0.08 * f);
    const base = H * (0.16 + 0.74 * f);
    const g = new THREE.ConeGeometry(radius, h, [16, 11, 7][lod], 2, true).toNonIndexed();
    const pos = g.getAttribute('position');
    const twist = rand() * Math.PI * 2;
    const rim: number[] = Array.from({ length: 12 }, () => 0.82 + rand() * 0.36);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const low = clamp01((h / 2 - y) / h);                   // 0 at the tip .. 1 at the rim
      const a = Math.atan2(z, x) + twist;
      const j = rim[Math.floor((((a / (Math.PI * 2)) % 1) + 1) % 1 * 12) % 12];   // ragged rim
      const s = 1 + (j - 1) * low;
      pos.setXYZ(k, x * s, y + base + h / 2 - 0.35 * low * low * radius * 0.3, z * s);
    }
    parts.push(paint(g, (p, n) => {
      const up = clamp01(0.5 + n.y * 0.6);                    // sky-facing needles lighter
      const tip = clamp01(Math.hypot(p.x, p.z) / radius);      // outer tips lighter than the inside
      return mix(TREE.pineDark, TREE.pineLight, clamp01(0.2 * up + 0.5 * tip + 0.3 * (p.y / H)));
    }, (p, o) => o.set(p.x, radius * 0.55, p.z)));
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

/** a broadleaf tree (oak-like): a bending trunk and limbs, a dome of leafy clusters (~9-12 m) */
export function broadleaf(variant: number, lod: 0 | 1 | 2): THREE.BufferGeometry {
  const far = lod === 2;
  const rand = rng(7300 + variant * 197 + lod * 11);
  const T = 2.4 + rand() * 0.8;                              // a short trunk under a full crown
  const parts: THREE.BufferGeometry[] = [];
  const lean = new THREE.Vector3((rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6);
  const trunk = [new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(lean.x * 0.4, T * 0.55, lean.z * 0.4), new THREE.Vector3(lean.x, T, lean.z)];
  parts.push(taperedTube(trunk, 0.42, 0.24, far ? 5 : 7, 3, rand, 0.06, (t) => mix(TREE.bark, TREE.barkLight, t * 0.7), 0.25));
  const R = 3.3 + rand() * 0.9;
  const crown = new THREE.Vector3(lean.x, T + R * 0.75, lean.z);
  if (!far) {
    // limbs from the top of the trunk into the crown (they end inside the clusters)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + rand();
      const pts = pathFrom(trunk[2], new THREE.Vector3(Math.cos(a) * 0.7, 1, Math.sin(a) * 0.7), 1.6 + rand() * 0.6, new THREE.Vector3(0, 0.1, 0), 3, rand, 0.3);
      parts.push(taperedTube(pts, 0.2, 0.07, 5, 3, rand, 0.05, (t) => mix(TREE.bark, TREE.barkLight, 0.4 + t * 0.4)));
    }
  }
  // clusters over a rounded crown: one on top, a ring round the middle, a lower ring that hangs
  // down over the limbs (the crown reads as one full mass, not a lid on a stick)
  const n = far ? 5 : 9;
  for (let k = 0; k < n; k++) {
    const ring = k === 0 ? 0 : k <= (far ? 3 : 5) ? 1 : 2;
    const a = (k / n) * Math.PI * 2 * 2.3 + rand() * 0.7;
    const el = ring === 0 ? Math.PI / 2 : ring === 1 ? 0.25 + rand() * 0.35 : -0.35 + rand() * 0.2;
    const c = crown.clone().add(new THREE.Vector3(Math.cos(a) * Math.cos(el) * R * 0.66, Math.sin(el) * R * 0.62, Math.sin(a) * Math.cos(el) * R * 0.66));
    const r = (ring === 0 ? 2.5 : ring === 1 ? 2.0 + rand() * 0.6 : 1.8 + rand() * 0.5) * (far ? 1.2 : 1);
    const g = lump(r, lod === 0 ? 2 : 1, rand, lod === 0 ? 0.1 : 0.16);      // close: rounder outlines
    g.scale(1, 0.85, 1);
    g.translate(c.x, c.y, c.z);
    parts.push(paint(g, (p, nn) => {
      const sun = clamp01(0.5 + 0.5 * (nn.y * 0.8 + nn.x * 0.25 + nn.z * 0.15));   // lit from above (and the sun's side)
      const height = clamp01((p.y - (crown.y - R)) / (2 * R));
      const t = clamp01(0.55 * sun + 0.45 * height);
      return t < 0.5 ? mix(TREE.leafShade, TREE.leafMid, t * 2) : mix(TREE.leafMid, TREE.leafSun, (t - 0.5) * 2);
    }, (p, o) => o.subVectors(p, c)));
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

/** every tree, as a few instanced meshes (one per variant) */
export function buildTrees(cfg: PitchConfig, gradient: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pitch_trees';
  const rand = rng(cfg.seed * 31 + 5);
  const { halfX, halfZ } = groundExtent(cfg);
  const castle = castleSite(cfg);
  // the places: in clumps on the hills, open meadow between, clear of the stadium and the castle
  type Spot = { x: number; y: number; z: number; s: number; yaw: number; tint: number; kind: 0 | 1; lod: 0 | 1 | 2; v: number };
  const spots: Spot[] = [];
  for (let tries = 0; spots.length < cfg.trees && tries < cfg.trees * 30; tries++) {
    const r = 75 + Math.pow(rand(), 0.8) * 360;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < halfX + 8 && Math.abs(z) < halfZ + 8) continue;
    if (Math.hypot(x - castle.x, z - castle.z) < 110 * cfg.castleScale) continue;
    if (fbm(x, z, 70, cfg.seed + 41, 2) < 0.5) continue;
    // conifers more on the higher, farther ground; broadleaf nearer the stadium
    const kind: 0 | 1 = rand() < 0.35 + 0.35 * Math.min(1, (r - 75) / 300) ? 0 : 1;
    spots.push({ x, y: landHeight(cfg, x, z), z, s: 0.8 + rand() * 0.55, yaw: rand() * Math.PI * 2, tint: 0.86 + rand() * 0.24,
      kind, lod: r < TREE.closeTo ? 0 : r < TREE.farFrom ? 1 : 2, v: Math.floor(rand() * TREE.variants) });
  }
  // (both sides: the tiers are open cones, and a tier seen from below must not show a hole)
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient, side: THREE.DoubleSide });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  for (const kind of [0, 1] as const) {
    for (const lod of [0, 1, 2] as const) {
      for (let v = 0; v < TREE.variants; v++) {
        const mine = spots.filter((t) => t.kind === kind && t.lod === lod && t.v === v);
        if (!mine.length) continue;
        const geo = kind === 0 ? conifer(v, lod) : broadleaf(v, lod);
        const mesh = new THREE.InstancedMesh(geo, mat, mine.length);
        mesh.name = `pitch_trees_${kind ? 'broadleaf' : 'conifer'}_lod${lod}_${v}`;
        mesh.frustumCulled = false;                             // instanced: culling is all or nothing
        mine.forEach((t, i) => {
          m.compose(p.set(t.x, t.y, t.z), q.setFromAxisAngle(Y, t.yaw), s.setScalar(t.s));
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, tint.setScalar(t.tint));
        });
        group.add(mesh);
      }
    }
  }
  return group;
}
