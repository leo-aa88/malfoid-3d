import * as THREE from 'three';
import { HOUSES, HOUSE_ORDER, House, PitchConfig } from './config';
import { Kit, Occluder, jitter } from './kit';
import { clothCell } from './textures';
import { rng } from '../forest/random';

/*
 * The stadium's architecture, built from a few timber modules round the oval:
 * - house towers: a tapering four-post timber frame with ring beams and cross braces, a zigzag
 *   stair up the back, a spectator box near the top hung with striped house cloth, a pointed
 *   roof in the house colour with a pennant, a long banner down the front;
 * - grandstands between them: tiered benches on a post-and-beam frame, a front rail with
 *   banners, a cloth canopy on cantilevered rafters, a stair at the back;
 * - three goal hoops at each end; a low timber barrier at the foot of the stands.
 * Every part goes into the wood kit (vertex colours) or the cloth kit (the house atlas).
 */

const WOOD = { post: '#5e4429', beam: '#6f5236', brace: '#76583a', plank: '#8b6a45', seat: '#9a774e', dark: '#4a3622', rail: '#7d5f3e' };
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** a point on the stands' oval: position, outward normal, frame yaw (local +z outward) */
interface RingPoint { p: THREE.Vector3; n: THREE.Vector3; yaw: number }

/** the oval at the foot of the stands, sampled by arc length */
export class Ring {
  private readonly pts: THREE.Vector3[] = [];
  private readonly acc: number[] = [0];
  readonly length: number;

  constructor(readonly a: number, readonly b: number) {
    const N = 2048;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2;
      this.pts.push(V(a * Math.cos(t), 0, b * Math.sin(t)));
      if (i) this.acc.push(this.acc[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    }
    this.length = this.acc[N];
  }

  /** the point at arc length s (wraps) */
  at(s: number): RingPoint {
    s = ((s % this.length) + this.length) % this.length;
    let lo = 0, hi = this.acc.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.acc[mid] <= s) lo = mid;
      else hi = mid;
    }
    const k = (s - this.acc[lo]) / Math.max(1e-6, this.acc[hi] - this.acc[lo]);
    const p = this.pts[lo].clone().lerp(this.pts[hi], k);
    const n = V(p.x / (this.a * this.a), 0, p.z / (this.b * this.b)).normalize();
    return { p, n, yaw: Math.atan2(n.x, n.z) };
  }
}

export interface Built {
  occluders: Occluder[];
  /** solid posts inside the play area (the hoops): centre and radius (m) */
  posts: { x: number; z: number; r: number; h: number }[];
}

/** everything round the oval: towers, grandstands, the barrier, the hoops */
export function buildStadium(cfg: PitchConfig, wood: Kit, cloth: Kit): Built {
  const rand = rng(cfg.seed * 7919 + 13);
  const occluders: Occluder[] = [];
  const A = cfg.fieldHalfLength + cfg.apron;
  const B = cfg.fieldHalfWidth + cfg.apron;
  const ring = new Ring(A, B);
  const n = cfg.towerCount;
  const step = ring.length / n;
  const start = step / 2;                                          // towers off the axes: the ends stay open
  const hw = cfg.towerWidth / 2;
  for (let i = 0; i < n; i++) {
    const house = HOUSE_ORDER[i % 4];
    const t = ring.at(start + i * step);
    const height = cfg.towerBoxHeight + (rand() * 2 - 1) * cfg.towerHeightJitter;
    tower(cfg, wood, cloth, t.p.clone().addScaledVector(t.n, hw), t.yaw, house, height, rand, occluders);
    // the grandstand to the next tower, coloured by the tower before it
    const s0 = start + i * step + hw + 0.6;
    const s1 = start + (i + 1) * step - hw - 0.6;
    grandstand(cfg, wood, cloth, ring, s0, s1, house, rand, occluders);
  }
  barrier(cfg, wood, rand);
  const posts = hoops(cfg, wood, occluders);
  return { occluders, posts };
}

// --- house tower ---------------------------------------------------------------------------

