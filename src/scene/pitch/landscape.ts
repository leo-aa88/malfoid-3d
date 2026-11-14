import * as THREE from 'three';
import type { PitchConfig } from './config';
import { Kit, jitter } from './kit';
import { cloudTexture, groundExtent, outerGrass } from './textures';
import { fbm, rng, smoothstep } from '../forest/random';

/*
 * The land round the stadium (scenery only: nothing out here collides): rolling hills, clumps
 * of trees, the castle on a rise, a sky dome with a few clouds. Flat under the stadium (the
 * ground texture covers it); the hills start a little way out and the far ridge closes the view.
 */

/** where the castle stands (world, on its plateau) */
export function castleSite(cfg: PitchConfig): THREE.Vector3 {
  const b = (cfg.castleBearing * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(b) * cfg.castleDistance, 0, -Math.cos(b) * cfg.castleDistance);
}

/** land height at (x, z) (m); below 0 under the ground texture */
export function landHeight(cfg: PitchConfig, x: number, z: number): number {
  const { halfX, halfZ } = groundExtent(cfg);
  const q = Math.max(Math.abs(x) - halfX, Math.abs(z) - halfZ);       // metres outside the ground texture
  if (q < 0) return -0.4;
  const r = Math.hypot(x, z);
  let h = -0.4 + 0.4 * smoothstep(0, 3, q);
  h += cfg.hillHeight * smoothstep(15, 170, q) * (fbm(x, z, 150, cfg.seed + 5, 3) * 1.4 - 0.25);
  h += 90 * smoothstep(380, cfg.landRadius, r) * fbm(x, z, 220, cfg.seed + 9, 2);       // the far ridge
  // the castle's plateau
  const c = castleSite(cfg);
  const dc = Math.hypot(x - c.x, z - c.z);
  const plateau = 26 * cfg.castleScale;
  h += (plateau - h) * (1 - smoothstep(90 * cfg.castleScale, 150 * cfg.castleScale, dc));
  return h;
}

