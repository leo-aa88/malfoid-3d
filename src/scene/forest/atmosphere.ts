import * as THREE from 'three';
import type { ForestConfig } from './config';
import { rng } from './random';

/*
 * Everything around the forest that follows the player rather than living in a chunk: the
 * night sky and moon, rings of distant tree silhouettes (seen past the fog in every
 * direction), floating motes and fireflies (wrapped round the player in the shader, so they
 * never run out), and eyes that open in the dark now and then.
 */

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** a strip of dark tree silhouettes (alpha), tiled round a cylinder */
function silhouetteTexture(seed: number, density: number): THREE.CanvasTexture {
  const r = rng(seed);
  const t = canvasTexture(2048, 512, (g) => {
    g.fillStyle = '#fff';
    for (let i = 0; i < density; i++) {
      const x = r() * 2048;
      const w = 10 + r() * 34;
      const top = 30 + r() * 220;
      g.beginPath();
      g.moveTo(x - w, 512);
      // a crooked trunk
      let cx = x;
      for (let y = 512; y > top; y -= 40) {
        cx += (r() - 0.5) * 10;
        g.lineTo(cx - w * (0.35 + 0.65 * (y - top) / (512 - top)), y);
      }
      g.lineTo(cx + 2, top);
      for (let y = top; y < 512; y += 40) g.lineTo(cx + w * (0.35 + 0.65 * (y - top) / (512 - top)), y);
      g.lineTo(x + w, 512);
      g.fill();
      // branches
      g.lineCap = 'round';
      g.strokeStyle = '#fff';
      for (let b = 0; b < 5; b++) {
        const by = top + r() * (300 - top * 0.3);
        const dir = r() < 0.5 ? -1 : 1;
        g.lineWidth = 2 + r() * 6;
        g.beginPath();
        g.moveTo(cx, by);
        g.quadraticCurveTo(cx + dir * 40, by - 30, cx + dir * (60 + r() * 90), by - 40 - r() * 60);
        g.stroke();
      }
      // a ragged crown
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.arc(cx + (r() - 0.5) * 120, top + r() * 60, 18 + r() * 40, 0, Math.PI * 2);
        g.fill();
      }
    }
    // the forest floor band
    g.fillRect(0, 470, 2048, 42);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function glowTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  gl_FragColor = vec4(mix(uHorizon, uTop, pow(h, 0.6)), 1.0);
}`;

const MOTE_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aPhase;
attribute float aBlink;
uniform float uTime;
uniform vec3 uCentre;
uniform vec3 uBox;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  // drift, then wrap into a box round the player: an endless supply of motes
  vec3 p = position + vec3(sin(uTime * 0.21 + aPhase) * 0.8, sin(uTime * 0.37 + aPhase * 1.7) * 0.4, cos(uTime * 0.17 + aPhase) * 0.8);
  p.xz = mod(p.xz - uCentre.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5 + uCentre.xz;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
  float blink = aBlink > 0.5 ? smoothstep(0.55, 1.0, sin(uTime * (0.6 + aPhase * 0.05) + aPhase * 7.0)) : 1.0;
  // fade with distance like fog, and near the camera
  float d = -mv.z;
  vAlpha = blink * smoothstep(60.0, 20.0, d) * smoothstep(0.4, 1.5, d);
  vColor = aColor;
}`;
const MOTE_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  gl_FragColor = vec4(vColor, pow(1.0 - d, 1.8) * vAlpha);
}`;

interface Eyes {
  a: THREE.Sprite;
  b: THREE.Sprite;
  t: number;            // time into this appearance (-ve: waiting)
  dur: number;
}

export class Atmosphere {
  readonly group = new THREE.Group();
  private readonly sky: THREE.Mesh;
  private readonly moon: THREE.Group;
  private readonly rings: THREE.Mesh[] = [];
  private readonly motes: THREE.Points | null = null;
  private readonly moteMat: THREE.ShaderMaterial | null = null;
  private readonly eyes: Eyes[] = [];
  private readonly glow = glowTexture();
  private readonly disposables: { dispose(): void }[] = [];
  private time = 0;
  private readonly r = rng(424242);
  private readonly moonDir = new THREE.Vector3(0, 1, 0);

  constructor(cfg: ForestConfig) {
    this.group.name = 'forest_atmosphere';
    // sky: a gradient dome from the fog colour at the horizon to a deep night blue
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color('#080b13') }, uHorizon: { value: new THREE.Color(cfg.fogColor) } },
    });
    const skyGeo = new THREE.SphereGeometry(190, 24, 12);
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    // moon with a soft halo, where the moonlight comes from
    this.moon = new THREE.Group();
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: '#eef3ff', fog: false, depthWrite: false }));
    disc.scale.setScalar(9);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: '#5d7398', fog: false, depthWrite: false,
      transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(46);
    this.moon.add(halo, disc);
    this.group.add(this.sky, this.moon);
    this.disposables.push(skyGeo, skyMat, disc.material, halo.material);

    // distant forest: two rings of silhouettes past the fog, so every direction looks deep
    for (const [radius, colour, opacity, seed, dens, rep] of [
      [96, '#121821', 0.95, 7, 70, 6], [76, '#18202c', 0.9, 19, 55, 5],
    ] as [number, string, number, number, number, number][]) {
      const tex = silhouetteTexture(seed, dens);
      tex.repeat.set(rep, 1);
      const geo = new THREE.CylinderGeometry(radius, radius, 46, 48, 1, true);
      geo.translate(0, 21, 0);
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: colour, transparent: true, opacity, side: THREE.BackSide,
        fog: false, depthWrite: false, alphaTest: 0.02 });
      // the texture is white where trees are: use it as alpha
      mat.alphaMap = tex;
      mat.map = null;
      const ring = new THREE.Mesh(geo, mat);
      ring.renderOrder = -5;
      ring.frustumCulled = false;
      this.rings.push(ring);
      this.group.add(ring);
      this.disposables.push(tex, geo, mat);
    }

    // floating dust, magical motes and fireflies
    if (cfg.particlesEnabled) {
      const n = cfg.dustMotes + cfg.magicMotes + cfg.fireflies;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const size = new Float32Array(n);
      const phase = new Float32Array(n);
      const blink = new Float32Array(n);
      const r = this.r;
      const box = 50;
      for (let i = 0; i < n; i++) {
        const kind = i < cfg.dustMotes ? 0 : i < cfg.dustMotes + cfg.magicMotes ? 1 : 2;
        pos[i * 3] = (r() - 0.5) * box;
        pos[i * 3 + 1] = kind === 2 ? 0.4 + r() * 2.6 : 0.2 + r() * (kind === 0 ? 9 : 5);
        pos[i * 3 + 2] = (r() - 0.5) * box;
        const c = kind === 0 ? [0.42, 0.48, 0.58] : kind === 1 ? [0.45, 0.95, 0.85] : [0.85, 1.0, 0.45];
        col.set(c, i * 3);
        size[i] = kind === 0 ? 0.035 + r() * 0.03 : kind === 1 ? 0.07 + r() * 0.05 : 0.09 + r() * 0.05;
        phase[i] = r() * 100;
        blink[i] = kind === 2 ? 1 : 0;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
      geo.setAttribute('aBlink', new THREE.BufferAttribute(blink, 1));
      this.moteMat = new THREE.ShaderMaterial({
        vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uCentre: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(box, 1, box) },
          uScale: { value: 500 } },
      });
      this.motes = new THREE.Points(geo, this.moteMat);
      this.motes.frustumCulled = false;
      this.group.add(this.motes);
      this.disposables.push(geo, this.moteMat);
    }

    // eyes in the dark: pairs that open, blink and fade far between the trees
    for (let i = 0; i < cfg.eyes; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.glow, color: '#d8ff7a', transparent: true, opacity: 0, fog: false,
        depthWrite: false, blending: THREE.AdditiveBlending });
      const a = new THREE.Sprite(mat);
      const b = new THREE.Sprite(mat);
      a.scale.setScalar(0.32);
      b.scale.setScalar(0.32);
      this.group.add(a, b);
      this.eyes.push({ a, b, t: -this.r() * 12, dur: 0 });
      this.disposables.push(mat);
    }
  }

  /** the moon's direction (from the player), shared with the moonlight */
  setMoon(dir: THREE.Vector3): void {
    this.moonDir.copy(dir).normalize();
  }

  update(dt: number, centre: THREE.Vector3, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    this.time += dt;
    this.sky.position.set(centre.x, 0, centre.z);
    this.moon.position.set(centre.x, 0, centre.z).addScaledVector(this.moonDir, 170);
    for (const ring of this.rings) ring.position.set(centre.x, 0, centre.z);
    if (this.moteMat) {
      this.moteMat.uniforms.uTime.value = this.time;
      this.moteMat.uniforms.uCentre.value.copy(centre);
      this.moteMat.uniforms.uScale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    }
    // eyes
    for (const e of this.eyes) {
      e.t += dt;
      const mat = e.a.material;
      if (e.t < 0) {
        mat.opacity = 0;
        continue;
      }
      if (e.dur === 0) {
        // appear somewhere between the far trees, at eye height of something large
        const a = this.r() * Math.PI * 2;
        const d = 32 + this.r() * 20;
        const y = 0.6 + this.r() * 1.6;
        const px = centre.x + Math.cos(a) * d;
        const pz = centre.z + Math.sin(a) * d;
        const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.28);
        e.a.position.set(px + side.x, y, pz + side.z);
        e.b.position.set(px - side.x, y, pz - side.z);
        e.dur = 3 + this.r() * 5;
      }
      const u = e.t / e.dur;
      const blinkClosed = Math.sin(e.t * 2.1) > 0.97;
      mat.opacity = blinkClosed ? 0 : 0.85 * Math.min(1, u * 4) * Math.min(1, (1 - u) * 4);
      if (e.t >= e.dur) {
        e.t = -(4 + this.r() * 14);
        e.dur = 0;
      }
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.glow.dispose();
  }
}