function tower(cfg: PitchConfig, wood: Kit, cloth: Kit, origin: THREE.Vector3, yaw: number, house: House, H: number,
  rand: () => number, occ: Occluder[]): void {
  const [, accent, dark] = HOUSES[house];
  wood.setFrame(origin, yaw);
  cloth.setFrame(origin, yaw);
  const hw = cfg.towerWidth / 2;
  const topHw = hw * 0.86;                                        // the frame tapers a little
  const roofBase = H + 3.0;
  const half = (y: number) => hw + (topHw - hw) * Math.min(1, y / roofBase);
  const corner = (sx: number, sz: number, y: number) => V(sx * half(y), y, sz * half(y));
  const C: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  // posts, footings
  for (const [sx, sz] of C) {
    wood.beam(corner(sx, sz, 0), corner(sx, sz, roofBase), 0.42, 0.42, jitter(WOOD.post, rand, 0.08));
    wood.box(sx * hw, 0.2, sz * hw, 0.8, 0.4, 0.8, '#7c7468');
  }
  // ring beams and cross braces, level by level
  const lv = 3.2;
  const levels = Math.floor(H / lv);
  for (let k = 1; k <= levels; k++) {
    const y = Math.min(H, k * lv);
    for (let f = 0; f < 4; f++) {
      const [ax, az] = C[f], [bx, bz] = C[(f + 1) % 4];
      wood.beam(corner(ax, az, y), corner(bx, bz, y), 0.28, 0.24, jitter(WOOD.beam, rand, 0.08));
      const y0 = (k - 1) * lv;
      if (k === 1 && f === 0) continue;                           // the front's lowest bay stays open (a doorway)
      wood.beam(corner(ax, az, y0), corner(bx, bz, y), 0.16, 0.12, jitter(WOOD.brace, rand, 0.1));
      wood.beam(corner(bx, bz, y0), corner(ax, az, y), 0.16, 0.12, jitter(WOOD.brace, rand, 0.1));
    }
  }
  // a landing half-way up
  const mid = Math.round(levels / 2) * lv;
  wood.box(0, mid, 0, 2 * half(mid), 0.18, 2 * half(mid), jitter(WOOD.plank, rand, 0.06));
  // zigzag stair up the back (+z), flight by flight, to the landing
  const sz = hw + 0.75;
  for (let k = 0; k < mid / lv; k++) {
    const dir = k % 2 ? -1 : 1;
    const y0 = k * lv, y1 = (k + 1) * lv;
    const x0 = -dir * (hw - 0.3), x1 = dir * (hw - 0.3);
    wood.beam(V(x0, y0, sz - 0.5), V(x1, y1, sz - 0.5), 0.1, 0.22, WOOD.dark);
    wood.beam(V(x0, y0, sz + 0.5), V(x1, y1, sz + 0.5), 0.1, 0.22, WOOD.dark);
    wood.beam(V(x0, y0 + 1.0, sz + 0.55), V(x1, y1 + 1.0, sz + 0.55), 0.06, 0.06, WOOD.rail);
    const steps = 10;
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      wood.box(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, sz, 0.32, 0.06, 1.0, jitter(WOOD.plank, rand, 0.08));
    }
    wood.box(x1 + dir * 0.4, y1, sz, 0.9, 0.12, 1.1, WOOD.plank);   // landing
    wood.pole(V(x1 + dir * 0.8, 0, sz + 0.5), V(x1 + dir * 0.8, y1, sz + 0.5), 0.07, 0.07, WOOD.post, 5);
  }
  // the spectator box: an overhanging floor, a rail, cloth skirts, corner posts, the roof
  const bw = 2 * topHw + 1.6;
  wood.box(0, H, 0, bw, 0.3, bw, jitter(WOOD.plank, rand, 0.05));
  for (const [sx, sz2] of C) {
    wood.beam(V(sx * bw / 2, H, sz2 * bw / 2), V(sx * bw / 2, roofBase, sz2 * bw / 2), 0.2, 0.2, WOOD.post);
    // knee braces under the overhang
    wood.beam(corner(sx, sz2, H - 2.4), V(sx * (bw / 2 - 0.1), H - 0.1, sz2 * (bw / 2 - 0.1)), 0.14, 0.14, WOOD.brace);
  }
  for (let f = 0; f < 4; f++) {
    const [ax, az] = C[f], [bx, bz] = C[(f + 1) % 4];
    const a = V(ax * bw / 2, H + 1.1, az * bw / 2), b = V(bx * bw / 2, H + 1.1, bz * bw / 2);
    wood.beam(a, b, 0.12, 0.12, WOOD.rail);
    wood.beam(V(a.x, roofBase, a.z), V(b.x, roofBase, b.z), 0.22, 0.22, WOOD.beam);
    // striped drapery hanging from the rail, bellying out a little
    const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
    const out = V(Math.sign(cx) * (Math.abs(cx) > 0.1 ? 1 : 0), 0, Math.sign(cz) * (Math.abs(cz) > 0.1 ? 1 : 0)).normalize();
    drape(cloth, a.clone().addScaledVector(out, 0.04), b.clone().addScaledVector(out, 0.04), 3.8, out, 0.18, clothCell(house, 'stripes'));
  }
  // roof in the house colour, a finial and a pennant
  const roofH = 4.6 + rand() * 1.4;
  wood.roof(0, roofBase, 0, (bw / 2 + 0.35) * Math.SQRT2, roofH, 4, jitter(dark, rand, 0.05));
  wood.roof(0, roofBase - 0.02, 0, (bw / 2 + 0.55) * Math.SQRT2, 0.5, 4, accent);      // trim at the eaves
  const tip = roofBase + roofH;
  wood.pole(V(0, tip - 0.3, 0), V(0, tip + 2.2, 0), 0.06, 0.04, accent, 6);
  pennant(cloth, V(0, tip + 2.15, 0), 2.2, 0.9, clothCell(house, 'banner'));
  // a long banner down the front (towards the pitch)
  if (cfg.towerBanners) {
    const z = -half(H - 1) - 0.25;
    wood.beam(V(-1.4, H - 0.6, z), V(1.4, H - 0.6, z), 0.08, 0.08, WOOD.dark);
    hang(cloth, V(0, H - 0.6, z - 0.02), 2.5, 7.5, V(0, 0, -1), clothCell(house, 'banner'));
  }
  wood.resetFrame();
  cloth.resetFrame();
  // shadow casters: the posts, the box and its skirts, the roof
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(origin);
  const at = (x: number, y: number, z: number) => V(x, y, z).applyMatrix4(m);
  for (const [sx, sz2] of C) occ.push({ centre: at(sx * (hw + topHw) / 2, roofBase / 2, sz2 * (hw + topHw) / 2), half: V(0.22, roofBase / 2, 0.22), yaw });
  occ.push({ centre: at(0, H - 1.0, 0), half: V(bw / 2, 2.0, bw / 2), yaw });
  occ.push({ centre: at(0, roofBase + roofH * 0.3, 0), half: V(bw * 0.38, roofH * 0.3, bw * 0.38), yaw });
}

