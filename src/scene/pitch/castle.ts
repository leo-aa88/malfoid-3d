import * as THREE from 'three';
import type { PitchConfig } from './config';
import { Kit, jitter } from './kit';
import { castleSite, landHeight } from './landscape';
import { lump } from '../forest/geometry';
import { rng, smoothstep } from '../forest/random';

/*
 * The castle on its crag: scenery only (about 280 m off; nothing collides with it). Gothic and
 * generated here: stone ranges with a plinth, string courses, buttresses and pointed windows
 * under steep slate roofs between stone gables; round and octagonal towers with corbelled tops
 * and tall cones; a crenellated curtain wall with a gatehouse, on a rock podium above the hill.
 *
 * Laid out in local metres: +x along the front, +y up from the podium's foot, +z away from the
 * pitch (the front faces it). The whole frame is scaled by cfg.castleScale.
 */

export const CASTLE = {
  /** the rock podium the castle stands on: its height above the hill (m, local) */
  podium: 8,
  /** curtain wall height above the podium (m) */
  wallHeight: 11,
  /** merlon spacing along a parapet (m) */
  merlon: 2.2,
  /** a cone's height per tower radius */
  coneRatio: 3.2,
  stone: '#968e80',
  trim: '#77705f',          // plinths, string courses, cornices, gables' copings
  rock: '#5e5c58',
  slate: '#3b4658',
  window: '#22262f',
  paving: '#7e786c',
};

/** the podium's outline (local x, z; counter-clockwise seen from above), the gate on the front edge */
const OUTLINE: [number, number][] = [[-66, -30], [-30, -42], [20, -44], [60, -28], [70, 10], [50, 42], [0, 48], [-50, 44], [-72, 12]];
const GATE: [number, number] = [-5, -43];

type Top = 'cone' | 'parapet' | 'stage';
interface Tower { x: number; z: number; r: number; h: number; top: Top; sides?: number }
interface Range { x: number; z: number; w: number; d: number; h: number; roof: number; yaw?: number; storeys: number;
  tall?: boolean; turrets?: boolean }

const TOWERS: Tower[] = [
  { x: -6, z: 10, r: 5.2, h: 56, top: 'stage' },            // the tall tower: a lantern stage on top
  { x: -44, z: -24, r: 6.5, h: 34, top: 'cone' },
  { x: 38, z: 22, r: 6, h: 42, top: 'cone' },
  { x: 27, z: -22, r: 4.4, h: 38, top: 'cone', sides: 8 },
  { x: -38, z: 37, r: 4.2, h: 32, top: 'cone' },
  { x: 54, z: -8, r: 3.6, h: 26, top: 'cone', sides: 8 },
];
const RANGES: Range[] = [
  { x: -22, z: -14, w: 40, d: 15, h: 20, roof: 12, storeys: 1, tall: true },   // the great hall
  { x: 20, z: -2, w: 28, d: 22, h: 27, roof: 13, storeys: 4, turrets: true },  // the keep
  { x: -6, z: 30, w: 56, d: 12, h: 17, roof: 9, storeys: 3 },
  { x: -50, z: 12, w: 30, d: 12, h: 19, roof: 9, yaw: Math.PI / 2, storeys: 3 },
  { x: 46, z: 8, w: 22, d: 11, h: 15, roof: 8, yaw: Math.PI / 2, storeys: 2 },
];

const Y = new THREE.Vector3(0, 1, 0);
/** a placement: at (x, y, z), turned yaw (rad) about +y, scaled */
function at(x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, yaw), new THREE.Vector3(sx, sy, sz));
}

/** a pointed (lancet) window w x h, standing on y = 0 in the xy plane, facing +z */
function lancet(w: number, h: number): THREE.BufferGeometry {
  const r = w / 2, spring = h - w * 0.8;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, spring);
  s.quadraticCurveTo(r, spring + (h - spring) * 0.6, 0, h);
  s.quadraticCurveTo(-r, spring + (h - spring) * 0.6, -r, spring);
  s.lineTo(-r, 0);
  return new THREE.ShapeGeometry(s, 3);
}

