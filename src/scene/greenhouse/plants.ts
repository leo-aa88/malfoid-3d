import * as THREE from 'three';
import type { GreenhouseConfig } from './config';
import { Kit, jitter } from '../pitch/kit';
import { rng } from '../forest/random';
import { vault } from './structure';

/*
 * The planting: potting benches along both long walls (pots of rosettes, ferns, strap-leaved
 * plants, flowering plants and bushes, seedling trays, watering cans), big planters closing the
 * ends (palms, broad-leaved plants, ferns), hanging baskets under the vault and ivy up some of
 * the wall posts. Wood and terracotta go into the solid Kit, every leaf into the leaf Kit (drawn
 * double-sided). All of it static, built once.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * one leaf, base at the origin, pointing out along +z: `elev` (rad) above the horizontal,
 * drooping `droop` m by its tip, `width` at its widest, a slight fold along the midrib
 */
function leaf(len: number, width: number, elev: number, droop: number, fold = 0.25): THREE.BufferGeometry {
  const ts = [0, 0.3, 0.65, 1];
  const ws = [0.08, 1, 0.75, 0];
  const pos: number[] = [];
  const idx: number[] = [];
  ts.forEach((t, i) => {
    const y = len * t * Math.sin(elev) - droop * t * t;
    const z = len * t * Math.cos(elev);
    const w = (width / 2) * ws[i];
    pos.push(-w, y - w * fold, z, 0, y, z, w, y - w * fold, z);
  });
  for (let i = 0; i < ts.length - 1; i++) {
    const a = i * 3;
    idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Planting {
  private readonly rand: () => number;
  private readonly m = new THREE.Matrix4();

  constructor(private readonly cfg: GreenhouseConfig, private readonly solid: Kit, private readonly leaves: Kit) {
    this.rand = rng(cfg.seed * 17 + 3);
  }

  private pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.rand() * a.length)];
  }

  private green(): THREE.Color {
    return jitter(this.pick(this.cfg.greens), this.rand, 0.1);
  }

  /** a leaf at p, turned yaw about the vertical */
  private leafAt(p: THREE.Vector3, yaw: number, len: number, width: number, elev: number, droop: number, colour: THREE.ColorRepresentation): void {
    this.m.makeRotationY(yaw).setPosition(p);
    this.leaves.add(leaf(len, width, elev, droop), this.m, colour);
  }

  /** a terracotta pot standing on y, its soil top returned */
  pot(x: number, y: number, z: number, r: number, h: number): number {
    const c = jitter(this.cfg.potColour, this.rand, 0.08);
    this.solid.add(new THREE.CylinderGeometry(r, r * 0.74, h, 10), new THREE.Matrix4().makeTranslation(x, y + h / 2, z), c);
    this.solid.add(new THREE.CylinderGeometry(r * 1.1, r * 1.06, h * 0.16, 10),
      new THREE.Matrix4().makeTranslation(x, y + h * 0.92, z), c.clone().multiplyScalar(0.92));
    this.solid.add(new THREE.CylinderGeometry(r * 0.94, r * 0.94, 0.012, 10), new THREE.Matrix4().makeTranslation(x, y + h * 0.9, z), '#3b2a1e');
    return y + h * 0.9;
  }

  /** a rosette of broad leaves */
  rosette(p: THREE.Vector3, size: number, n = 9): void {
    const c = this.green();
    const y0 = this.rand() * Math.PI;
    for (let i = 0; i < n; i++) {
      const len = size * (0.7 + 0.4 * this.rand());
      this.leafAt(p, y0 + (i / n) * Math.PI * 2 + this.rand() * 0.4, len, len * 0.42,
        0.5 + this.rand() * 0.6, len * 0.35, c.clone().multiplyScalar(0.85 + 0.25 * this.rand()));
    }
  }

  /** stiff upright strap leaves */
  upright(p: THREE.Vector3, size: number): void {
    const c = this.green();
    const n = 5 + Math.floor(this.rand() * 4);
    for (let i = 0; i < n; i++) {
      const len = size * (0.8 + 0.5 * this.rand());
      this.leafAt(p, this.rand() * Math.PI * 2, len, len * 0.2, 1.2 + this.rand() * 0.3, len * 0.05, c.clone().multiplyScalar(0.85 + 0.3 * this.rand()));
    }
  }

  /** a fern: many long narrow arching fronds */
  fern(p: THREE.Vector3, size: number, n = 12, elev = [0.35, 0.95]): void {
    const c = this.green();
    for (let i = 0; i < n; i++) {
      const len = size * (0.75 + 0.45 * this.rand());
      this.leafAt(p, (i / n) * Math.PI * 2 + this.rand() * 0.5, len, len * 0.16, elev[0] + this.rand() * (elev[1] - elev[0]), len * 0.55,
        c.clone().multiplyScalar(0.8 + 0.35 * this.rand()));
    }
  }

  /** a rosette with flower heads on short stems (Hufflepuff yellow most often) */
  flowering(p: THREE.Vector3, size: number): void {
    this.rosette(p, size * 0.8, 7);
    const flower = this.rand() < 0.45 ? this.cfg.flowers[0] : this.pick(this.cfg.flowers);
    const n = 3 + Math.floor(this.rand() * 4);
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2, r = size * 0.25 * this.rand();
      const top = V(p.x + Math.cos(a) * r, p.y + size * (0.45 + 0.35 * this.rand()), p.z + Math.sin(a) * r);
      this.solid.pole(p.clone().setY(p.y + 0.02), top, 0.006, 0.005, '#4c7a37', 4);
      this.leaves.add(new THREE.IcosahedronGeometry(size * 0.09, 0), new THREE.Matrix4().makeTranslation(top.x, top.y, top.z),
        jitter(flower, this.rand, 0.08));
    }
  }

  /** a round clipped bush */
  bush(p: THREE.Vector3, size: number): void {
    const c = this.green();
    for (let i = 0; i < 4; i++) {
      const a = this.rand() * Math.PI * 2, r = size * 0.22 * this.rand();
      const s = size * (0.32 + 0.12 * this.rand());
      this.leaves.add(new THREE.IcosahedronGeometry(s, 1),
        new THREE.Matrix4().makeTranslation(p.x + Math.cos(a) * r, p.y + s * 0.85 + this.rand() * size * 0.15, p.z + Math.sin(a) * r),
        c.clone().multiplyScalar(0.85 + 0.25 * this.rand()));
    }
  }

  /** broad leaves on long stalks (a big house plant) */
  broadleaf(p: THREE.Vector3, size: number, n = 7): void {
    const c = this.green();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rand() * 0.5;
      const h = size * (0.45 + 0.4 * this.rand());
      const out = size * (0.15 + 0.15 * this.rand());
      const tip = V(p.x + Math.sin(a) * out, p.y + h, p.z + Math.cos(a) * out);
      this.solid.pole(p, tip, 0.012, 0.008, '#4d7638', 5);
      const len = size * (0.45 + 0.2 * this.rand());
      this.leafAt(tip, a, len, len * 0.75, -0.15 + this.rand() * 0.4, len * 0.25, c.clone().multiplyScalar(0.85 + 0.25 * this.rand()));
    }
  }

  /** a palm: a slender ringed trunk and arching fronds */
  palm(p: THREE.Vector3, height: number): void {
    const lean = V((this.rand() - 0.5) * 0.4, 1, (this.rand() - 0.5) * 0.4).normalize();
    const top = p.clone().addScaledVector(lean, height);
    this.solid.pole(p, top, 0.11, 0.07, '#6e5a40', 8);
    for (let i = 1; i < 8; i++) {
      const q = p.clone().lerp(top, i / 8);
      this.solid.add(new THREE.CylinderGeometry(0.1 - i * 0.004, 0.1 - i * 0.004, 0.04, 8),
        new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, lean)).setPosition(q), '#5b4a34');
    }
    this.fern(top, height * 0.55, 11, [0.15, 0.7]);
  }

  /** ivy climbing a post from y0 to y1 (small leaves round a loose helix) */
  ivy(x: number, z: number, y0: number, y1: number, facing: number): void {
    const c = this.green().multiplyScalar(0.85);
    const n = Math.round((y1 - y0) * 14);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = t * 18 + this.rand();
      const p = V(x + Math.cos(a) * 0.07, y0 + (y1 - y0) * t, z + Math.sin(a) * 0.07);
      this.leafAt(p, facing + (this.rand() - 0.5) * 2.4, 0.09, 0.08, -0.3 + this.rand() * 0.8, 0.02, c.clone().multiplyScalar(0.85 + 0.3 * this.rand()));
    }
  }

  /** a random potted plant on the bench at (x, y, z) */
  pottedPlant(x: number, y: number, z: number): void {
    const r = 0.1 + this.rand() * 0.07;
    const top = this.pot(x, y, z, r, r * (1.4 + this.rand() * 0.4));
    const p = V(x, top, z);
    const size = 0.34 + this.rand() * 0.36;
    const k = this.rand();
    if (k < 0.27) this.rosette(p, size);
    else if (k < 0.42) this.upright(p, size * 1.1);
    else if (k < 0.62) this.fern(p, size * 1.1);
    else if (k < 0.88) this.flowering(p, size);
    else this.bush(p, size * 0.8);
  }

  /** a seedling tray: rows of little tufts (Mandrake seedlings, perhaps) */
  tray(x: number, y: number, z: number, along: number): void {
    const w = 0.55, d = 0.38;
    this.solid.box(x, y + 0.05, z, along > 0 ? w : d, 0.1, along > 0 ? d : w, '#6f5136');
    this.solid.box(x, y + 0.095, z, (along > 0 ? w : d) - 0.04, 0.012, (along > 0 ? d : w) - 0.04, '#3b2a1e');
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const ox = (i - 1) * 0.16, oz = (j - 0.5) * 0.17;
      const p = V(x + (along > 0 ? ox : oz), y + 0.1, z + (along > 0 ? oz : ox));
      const c = this.green();
      for (let k = 0; k < 4; k++) this.leafAt(p, k * 1.6 + this.rand(), 0.09, 0.05, 0.9 + this.rand() * 0.4, 0.02, c);
    }
  }

  /** a watering can (Hufflepuff yellow) */
  can(x: number, y: number, z: number, yaw: number): void {
    const col = jitter('#d8a92a', this.rand, 0.06);
    this.solid.add(new THREE.CylinderGeometry(0.1, 0.11, 0.22, 10), new THREE.Matrix4().makeTranslation(x, y + 0.11, z), col);
    const dir = V(Math.sin(yaw), 0, Math.cos(yaw));
    const a = V(x, y + 0.06, z).addScaledVector(dir, 0.08);
    const b = V(x, y + 0.27, z).addScaledVector(dir, 0.3);
    this.solid.pole(a, b, 0.018, 0.012, col, 6);
    this.solid.add(new THREE.CylinderGeometry(0.035, 0.02, 0.04, 8), new THREE.Matrix4().makeTranslation(b.x, b.y, b.z), col);
    const h0 = V(x, y + 0.22, z).addScaledVector(dir, -0.09), h1 = V(x, y + 0.3, z), h2 = V(x, y + 0.22, z).addScaledVector(dir, 0.06);
    this.solid.beam(h0, h1, 0.02, 0.02, col);
    this.solid.beam(h1, h2, 0.02, 0.02, col);
  }

  /** a potting bench along x from x0 to x1, its front at z = front, its back at z = back */
  bench(x0: number, x1: number, front: number, back: number): void {
    const cfg = this.cfg, H = cfg.benchHeight;
    const zc = (front + back) / 2, d = Math.abs(back - front), len = x1 - x0;
    const wood = cfg.benchColour;
    this.solid.box((x0 + x1) / 2, H - 0.03, zc, len, 0.06, d, jitter(wood, this.rand, 0.05));
    this.solid.box((x0 + x1) / 2, H - 0.1, front, len, 0.12, 0.04, jitter(wood, this.rand, 0.08).multiplyScalar(0.85));
    this.solid.box((x0 + x1) / 2, 0.28, zc, len, 0.04, d * 0.9, jitter(wood, this.rand, 0.05).multiplyScalar(0.8));
    for (let x = x0 + 0.1; x <= x1 - 0.1 + 1e-6; x += Math.max(1.2, (len - 0.2) / Math.round((len - 0.2) / 1.6))) {
      for (const z of [front + Math.sign(back - front) * 0.06, back - Math.sign(back - front) * 0.06]) {
        this.solid.box(x, (H - 0.06) / 2, z, 0.07, H - 0.06, 0.07, jitter(wood, this.rand, 0.05).multiplyScalar(0.75));
      }
    }
    // the staging: a raised shelf along the back on short posts, a row of small pots on it
    const out = Math.sign(back - front);
    const sh = H + cfg.stagingHeight, sz = back - out * 0.2;
    this.solid.box((x0 + x1) / 2, sh - 0.02, sz, len, 0.04, 0.3, jitter(wood, this.rand, 0.05));
    for (let x = x0 + 0.2; x <= x1 - 0.2 + 1e-6; x += Math.max(1.0, (len - 0.4) / Math.round((len - 0.4) / 1.4))) {
      this.solid.box(x, (H + sh) / 2, sz, 0.05, sh - H, 0.05, jitter(wood, this.rand, 0.05).multiplyScalar(0.8));
    }
    for (let x = x0 + 0.25; x < x1 - 0.2; x += 0.3 + this.rand() * 0.2) {
      const top = this.pot(x, sh, sz, 0.08, 0.12);
      const p = V(x, top, sz);
      const k = this.rand();
      if (k < 0.3) this.flowering(p, 0.3);
      else if (k < 0.55) this.upright(p, 0.32);
      else if (k < 0.8) this.fern(p, 0.35, 9);
      else this.rosette(p, 0.25, 7);
    }
    // on top: plants mostly, now and then a seedling tray, a watering can or a stack of pots
    for (let x = x0 + 0.3; x < x1 - 0.25; ) {
      const k = this.rand();
      if (k < 0.07) {
        this.tray(x + 0.28, H, zc, 1);
        x += 0.62;
      } else if (k < 0.1) {
        this.can(x + 0.12, H, front + out * 0.3, (this.rand() - 0.5) * 2);
        x += 0.32;
      } else if (k < 0.13) {
        for (let i = 0; i < 4; i++) this.pot(x + 0.1, H + i * 0.05, back - out * 0.25, 0.09, 0.14);
        x += 0.28;
      } else {
        // a row of two: one near the front, one behind it (staggered), in front of the staging
        this.pottedPlant(x, H, front + out * (0.22 + this.rand() * 0.06));
        if (this.rand() < 0.85) this.pottedPlant(x + cfg.potSpacing * 0.5, H, front + out * (0.55 + this.rand() * 0.08));
        x += cfg.potSpacing * (0.85 + 0.35 * this.rand());
      }
    }
    // under it: a few big pots on the lower shelf and a sack of compost
    for (let x = x0 + 0.6; x < x1 - 0.5; x += 1.4 + this.rand() * 1.6) {
      if (this.rand() < 0.5) this.pot(x, 0.3, zc, 0.14, 0.2);
      else this.solid.add(new THREE.SphereGeometry(0.22, 8, 6), new THREE.Matrix4().makeScale(1.2, 0.7, 1).setPosition(x, 0.44, zc), '#8a7653');
    }
  }

  /**
   * a raised brick bed at an end of the house (x from x0 to x1, z from z0 to z1), planted; `path`:
   * the end (at z0 or z1) beside the path to the door, kept clear of palms for pathClear m (from
   * the duel camera in the corner, a palm there hides a fighter on the path)
   */
  planter(x0: number, x1: number, z0: number, z1: number, path?: 'z0' | 'z1'): void {
    const cfg = this.cfg, h = 0.55;
    const xc = (x0 + x1) / 2, dx = Math.abs(x1 - x0);
    const zc = (z0 + z1) / 2, dz = z1 - z0;
    const inner = Math.sign(-xc);                                   // towards the middle of the house
    this.solid.box(xc, h / 2, zc, dx, h, dz, jitter(cfg.brickColour, this.rand, 0.05));
    this.solid.box(xc, h + 0.03, zc, dx + 0.08, 0.06, dz + 0.08, cfg.copingColour);
    this.solid.box(xc, h + 0.065, zc, dx - 0.2, 0.02, dz - 0.2, '#3b2a1e');
    const y = h + 0.07;
    // palms at the back (about one every 5.8 m), broad-leaved plants and ferns in front
    const pa = z0 + 1.2 + (path === 'z0' ? cfg.pathClear : 0), pb = z1 - 1.2 - (path === 'z1' ? cfg.pathClear : 0);
    const gaps = Math.max(1, Math.round((pb - pa) / 5.8));
    for (let z = pa; z <= pb + 1e-6; z += (pb - pa) / gaps) {
      this.palm(V(xc - inner * dx * 0.2 + (this.rand() - 0.5) * 0.4, y, z + (this.rand() - 0.5) * 0.6), 2.6 + this.rand() * 1.2);
    }
    for (let z = z0 + 0.7; z < z1 - 0.5; z += 1.1 + this.rand() * 0.5) {
      const front = xc + inner * (dx / 2 - 0.55);
      if (this.rand() < 0.5) this.broadleaf(V(front, y, z), 1.1 + this.rand() * 0.4);
      else this.fern(V(front, y, z), 0.9 + this.rand() * 0.4, 14);
      // (a flower beside the plant, kept inside the bed)
      if (this.rand() < 0.6) this.flowering(V(front + inner * 0.25, y, Math.min(z + 0.5, z1 - 0.3)), 0.45);
    }
  }

  /** a basket hanging from the vault at (x, z), its bottom at y */
  basket(x: number, z: number, y: number): void {
    const cfg = this.cfg;
    const top = vault(cfg).y(z) - 0.05;
    for (const a of [0, 2.1, 4.2]) this.solid.beam(V(x, top, z), V(x + Math.cos(a) * 0.22, y + 0.24, z + Math.sin(a) * 0.22), 0.012, 0.012, cfg.ironColour);
    const bowl = new THREE.SphereGeometry(0.26, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    this.solid.add(bowl, new THREE.Matrix4().makeTranslation(x, y + 0.26, z), '#5a4630');
    const p = V(x, y + 0.26, z);
    this.fern(p, 0.55, 14, [-1.2, -0.4]);                        // trailing down over the rim
    this.rosette(p, 0.3, 7);
    if (this.rand() < 0.7) this.flowering(p, 0.35);
  }
}