// --- grandstand --------------------------------------------------------------------------

function grandstand(cfg: PitchConfig, wood: Kit, cloth: Kit, ring: Ring, s0: number, s1: number, house: House,
  rand: () => number, occ: Occluder[]): void {
  const p0 = ring.at(s0), p1 = ring.at(s1);
  const L = p0.p.distanceTo(p1.p);
  if (L < 4) return;
  const midArc = ring.at((s0 + s1) / 2);
  // a straight stand on a curved oval: push it out by the sag so its front never crosses the oval
  const chordMid = p0.p.clone().add(p1.p).multiplyScalar(0.5);
  const sag = Math.max(0, chordMid.distanceTo(midArc.p));
  const along = p1.p.clone().sub(p0.p).normalize();
  const out = V(along.z, 0, -along.x);                          // perpendicular, away from the pitch
  if (out.dot(midArc.n) < 0) out.negate();
  const origin = chordMid.addScaledVector(out, sag + 0.1);
  const yaw = Math.atan2(out.x, out.z);
  wood.setFrame(origin, yaw);
  cloth.setFrame(origin, yaw);
  // the frame's local x runs along the stand; its sign follows the yaw's frame
  const T = cfg.standTiers, dep = cfg.standTierDepth, rise = cfg.standTierRise, base = cfg.standBaseHeight;
  const D = T * dep;
  const tread = (i: number) => base + i * rise;                  // top of tier i
  const top = tread(T - 1);
  const cols = Math.max(2, Math.round(L / cfg.standPostSpacing) + 1);
  const xs = Array.from({ length: cols }, (_, k) => -L / 2 + 0.3 + (k / (cols - 1)) * (L - 0.6));
  const rows = [0, 2, 4, T].filter((r, i, a) => r <= T && a.indexOf(r) === i);
  const rowY = (r: number) => (r >= T ? top : tread(r)) - 0.14;
  // posts on a grid under the tiers, beams along both ways, cross braces front and back
  for (const r of rows) {
    const z = r * dep;
    for (const x of xs) wood.beam(V(x, 0, z), V(x, rowY(r), z), 0.3, 0.3, jitter(WOOD.post, rand, 0.08));
    wood.beam(V(-L / 2, rowY(r), z), V(L / 2, rowY(r), z), 0.24, 0.26, jitter(WOOD.beam, rand, 0.06));
  }
  for (const x of xs) {
    for (let k = 0; k + 1 < rows.length; k++) {
      wood.beam(V(x, rowY(rows[k]), rows[k] * dep), V(x, rowY(rows[k + 1]), rows[k + 1] * dep), 0.22, 0.24, WOOD.beam);
    }
  }
  for (const r of [0, T]) {
    const z = r * dep;
    for (let k = 0; k + 1 < xs.length; k++) {
      const y = rowY(r);
      wood.beam(V(xs[k], 0.3, z), V(xs[k + 1], y - 0.2, z), 0.14, 0.12, jitter(WOOD.brace, rand, 0.1));
      wood.beam(V(xs[k + 1], 0.3, z), V(xs[k], y - 0.2, z), 0.14, 0.12, jitter(WOOD.brace, rand, 0.1));
      wood.beam(V(xs[k], y * 0.5, z), V(xs[k + 1], y * 0.5, z), 0.16, 0.16, WOOD.beam);
    }
  }
  // tiers: tread, riser and a bench on each
  for (let i = 0; i < T; i++) {
    const y = tread(i);
    wood.box(0, y - 0.05, (i + 0.5) * dep, L, 0.1, dep, jitter(WOOD.plank, rand, 0.05));
    const yPrev = i ? tread(i - 1) : base - 0.7;
    wood.box(0, (y + yPrev) / 2, i * dep, L, y - yPrev, 0.06, jitter(WOOD.dark, rand, 0.05));
    wood.box(0, y + 0.22, (i + 0.66) * dep, L, 0.08, 0.36, jitter(WOOD.seat, rand, 0.06));
    wood.box(0, y + 0.1, (i + 0.66) * dep, L, 0.2, 0.06, WOOD.dark);
  }
  // front rail with banners hanging from it
  const ry = base + 1.0;
  for (const x of xs) wood.beam(V(x, base, -0.05), V(x, ry, -0.05), 0.12, 0.12, WOOD.rail);
  wood.beam(V(-L / 2, ry, -0.05), V(L / 2, ry, -0.05), 0.12, 0.14, WOOD.rail);
  wood.beam(V(-L / 2, base + 0.5, -0.05), V(L / 2, base + 0.5, -0.05), 0.08, 0.08, WOOD.rail);
  const nb = cfg.bannersPerStand;
  for (let k = 0; k < nb; k++) {
    const x = -L / 2 + ((k + 0.5) / nb) * L;
    hang(cloth, V(x, ry, -0.14), 1.5, 3.2, V(0, 0, -1), clothCell(house, 'banner'));
  }
  // back wall posts rising to the canopy, rafters cantilevered forward, cloth canopy
  const hc = top + 3.4;
  if (cfg.standCanopy) {
    for (const x of xs) {
      wood.beam(V(x, rowY(T), D), V(x, hc, D), 0.26, 0.26, WOOD.post);
      wood.beam(V(x, hc, D + 0.2), V(x, hc - 1.3, -0.4), 0.16, 0.2, WOOD.beam);           // rafter
      wood.beam(V(x, hc - 1.6, D), V(x, hc - 0.55, D - 2.2), 0.12, 0.12, WOOD.brace);    // knee brace
    }
    wood.beam(V(-L / 2, hc, D), V(L / 2, hc, D), 0.2, 0.24, WOOD.beam);
    for (let k = 0; k + 1 < xs.length; k++) {
      canopy(cloth, V(xs[k], hc + 0.12, D + 0.2), V(xs[k + 1], hc + 0.12, D + 0.2), V(0, -1.3, -D - 0.6), clothCell(house, 'canopy'));
    }
    // the back is boarded up to the top tier (the stands read as solid from outside)
    wood.box(0, (rowY(T) + hc) / 2 - 0.6, D + 0.05, L, hc - rowY(T) - 1.2, 0.05, jitter(WOOD.plank, rand, 0.06));
  }
  // a stair up the back
  const sz = D + 1.0;
  const sx0 = L / 2 - 0.6, sx1 = sx0 - Math.min(L - 1.2, top * 1.6);
  wood.beam(V(sx0, 0, sz - 0.5), V(sx1, top, sz - 0.5), 0.1, 0.22, WOOD.dark);
  wood.beam(V(sx0, 0, sz + 0.5), V(sx1, top, sz + 0.5), 0.1, 0.22, WOOD.dark);
  wood.beam(V(sx0, 1.0, sz + 0.55), V(sx1, top + 1.0, sz + 0.55), 0.06, 0.06, WOOD.rail);
  const steps = Math.round(top / 0.28);
  for (let s = 1; s < steps; s++) {
    const f = s / steps;
    wood.box(sx0 + (sx1 - sx0) * f, top * f, sz, 0.34, 0.06, 1.0, jitter(WOOD.plank, rand, 0.08));
  }
  wood.box(sx1 - 0.6, top, sz - 0.3, 1.4, 0.12, 1.6, WOOD.plank);
  wood.resetFrame();
  cloth.resetFrame();
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(origin);
  occ.push({ centre: V(0, (base + top) / 2, D / 2).applyMatrix4(m), half: V(L / 2, (top - base) / 2 + 0.4, D / 2), yaw });
  if (cfg.standCanopy) occ.push({ centre: V(0, hc - 0.6, D / 2).applyMatrix4(m), half: V(L / 2, 0.6, D / 2 + 0.4), yaw });
  occ.push({ centre: V(0, rowY(T) / 2, D).applyMatrix4(m), half: V(L / 2, rowY(T) / 2, 0.15), yaw });
}