/** a triangular prism: base half-width b, height h in the xy plane, extruded along +x over len */
function prism(b: number, h: number, len: number): THREE.BufferGeometry {
  const s = new THREE.Shape([new THREE.Vector2(-b, 0), new THREE.Vector2(b, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** a faceted rock column (six sides, corners pushed about), flat shaded */
function rockColumn(rTop: number, rBot: number, h: number, rand: () => number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 6, 2).toNonIndexed();
  const pos = g.getAttribute('position');
  const moved = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = moved.get(key);
    if (!d) {
      const top = pos.getY(i) > h / 2 - 1e-3;
      d = [(rand() - 0.5) * 0.45 * rBot, top ? (rand() - 0.5) * 0.25 * h : (rand() - 0.5) * 0.1 * h, (rand() - 0.5) * 0.45 * rBot];
      moved.set(key, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  g.computeVertexNormals();
  return g;
}

export function buildCastle(cfg: PitchConfig, kit: Kit): void {
  const C = CASTLE;
  const rand = rng(cfg.seed * 101 + 3);
  const site = castleSite(cfg);
  const k = cfg.castleScale;
  const baseY = landHeight(cfg, site.x, site.z);
  // the frame: on the hill at the site, facing the pitch (local +z away from it), scaled
  kit.setFrame(new THREE.Vector3(site.x, baseY, site.z), Math.atan2(site.x, site.z), k);
  const P = C.podium;
  // weathering: stone darker near its foot, rock darker down the slope (world y in, factor out)
  const weather = (y: number) => 0.8 + 0.2 * smoothstep(baseY + P * k, baseY + (P + 14) * k, y);
  const rockShade = (y: number) => 0.72 + 0.28 * smoothstep(baseY - 8 * k, baseY + P * k, y);
  const stone = () => jitter(C.stone, rand, 0.05);
  const windows = new Map<string, THREE.BufferGeometry>();
  const win = (m: THREE.Matrix4, w: number, h: number) => {
    const key = `${w},${h}`;
    if (!windows.has(key)) windows.set(key, lancet(w, h));
    kit.add(windows.get(key)!.clone(), m, C.window);
  };
  const box = (M: THREE.Matrix4, x: number, y: number, z: number, w: number, h: number, d: number,
    col: THREE.ColorRepresentation, shade?: (y: number) => number, yaw = 0) =>
    kit.add(new THREE.BoxGeometry(1, 1, 1), M.clone().multiply(at(x, y, z, yaw, w, h, d)), col, shade);

  // --- the crag: rock columns round the outline, scree at their foot, paving on top ----------
  const n = OUTLINE.length;
  let cx = 0, cz = 0;
  for (const [x, z] of OUTLINE) { cx += x / n; cz += z / n; }
  for (let i = 0; i < n; i++) {
    const [x0, z0] = OUTLINE[i], [x1, z1] = OUTLINE[(i + 1) % n];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.round(len / 6));
    for (let s = 0; s < steps; s++) {
      const t = (s + rand() * 0.6) / steps;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const ox = x - cx, oz = z - cz, ol = Math.hypot(ox, oz);
      const out = 0.5 + rand() * 2.5;
      const r = 4 + rand() * 3;
      const top = P + (rand() - 0.4) * 2.2;
      const h = top + 14;
      kit.add(rockColumn(r * 0.75, r * 1.25, h, rand), at(x + (ox / ol) * out, top - h / 2, z + (oz / ol) * out, rand() * 6), C.rock, rockShade);
      if (rand() < 0.7) {
        const sr = 2 + rand() * 3.2, so = out + r + 2 + rand() * 6;
        const g = lump(sr, 0, rand, 0.3);
        g.computeVertexNormals();
        kit.add(g, at(x + (ox / ol) * so, -0.6, z + (oz / ol) * so, rand() * 6, 1, 0.55 + rand() * 0.3, 1), jitter(C.rock, rand, 0.08), rockShade);
      }
    }
  }
  const outline = new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x, -z)));
  // the crag's core: the outline as a solid of rock, so no grass shows between the columns
  kit.add(new THREE.ExtrudeGeometry(outline, { depth: P + 5.9, bevelEnabled: false }),
    new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, -6, 0), C.rock, rockShade);
  kit.add(new THREE.ShapeGeometry(outline), new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, P + 0.05, 0), C.paving);

  // --- ranges: plinth, body, courses, buttresses, windows, roof, gables, chimneys --------------
  for (const r of RANGES) {
    const M = at(r.x, P, r.z, r.yaw ?? 0);
    const { w, d, h } = r;
    box(M, 0, 0.9, 0, w + 1.2, 1.8, d + 1.2, C.trim, weather);
    box(M, 0, h / 2, 0, w, h, d, stone(), weather);
    const sh = h / r.storeys;
    for (let s = 1; s < r.storeys; s++) box(M, 0, s * sh, 0, w + 0.5, 0.45, d + 0.5, C.trim);
    box(M, 0, h - 0.3, 0, w + 0.8, 0.6, d + 0.8, C.trim);
    // bays between buttresses on the long faces
    const bays = Math.max(2, Math.round(w / (r.tall ? 6.5 : 5.2)));
    const bw = w / bays;
    for (const side of [-1, 1]) {
      for (let b = 0; b <= bays; b++) {
        const x = -w / 2 + b * bw;
        box(M, x, h * 0.42, side * (d / 2 + 0.6), 1.3, h * 0.84, 1.2, stone(), weather);
        box(M, x, h * 0.13, side * (d / 2 + 1.0), 1.7, h * 0.26, 2.0, stone(), weather);
      }
      for (let b = 0; b < bays; b++) {
        const x = -w / 2 + (b + 0.5) * bw;
        const face = (y: number) => M.clone().multiply(at(x, y, side * (d / 2 + 0.4), side > 0 ? 0 : Math.PI));
        if (r.tall) win(face(h * 0.22), Math.min(2.4, bw * 0.42), h * 0.6);
        else for (let s = 0; s < r.storeys; s++) win(face(s * sh + sh * 0.22), 1.4, sh * 0.5);
      }
    }
    // the ends: a window per storey (a great one for a tall hall)
    for (const side of [-1, 1]) {
      const face = (y: number) => M.clone().multiply(at(side * (w / 2 + 0.4), y, 0, side * Math.PI / 2));
      if (r.tall) win(face(h * 0.2), d * 0.3, h * 0.66);
      else for (let s = 0; s < r.storeys; s++) win(face(s * sh + sh * 0.22), 1.5, sh * 0.5);
    }
    // the roof between stone gables, a ridge cresting, chimneys
    kit.add(prism(d / 2 + 0.7, r.roof, w + 0.2), M.clone().multiply(at(0, h, 0)), jitter(C.slate, rand, 0.05));
    for (const side of [-1, 1]) {
      kit.add(prism(d / 2 + 0.3, r.roof + 1.1, 0.9), M.clone().multiply(at(side * (w / 2 + 0.1), h, 0)), stone());
      box(M, side * (w / 2 + 0.1), h + r.roof + 1.6, 0, 0.7, 1.6, 0.7, C.trim);                 // the finial
    }
    box(M, 0, h + r.roof + 0.1, 0, w, 0.35, 0.35, C.trim);
    for (const fx of [-0.28, 0.3]) box(M, fx * w, h + r.roof * 0.75, d * 0.12, 1.3, r.roof * 0.9, 1.3, stone());
    // corner turrets (bartizans): corbelled out at the top of the walls, with their own cones
    if (r.turrets) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tx = sx * (w / 2 + 0.3), tz = sz * (d / 2 + 0.3);
      kit.add(new THREE.CylinderGeometry(1.8, 0.5, 2.6, 10), M.clone().multiply(at(tx, h - 5.3, tz)), C.trim);
      kit.add(new THREE.CylinderGeometry(1.8, 1.8, 7, 10), M.clone().multiply(at(tx, h - 0.5, tz)), stone());
      kit.add(new THREE.ConeGeometry(2.2, 6.5, 10), M.clone().multiply(at(tx, h + 3 + 3.25, tz)), C.slate);
    }
  }

  // --- towers ---------------------------------------------------------------------------------
  const tower = (t: Tower, M: THREE.Matrix4) => {
    const sides = t.sides ?? 14;
    const { r, h } = t;
    kit.add(new THREE.CylinderGeometry(r * 1.1, r * 1.16, 2.4, sides), M.clone().multiply(at(0, 1.2, 0)), C.trim, weather);
    kit.add(new THREE.CylinderGeometry(r * 0.97, r * 1.05, h, sides), M.clone().multiply(at(0, h / 2, 0)), stone(), weather);
    const rAt = (y: number) => r * (1.05 - 0.08 * (y / h));
    for (let y = 9; y < h - 4; y += 9) {
      kit.add(new THREE.CylinderGeometry(rAt(y) + 0.22, rAt(y) + 0.22, 0.45, sides), M.clone().multiply(at(0, y, 0)), C.trim);
    }
    // windows climbing round the shaft
    let a = rand() * 6;
    for (let y = 4.5; y < h - 6; y += 6.2) {
      a += 2.2 + rand() * 0.6;
      const rr = rAt(y + 1.2) + 0.3;
      win(M.clone().multiply(at(Math.sin(a) * rr, y, Math.cos(a) * rr, a)), 1.1, 2.6);
    }
    // the corbelled gallery at the top
    const g = r * 1.18;
    const corbels = sides * 2;
    for (let i = 0; i < corbels; i++) {
      const b = (i / corbels) * Math.PI * 2;
      box(M, Math.sin(b) * (r + 0.15), h - 0.7, Math.cos(b) * (r + 0.15), 0.55, 1.4, 0.9, C.trim, undefined, b);
    }
    kit.add(new THREE.CylinderGeometry(g, g, 2.4, sides), M.clone().multiply(at(0, h + 1.2, 0)), stone());
    const parapet = (rad: number, y: number) => {
      const m = Math.max(8, Math.round((Math.PI * 2 * rad) / C.merlon));
      for (let i = 0; i < m; i++) {
        const b = (i / m) * Math.PI * 2;
        box(M, Math.sin(b) * (rad - 0.35), y + 0.7, Math.cos(b) * (rad - 0.35), 1.1, 1.4, 0.7, stone(), undefined, b);
      }
    };
    const cone = (rad: number, y: number) => {
      const ch = rad * C.coneRatio;
      kit.add(new THREE.CylinderGeometry(rad, rad + 0.5, 0.5, Math.max(sides, 16)), M.clone().multiply(at(0, y + 0.25, 0)), C.slate);
      kit.add(new THREE.ConeGeometry(rad, ch, Math.max(sides, 16)), M.clone().multiply(at(0, y + 0.5 + ch / 2, 0)), jitter(C.slate, rand, 0.05));
      kit.add(new THREE.CylinderGeometry(0.1, 0.16, 3.2, 5), M.clone().multiply(at(0, y + 0.5 + ch + 1.4, 0)), C.trim);
      kit.add(new THREE.SphereGeometry(0.4, 8, 6), M.clone().multiply(at(0, y + 0.5 + ch + 0.6, 0)), C.trim);
    };
    if (t.top === 'cone') cone(g + 0.1, h + 2.4);
    else {
      parapet(g, h + 2.4);
      if (t.top === 'stage') {
        // a narrower stage rising from the platform: lancets all round, a gallery, a tall cone
        const r2 = r * 0.6, h2 = r * 2.6, y0 = h + 2.4;
        kit.add(new THREE.CylinderGeometry(r2, r2, h2, sides), M.clone().multiply(at(0, y0 + h2 / 2, 0)), stone());
        for (let i = 0; i < 6; i++) {
          const b = (i / 6) * Math.PI * 2 + 0.3;
          win(M.clone().multiply(at(Math.sin(b) * (r2 + 0.3), y0 + h2 * 0.25, Math.cos(b) * (r2 + 0.3), b)), 1.2, h2 * 0.5);
        }
        kit.add(new THREE.CylinderGeometry(r2 * 1.15, r2, 1.2, sides), M.clone().multiply(at(0, y0 + h2 + 0.6, 0)), C.trim);
        cone(r2 * 1.2, y0 + h2 + 1.2);
      }
    }
  };
  for (const t of TOWERS) tower(t, at(t.x, P, t.z, rand() * 6));

  // --- the curtain wall: crenellated, arrow slits, a tower at every corner ---------------------
  const H = C.wallHeight;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = OUTLINE[i], [x1, z1] = OUTLINE[(i + 1) % n];
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dz, dx);
    const M = at((x0 + x1) / 2, P, (z0 + z1) / 2, yaw);
    // which local side faces out: local +z is (-dz, dx) / len in the frame
    const mx = (x0 + x1) / 2 - cx, mz = (z0 + z1) / 2 - cz;
    const out = (-dz * mx + dx * mz) > 0 ? 1 : -1;
    box(M, 0, H / 2, 0, len, H, 2.6, stone(), weather);
    box(M, 0, 1.0, out * 0.4, len, 2.0, 3.4, C.trim, weather);
    box(M, 0, H - 0.25, 0, len, 0.5, 3.0, C.trim);
    const m = Math.floor(len / C.merlon);
    for (let j = 0; j < m; j += 2) box(M, -len / 2 + (j + 0.5) * C.merlon, H + 0.7, out * 0.95, 1.1, 1.4, 0.7, stone());
    for (let s = 3; s < len - 2; s += 6) box(M, -len / 2 + s, H * 0.55, out * 1.35, 0.35, 2.2, 0.2, C.window);
    const corner: Tower = { x: x0, z: z0, r: 3.8 + rand() * 0.8, h: H + 6 + rand() * 4, top: i % 2 ? 'cone' : 'parapet', sides: 12 };
    tower(corner, at(x0, P, z0, rand() * 6));
  }
  // the gatehouse: a block across the front wall, two drum towers, the arch
  {
    const [x0, z0] = OUTLINE[1], [x1, z1] = OUTLINE[2];
    const yaw = Math.atan2(-(z1 - z0), x1 - x0);
    const M = at(GATE[0], P, GATE[1], yaw);
    box(M, 0, 8, 0, 13, 16, 9, stone(), weather);
    box(M, 0, 16.3, 0, 13.8, 0.6, 9.8, C.trim);
    for (let j = 0; j < 6; j++) box(M, -5.5 + j * 2.2, 17.3, -4.4, 1.1, 1.4, 0.7, stone());
    win(M.clone().multiply(at(0, 0, -4.9, Math.PI)), 4.4, 7.5);
    win(M.clone().multiply(at(0, 10, -4.9, Math.PI)), 1.6, 3.2);
    for (const sx of [-1, 1]) tower({ x: 0, z: 0, r: 3.4, h: 20, top: 'cone', sides: 12 }, M.clone().multiply(at(sx * 7.6, 0, -1.5)));
  }
  for (const g of windows.values()) g.dispose();
  kit.resetFrame();
}
