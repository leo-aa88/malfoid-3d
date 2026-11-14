import * as THREE from 'three';
import type { PitchConfig } from './config';
import { cloudTexture, groundExtent, outerGrass } from './textures';
import { fbm, rng, smoothstep } from '../forest/random';

/*
 * The land round the stadium (scenery only: nothing out here collides): rolling hills, clumps
 * of trees, the castle's plateau (the castle: castle.ts), a sky dome with a few clouds. Flat under the stadium (the
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
    const a = rand() * Math.PI * 2, r = 430 + rand() * 150;   // beyond the castle (280 m), so none crosses it
    s.position.set(Math.cos(a) * r, 110 + rand() * 90, Math.sin(a) * r);
    s.scale.set(140 + rand() * 120, 60 + rand() * 40, 1);
    g.add(s);
  }
  return g;
}