// --- barrier and hoops ---------------------------------------------------------------------

/** a low timber wall round the play area, just outside the fighters' boundary */
function barrier(cfg: PitchConfig, wood: Kit, rand: () => number): void {
  const A = cfg.fieldHalfLength + cfg.apron - cfg.boundaryMargin + 0.3;
  const B = cfg.fieldHalfWidth + cfg.apron - cfg.boundaryMargin + 0.3;
  const ring = new Ring(A, B);
  const seg = Math.round(ring.length / 2.4);
  const h = 1.05;
  for (let k = 0; k < seg; k++) {
    const p = ring.at((k / seg) * ring.length).p, q = ring.at(((k + 1) / seg) * ring.length).p;
    const mid = p.clone().add(q).multiplyScalar(0.5);
    const yaw = Math.atan2(q.x - p.x, q.z - p.z) - Math.PI / 2;
    const len = p.distanceTo(q);
    wood.box(mid.x, h / 2, mid.z, len + 0.02, h, 0.08, jitter(WOOD.plank, rand, 0.07), yaw);
    wood.box(mid.x, h + 0.04, mid.z, len + 0.04, 0.08, 0.16, WOOD.rail, yaw);
    wood.box(p.x, (h + 0.12) / 2, p.z, 0.16, h + 0.12, 0.16, WOOD.post, yaw);
  }
}

