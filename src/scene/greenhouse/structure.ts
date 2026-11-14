import * as THREE from 'three';
import type { GreenhouseConfig } from './config';
import { Kit, jitter } from '../pitch/kit';
import { fbm, hash3, rng } from '../forest/random';

/*
 * The glasshouse itself: brick plinth, iron frame (posts, vault ribs, glazing bars, rails,
 * ridge cresting), the glass, and the stone floor. The frame and plinth go into one Kit (one
 * opaque mesh); the glass is its own transparent mesh.
 */

/** the vault's cross-section: a segmental arch from the eaves (z = +-W) to the crown */
export function vault(cfg: GreenhouseConfig): { R: number; yc: number; y(z: number): number } {
  const W = cfg.halfWidth, rise = cfg.roofRise;
  const R = (W * W + rise * rise) / (2 * rise);
  const yc = cfg.eaves + rise - R;
  return { R, yc, y: (z: number) => yc + Math.sqrt(Math.max(0, R * R - z * z)) };
}

/** points along the vault's arc from z = -W to +W (n segments) */
function arc(cfg: GreenhouseConfig, n: number): THREE.Vector2[] {
  const v = vault(cfg), W = cfg.halfWidth;
  const a0 = Math.asin(W / v.R);
  const out: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -a0 + (2 * a0 * i) / n;
    out.push(new THREE.Vector2(v.R * Math.sin(a), v.yc + v.R * Math.cos(a)));
  }
  return out;
}

/**
 * the frame and plinth into `kit` (they cast the sun's shadow: posts, ribs, rails); the fine
 * glazing bars and purlins into `fine` (no shadow: a stripe for every bar would clutter the floor)
 */