export function buildTerrain(cfg: PitchConfig): THREE.BufferGeometry {
  const rings = 70, segs = 120;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const near = outerGrass(cfg);
  const far = new THREE.Color('#5b6e45');
  const earth = new THREE.Color('#6f6446');
  const c = new THREE.Color();
  for (let i = 0; i <= rings; i++) {
    const r = cfg.landRadius * Math.pow(i / rings, 1.55);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = landHeight(cfg, x, z);
      pos.push(x, y, z);
      const k = smoothstep(80, 420, r);
      c.copy(near).lerp(far, k);
      const n = fbm(x, z, 40, cfg.seed + 21, 2);
      if (n > 0.62) c.lerp(earth, (n - 0.62) * 1.5);
      c.multiplyScalar(0.92 + 0.16 * fbm(x, z, 12, cfg.seed + 33, 2));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * segs + j, b = i * segs + ((j + 1) % segs), cc = a + segs, d = b + segs;
    idx.push(a, b, cc, b, d, cc);                                  // counter-clockwise seen from above
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** clumps of trees on the hills (conifers and broadleaf), clear of the stadium and the castle */
export function buildTrees(cfg: PitchConfig, kit: Kit): void {
  const rand = rng(cfg.seed * 31 + 5);
  const { halfX, halfZ } = groundExtent(cfg);
  const castle = castleSite(cfg);
  let placed = 0;
  for (let tries = 0; placed < cfg.trees && tries < cfg.trees * 30; tries++) {
    const r = 75 + Math.pow(rand(), 0.8) * 360;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < halfX + 8 && Math.abs(z) < halfZ + 8) continue;
    if (Math.hypot(x - castle.x, z - castle.z) < 110 * cfg.castleScale) continue;
    if (fbm(x, z, 70, cfg.seed + 41, 2) < 0.5) continue;          // in clumps, open meadow between
    const y = landHeight(cfg, x, z);
    const s = 0.8 + rand() * 0.7;
    if (rand() < 0.6) {
      kit.pole(new THREE.Vector3(x, y - 0.5, z), new THREE.Vector3(x, y + 2.2 * s, z), 0.35 * s, 0.25 * s, '#4f3b28', 5);
      const m = new THREE.Matrix4().setPosition(x, y + 2 * s + 4.2 * s, z).multiply(new THREE.Matrix4().makeScale(2.6 * s, 8.4 * s, 2.6 * s));
      kit.add(new THREE.ConeGeometry(1, 1, 7, 1), m, jitter('#2f4e2c', rand, 0.15));
    } else {
      kit.pole(new THREE.Vector3(x, y - 0.5, z), new THREE.Vector3(x, y + 3.0 * s, z), 0.4 * s, 0.3 * s, '#55402b', 5);
      const m = new THREE.Matrix4().setPosition(x, y + 5.2 * s, z).multiply(new THREE.Matrix4().makeScale(3.6 * s, 3.2 * s, 3.6 * s));
      kit.add(new THREE.IcosahedronGeometry(1, 1), m, jitter('#45663a', rand, 0.15));
    }
    placed++;
  }
}

/** the castle: keep, great hall, round towers with slate cones, curtain walls (seen from afar) */
export function buildCastle(cfg: PitchConfig, kit: Kit): void {
  const rand = rng(cfg.seed * 101 + 3);
  const site = castleSite(cfg);
  const base = landHeight(cfg, site.x, site.z);
  const k = cfg.castleScale;
  // face the pitch: local +z points away from it
  kit.setFrame(new THREE.Vector3(site.x, base, site.z), Math.atan2(site.x, site.z));
  const stone = (amt = 0.08) => jitter('#7a7468', rand, amt);
  const slate = '#3c4554';
  const block = (x: number, z: number, w: number, d: number, h: number, roof = 0) => {
    kit.box(x * k, (h / 2) * k, z * k, w * k, h * k, d * k, stone());
    if (roof) {
      // a pitched roof along x: a triangular prism
      const shape = new THREE.Shape([new THREE.Vector2(-d / 2 * k, 0), new THREE.Vector2(d / 2 * k, 0), new THREE.Vector2(0, roof * k)]);
      const g = new THREE.ExtrudeGeometry(shape, { depth: w * k, bevelEnabled: false });
      kit.add(g, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(-w / 2 * k + x * k, h * k, z * k), slate);
    }
  };
  const tower = (x: number, z: number, r: number, h: number, cone: number) => {
    kit.pole(new THREE.Vector3(x * k, 0, z * k), new THREE.Vector3(x * k, h * k, z * k), r * 1.08 * k, r * k, stone(0.06), 12);
    kit.add(new THREE.CylinderGeometry(r * 1.18 * k, r * 1.18 * k, 1.6 * k, 12), new THREE.Matrix4().setPosition(x * k, (h + 0.6) * k, z * k), stone(0.04));
    kit.roof(x * k, (h + 1.4) * k, z * k, r * 1.22 * k, cone * k, 12, slate);
  };
  block(0, 0, 46, 30, 24, 12);                  // the keep
  block(-30, 18, 58, 14, 20, 9);                // great hall
  block(34, -6, 30, 22, 18, 8);
  block(6, 30, 40, 12, 14, 7);
  tower(-20, -18, 6, 46, 18);
  tower(22, -20, 5, 40, 15);
  tower(-58, 10, 5.5, 34, 14);
  tower(52, 14, 6.5, 38, 16);
  tower(-4, -4, 4.2, 66, 22);                   // the astronomy tower
  tower(28, 32, 4.5, 30, 12);
  tower(-44, 34, 4.5, 28, 12);
  // curtain walls with crenellations
  const walls: [number, number, number, number][] = [[-58, 10, -20, -18], [-20, -18, 22, -20], [22, -20, 52, 14], [52, 14, 28, 32], [28, 32, -44, 34], [-44, 34, -58, 10]];
  for (const [x0, z0, x1, z1] of walls) {
    const a = new THREE.Vector3(x0 * k, 6 * k, z0 * k), b = new THREE.Vector3(x1 * k, 6 * k, z1 * k);
    const len = a.distanceTo(b);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    kit.box(mid.x, 6 * k, mid.z, len, 12 * k, 3 * k, stone(), yaw);
    const n = Math.floor(len / (3 * k));
    for (let i = 0; i < n; i += 2) {
      const p = a.clone().lerp(b, (i + 0.5) / n);
      kit.box(p.x, 12.8 * k, p.z, 1.5 * k, 1.6 * k, 3.2 * k, stone(0.05), yaw);
    }
  }
  kit.resetFrame();
}

/** the sky dome: a gradient from the horizon haze to deep blue overhead (no fog on it) */
export function buildSky(cfg: PitchConfig): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(cfg.skyTop) }, horizon: { value: new THREE.Color(cfg.skyHorizon) } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
      void main() { float k = smoothstep(-0.02, 0.45, vDir.y); gl_FragColor = vec4(mix(horizon, top, k), 1.0);
      #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(cfg.landRadius * 0.95, 24, 12), mat);
  m.name = 'pitch_sky';
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

export function buildClouds(cfg: PitchConfig): THREE.Group {
  const g = new THREE.Group();
  const rand = rng(cfg.seed * 13 + 1);
  const textures = [0, 1, 2].map((i) => cloudTexture(97 + i * 31));
  for (let i = 0; i < cfg.clouds; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures[i % 3], fog: false, depthWrite: false, transparent: true, opacity: 0.85 }));
    const a = rand() * Math.PI * 2, r = 280 + rand() * 260;
    s.position.set(Math.cos(a) * r, 110 + rand() * 90, Math.sin(a) * r);
    s.scale.set(140 + rand() * 120, 60 + rand() * 40, 1);
    g.add(s);
  }
  return g;
}