/** three hoops at each end: tall posts of different heights, brass rings facing the field */
function hoops(cfg: PitchConfig, wood: Kit, occ: Occluder[]): Built['posts'] {
  const posts: Built['posts'] = [];
  const R = cfg.hoopRadius;
  for (const side of [-1, 1]) {
    const x = side * cfg.hoopDistance;
    cfg.hoopHeights.forEach((h, i) => {
      const z = (i - 1) * cfg.hoopSpacing;
      wood.pole(V(x, 0.6, z), V(x, h - R, z), 0.13, 0.09, cfg.hoopColour, 10);
      wood.pole(V(x, 0, z), V(x, 0.6, z), 0.34, 0.2, '#6e6252', 10);                   // stone footing
      const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x, h, z);
      wood.add(new THREE.TorusGeometry(R, cfg.hoopTube, 8, 40), m, cfg.hoopColour);
      wood.add(new THREE.SphereGeometry(0.16, 10, 8), new THREE.Matrix4().setPosition(x, h + R + 0.08, z), cfg.hoopColour);
      posts.push({ x, z, r: 0.22, h });
      occ.push({ centre: V(x, (h - R) / 2, z), half: V(0.12, (h - R) / 2, 0.12), yaw: 0 });
      occ.push({ centre: V(x, h, z), half: V(0.1, R, R), yaw: 0 });
    });
  }
  return posts;
}