export function buildFrame(cfg: GreenhouseConfig, kit: Kit, fine: Kit): void {
  const L = cfg.halfLength, W = cfg.halfWidth, P = cfg.plinthHeight, E = cfg.eaves;
  const iron = cfg.ironColour;
  const rand = rng(cfg.seed * 7 + 1);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const bays = Math.round((2 * L) / cfg.bay);
  const step = (2 * L) / bays;
  const ribArc = arc(cfg, 18);
  const barArc = arc(cfg, 12);
  const v = vault(cfg);

  // --- brick plinth with a stone coping, round all four sides (a doorway in the east gable)
  const T = cfg.plinthThickness;
  const brickRun = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i < n; i++) {
      const ax = x0 + ((x1 - x0) * i) / n, az = z0 + ((z1 - z0) * i) / n;
      const bx = x0 + ((x1 - x0) * (i + 1)) / n, bz = z0 + ((z1 - z0) * (i + 1)) / n;
      const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const seg = len / n;
      kit.box((ax + bx) / 2, P / 2, (az + bz) / 2, along ? seg : T, P, along ? T : seg, jitter(cfg.brickColour, rand, 0.07));
      kit.box((ax + bx) / 2, P + 0.04, (az + bz) / 2, along ? seg : T + 0.08, 0.08, along ? T + 0.08 : seg, cfg.copingColour);
    }
  };
  brickRun(-L, -W - T / 2, L, -W - T / 2);
  brickRun(-L, W + T / 2, L, W + T / 2);
  brickRun(-L - T / 2, -W, -L - T / 2, W);
  brickRun(L + T / 2, -W, L + T / 2, -1.0);
  brickRun(L + T / 2, 1.0, L + T / 2, W);

  // --- the long walls: posts every bay, glazing bars between, rails (plinth, transom, eaves)
  for (const s of [-1, 1]) {
    const z = s * W;
    for (let i = 0; i <= bays; i++) {
      const x = -L + i * step;
      kit.beam(V(x, P, z), V(x, E, z), cfg.rib, cfg.rib, iron);
      // the vault rib over this post
      for (let k = 0; k < ribArc.length - 1; k++) {
        const a = ribArc[k], b = ribArc[k + 1];
        kit.beam(V(x, a.y, a.x), V(x, b.y, b.x), cfg.rib, cfg.rib * 1.4, iron);
      }
      // a curved bracket at the eaves, inside: the post into the rib
      if (s > 0) for (const t of [-1, 1]) {
        const zz = t * W, zi = t * (W - 0.55);
        kit.beam(V(x, E - 0.65, zz), V(x, v.y(zi) - 0.02, zi), cfg.rib * 0.7, cfg.rib * 0.7, iron);
      }
      if (i === bays) continue;
      for (let b = 1; b < cfg.barsPerBay; b++) {
        const xb = x + (step * b) / cfg.barsPerBay;
        fine.beam(V(xb, P, z), V(xb, E, z), cfg.bar, cfg.bar, iron);
        for (let k = 0; k < barArc.length - 1; k++) {
          const a = barArc[k], c = barArc[k + 1];
          fine.beam(V(xb, a.y, a.x), V(xb, c.y, c.x), cfg.bar, cfg.bar, iron);
        }
      }
    }
    for (const y of [P + 0.1, cfg.transom]) fine.beam(V(-L, y, z), V(L, y, z), cfg.bar * 1.5, cfg.bar * 1.5, iron);
    // the eaves: a gutter
    kit.box(0, E + 0.05, z + s * 0.08, 2 * L + 0.3, 0.14, 0.2, iron);
  }
  // --- purlins along the vault, the ridge and its cresting
  for (const k of [3, 6, 9, 12, 15]) {
    const p = ribArc[k];
    fine.beam(V(-L, p.y, p.x), V(L, p.y, p.x), cfg.bar * 1.6, cfg.bar * 1.6, iron);
  }
  const crown = cfg.eaves + cfg.roofRise;
  kit.box(0, crown + 0.05, 0, 2 * L + 0.2, 0.12, 0.16, iron);
  for (let x = -L; x <= L + 1e-6; x += step / 2) {
    kit.pole(V(x, crown + 0.1, 0), V(x, crown + 0.42, 0), 0.03, 0.005, iron, 6);
    kit.box(x, crown + 0.2, 0, 0.16, 0.04, 0.04, iron);
  }
  // finials at the gables' crowns
  for (const s of [-1, 1]) {
    kit.pole(V(s * L, crown, 0), V(s * L, crown + 0.9, 0), 0.06, 0.01, iron, 8);
    kit.add(new THREE.SphereGeometry(0.09, 10, 8), new THREE.Matrix4().makeTranslation(s * L, crown + 0.35, 0), iron);
  }

  // --- the gables: vertical bars every ~1 m up to the arc, a transom, the doorway (east)
  for (const s of [-1, 1]) {
    const x = s * L;
    for (let z = -W; z <= W + 1e-6; z += W / 5) {
      const top = Math.abs(Math.abs(z) - W) < 1e-3 ? E : v.y(z);
      const door = s > 0 && Math.abs(z) < 1.0;
      const main = Math.abs(z) < 1e-3 || Math.abs(Math.abs(z) - W) < 1e-3;
      (main ? kit : fine).beam(V(x, door ? 2.5 : P, z), V(x, top, z), main ? cfg.rib : cfg.bar * 1.4, cfg.bar * 1.4, iron);
    }
    for (let k = 0; k < ribArc.length - 1; k++) {
      const a = ribArc[k], b = ribArc[k + 1];
      kit.beam(V(x, a.y, a.x), V(x, b.y, b.x), cfg.rib * 1.2, cfg.rib * 1.2, iron);
    }
    fine.beam(V(x, cfg.transom, -W), V(x, cfg.transom, s > 0 ? -1.0 : W), cfg.bar * 1.5, cfg.bar * 1.5, iron);
    if (s > 0) {
      fine.beam(V(x, cfg.transom, 1.0), V(x, cfg.transom, W), cfg.bar * 1.5, cfg.bar * 1.5, iron);
      // the doorway: posts, lintel, a fanlight bar, two half-open glazed doors
      for (const t of [-1, 1]) kit.beam(V(x, 0, t * 1.0), V(x, 2.5, t * 1.0), cfg.rib, cfg.rib, iron);
      kit.beam(V(x, 2.5, -1.0), V(x, 2.5, 1.0), cfg.rib, cfg.rib, iron);
      for (const t of [-1, 1]) {
        const hinge = V(x, 0, t * 1.0);
        const yaw = t * 0.9;
        const dz = -t * Math.cos(yaw) * 0.95, dx = Math.sin(yaw) * 0.95;
        const tip = V(x + dx, 0, t * 1.0 + dz);
        kit.beam(V(tip.x, 0, tip.z), V(tip.x, 2.4, tip.z), cfg.bar * 1.5, cfg.bar * 1.5, iron);
        kit.beam(V(hinge.x, 2.4, hinge.z), V(tip.x, 2.4, tip.z), cfg.bar * 1.5, cfg.bar * 1.5, iron);
        kit.beam(V(hinge.x, 0.9, hinge.z), V(tip.x, 0.9, tip.z), cfg.bar * 1.5, cfg.bar * 1.5, iron);
      }
    }
  }
}

/**
 * the glass, two transparent meshes: the frosted lower panes (the walls and gables up to the
 * transom) and the clear rest (above the transom, the vault, the gables' arches)
 */
