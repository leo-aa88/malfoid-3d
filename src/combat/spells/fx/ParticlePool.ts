import * as THREE from 'three';

export interface ParticleSpawn {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  r: number; g: number; b: number;
  size: number;          // m
  sizeEnd: number;       // m at the end of its life
  life: number;          // s
  drag?: number;         // 1/s
  gravity?: number;      // m/s^2 (negative falls, positive rises)
  alpha?: number;
}

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aAlpha;
attribute float aSize;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(-mv.z, 0.05);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0 || vAlpha <= 0.0) discard;
  float a = pow(1.0 - d, 1.6) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

/**
 * Fixed-size pool of glowing particles drawn in one call (additive points). Spawning
 * reuses the oldest slot; nothing is allocated after construction.
 */
export class ParticlePool {
  readonly points: THREE.Points;
  private readonly cap: number;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly alpha: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly drag: Float32Array;
  private readonly grav: Float32Array;
  private readonly a0: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private cursor = 0;
  private live = 0;
  private dirty = false;

  constructor(capacity = 1200) {
    this.cap = capacity;
    const f = (n: number) => new Float32Array(capacity * n);
    this.pos = f(3);
    this.col = f(3);
    this.alpha = f(1);
    this.size = f(1);
    this.vel = f(3);
    this.life = f(1);
    this.maxLife = f(1);
    this.size0 = f(1);
    this.size1 = f(1);
    this.drag = f(1);
    this.grav = f(1);
    this.a0 = f(1);
    const dyn = (a: Float32Array, n: number) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', dyn(this.pos, 3));
    this.geometry.setAttribute('aColor', dyn(this.col, 3));
    this.geometry.setAttribute('aAlpha', dyn(this.alpha, 1));
    this.geometry.setAttribute('aSize', dyn(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 500 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.points.name = 'spell_particles';
  }

  /** particles alive right now */
  get count(): number {
    return this.live;
  }

  /** world-size particles: pixels per metre at 1 m from the camera */
  setScale(viewportHeightPx: number, fovDeg: number): void {
    this.material.uniforms.uScale.value = viewportHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  spawn(p: ParticleSpawn): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    if (this.life[i] <= 0) this.live++;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = p.vx; this.vel[i3 + 1] = p.vy; this.vel[i3 + 2] = p.vz;
    this.col[i3] = p.r; this.col[i3 + 1] = p.g; this.col[i3 + 2] = p.b;
    this.life[i] = p.life;
    this.maxLife[i] = p.life;
    this.size0[i] = p.size;
    this.size1[i] = p.sizeEnd;
    this.size[i] = p.size;
    this.drag[i] = p.drag ?? 0;
    this.grav[i] = p.gravity ?? 0;
    this.a0[i] = p.alpha ?? 1;
    this.alpha[i] = this.a0[i];
    this.dirty = true;
  }

  update(dt: number): void {
    if (this.live === 0 && !this.dirty) return;
    let live = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.life[i] = 0;
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      live++;
      const i3 = i * 3;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= k;
      this.vel[i3 + 1] = this.vel[i3 + 1] * k + this.grav[i] * dt;
      this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const u = this.life[i] / this.maxLife[i];            // 1 -> 0
      this.alpha[i] = this.a0[i] * Math.pow(u, 1.2);
      this.size[i] = this.size1[i] + (this.size0[i] - this.size1[i]) * u;
    }
    this.live = live;
    this.dirty = false;
    for (const name of ['position', 'aColor', 'aAlpha', 'aSize']) {
      (this.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
    this.size.fill(0);
    this.live = 0;
    this.dirty = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