// --- cloth pieces (into the atlas kit) ------------------------------------------------------

/** a grid of cloth with its uv rectangle mapped over it; at(u, v) gives the point (u, v in 0..1) */
function clothGrid(kit: Kit, nu: number, nv: number, cell: [number, number, number, number], at: (u: number, v: number) => THREE.Vector3): void {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv;
    const p = at(u, v);
    pos.push(p.x, p.y, p.z);
    uv.push(cell[0] + (cell[2] - cell[0]) * u, cell[3] - (cell[3] - cell[1]) * v);   // v = 0 at the top edge
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  kit.add(g, new THREE.Matrix4(), '#ffffff');
}

/** a banner hanging from top (centre of its top edge), w x h, facing out, with a gentle belly */
function hang(kit: Kit, top: THREE.Vector3, w: number, h: number, out: THREE.Vector3, cell: [number, number, number, number]): void {
  const side = V(out.z, 0, -out.x);                              // the viewer's right (facing the banner)
  clothGrid(kit, 3, 6, cell, (u, v) => top.clone().addScaledVector(side, (u - 0.5) * w).add(V(0, -v * h, 0))
    .addScaledVector(out, Math.sin(Math.PI * v) * 0.12 + Math.sin(Math.PI * u) * 0.05));
}

/** drapery between two points of a rail, hanging depth h, bellying out */
function drape(kit: Kit, a: THREE.Vector3, b: THREE.Vector3, h: number, out: THREE.Vector3, belly: number, cell: [number, number, number, number]): void {
  clothGrid(kit, 8, 4, cell, (u, v) => a.clone().lerp(b, u).add(V(0, -v * h, 0))
    .addScaledVector(out, belly * Math.sin(Math.PI * v) * (0.6 + 0.4 * Math.sin(Math.PI * u)) + 0.05 * Math.sin(Math.PI * u * 4) ** 2));
}

/** a canopy from the back edge a-b reaching forward by fwd (sagging between its rafters) */
function canopy(kit: Kit, a: THREE.Vector3, b: THREE.Vector3, fwd: THREE.Vector3, cell: [number, number, number, number]): void {
  clothGrid(kit, 4, 5, cell, (u, v) => a.clone().lerp(b, u).addScaledVector(fwd, v).add(V(0, -0.25 * Math.sin(Math.PI * u), 0)));
}

/** a pennant streaming from a finial: a long triangle (the banner cell squeezed) */
function pennant(kit: Kit, at: THREE.Vector3, len: number, h: number, cell: [number, number, number, number]): void {
  clothGrid(kit, 6, 2, cell, (u, v) => at.clone().add(V(u * len, -v * h * (1 - u * 0.85) - u * 0.25, Math.sin(u * 5) * 0.12)));
}