export function buildGlass(cfg: GreenhouseConfig): THREE.Mesh[] {
  const L = cfg.halfLength, W = cfg.halfWidth, P = cfg.plinthHeight, E = cfg.eaves, Tr = cfg.transom;
  const low: THREE.BufferGeometry[] = [], high: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const a = new THREE.PlaneGeometry(2 * L, Tr - P);
    a.translate(0, (Tr + P) / 2, s * W);
    low.push(a);
    const b = new THREE.PlaneGeometry(2 * L, E - Tr);
    b.translate(0, (E + Tr) / 2, s * W);
    high.push(b);
  }
  // the vault: a strip of quads along x over the arc
  const pts = arc(cfg, 24);
  const pos: number[] = [], idx: number[] = [];
  pts.forEach((p) => pos.push(-L, p.y, p.x, L, p.y, p.x));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = 2 * i;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roof.setIndex(idx);
  high.push(roof);
  // the gables (shape x -> world z, at x = +-L): the lower band (the east one round its doorway),
  // and the upper part with the arch
  const place = (shape: THREE.Shape, s: number) => {
    const g = new THREE.ShapeGeometry(shape);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    g.translate(s * L, 0, 0);
    return g;
  };
  for (const s of [-1, 1]) {
    const rect = (z0: number, z1: number) => {
      const r = new THREE.Shape();
      r.moveTo(z0, P);
      r.lineTo(z1, P);
      r.lineTo(z1, Tr);
      r.lineTo(z0, Tr);
      r.lineTo(z0, P);
      low.push(place(r, s));
    };
    if (s > 0) {
      rect(-W, -1.0);
      rect(1.0, W);
    } else rect(-W, W);
    const hi = new THREE.Shape();
    hi.moveTo(-W, Tr);
    if (s > 0) {
      hi.lineTo(-1.0, Tr);
      hi.lineTo(-1.0, 2.5);
      hi.lineTo(1.0, 2.5);
      hi.lineTo(1.0, Tr);
    }
    hi.lineTo(W, Tr);
    hi.lineTo(W, E);
    for (let i = pts.length - 1; i >= 0; i--) hi.lineTo(pts[i].x, pts[i].y);
    hi.lineTo(-W, Tr);
    high.push(place(hi, s));
  }
  const mesh = (parts: THREE.BufferGeometry[], colour: string, opacity: number, name: string) => {
    for (const p of parts) {
      p.deleteAttribute('uv');
      p.deleteAttribute('normal');
    }
    const geo = mergeAll(parts);
    geo.computeVertexNormals();
    // unlit: frosted glass glows with the daylight behind it, whichever way the sun falls
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    m.name = name;
    m.renderOrder = 1;
    return m;
  };
  return [mesh(low, cfg.frostedColour, cfg.frostedOpacity, 'greenhouse_glass_frosted'), mesh(high, cfg.glassColour, cfg.glassOpacity, 'greenhouse_glass')];
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const non = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let n = 0;
  for (const p of non) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const p of non) {
    pos.set(p.getAttribute('position').array as Float32Array, o);
    o += p.getAttribute('position').count * 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

/** the stone floor: flagstones in running courses, grout, moss and damp patches */
export function floorTexture(cfg: GreenhouseConfig): THREE.CanvasTexture {
  const L = cfg.halfLength, W = cfg.halfWidth, k = cfg.floorTexelsPerMetre;
  const w = Math.round(2 * L * k), h = Math.round(2 * W * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = cfg.groutColour;
  g.fillRect(0, 0, w, h);
  const base = new THREE.Color(cfg.flagColour);
  const moss = new THREE.Color('#5f7a45');
  const damp = new THREE.Color('#7d7563');
  const col = new THREE.Color();
  const [fw, fd] = cfg.flagSize;
  const h01 = (a: number, b: number, c: number, seed: number) => hash3(a, b, c, seed) / 4294967296;   // in [0, 1)
  let row = 0;
  for (let y = 0; y < 2 * W; y += fd, row++) {
    const off = (row % 3) * fw * 0.37;
    for (let x = -off; x < 2 * L; x += fw) {
      const r = h01(Math.round(x * 10), row, 3, cfg.seed);
      const ww = fw * (0.8 + 0.4 * h01(row, Math.round(x * 10), 5, cfg.seed));
      col.copy(base).multiplyScalar(0.88 + 0.2 * r);
      const wx = x + ww / 2 - L, wz = y + fd / 2 - W;
      const m = fbm(wx, wz, 3.5, cfg.seed + 7, 3);
      if (m > 1 - cfg.moss) col.lerp(moss, Math.min(0.55, (m - (1 - cfg.moss)) * 3));
      const d = fbm(wx, wz, 6, cfg.seed + 19, 2);
      if (d > 0.6) col.lerp(damp, (d - 0.6) * 1.2);
      g.fillStyle = `#${col.getHexString()}`;
      const gap = 0.035 * k;
      g.fillRect(Math.max(0, x * k) + gap, y * k + gap, Math.min(ww, 2 * L - x) * k - 2 * gap, fd * k - 2 * gap);
      // a little speckle
      for (let s = 0; s < 6; s++) {
        const sx = (x + ww * h01(s, row, Math.round(x * 10), cfg.seed + 2)) * k;
        const sy = (y + fd * h01(row, s, Math.round(x * 10), cfg.seed + 3)) * k;
        g.fillStyle = `rgba(40,36,30,${0.08 + 0.1 * h01(s, s, row, cfg.seed)})`;
        g.fillRect(sx, sy, 2, 2);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
