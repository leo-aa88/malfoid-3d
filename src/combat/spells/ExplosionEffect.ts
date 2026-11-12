import * as THREE from 'three';
import type { ParticlePool } from './fx/ParticlePool';

const FIRE_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  vPos = position;
  gl_Position = projectionMatrix * mv;
}`;

const FIRE_FRAG = /* glsl */ `
uniform float uProgress;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  float facing = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
  float n = noise(vPos * 4.0 + vec3(0.0, -uTime * 4.0, 0.0)) * 0.65 + noise(vPos * 9.0 - uTime * 3.0) * 0.35;
  float heat = facing * 0.85 + n * 0.55 - uProgress * 1.05;
  vec3 col = mix(vec3(0.65, 0.07, 0.0), vec3(1.0, 0.45, 0.06), smoothstep(0.0, 0.45, heat));
  col = mix(col, vec3(1.0, 0.93, 0.68), smoothstep(0.5, 0.95, heat));
  float a = smoothstep(-0.1, 0.35, heat) * (1.0 - uProgress) * (0.3 + 0.7 * facing);
  gl_FragColor = vec4(col, a);
}`;

/** shared by all explosion instances */
export interface ExplosionAssets {
  glow: THREE.Texture;
  ring: THREE.Texture;
  sphere: THREE.SphereGeometry;
  plane: THREE.PlaneGeometry;
}

export interface ExplosionStyle {
  duration: number;         // s
  radius: number;           // m: the shockwave ring reaches this (the blast's reach)
  fireballRadius: number;   // m
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * One reusable explosion: a flash, an expanding fireball, a shockwave ring and a burst of
 * sparks, flames and lingering embers (from the shared particle pool). Kept in the scene and
 * hidden while idle; start() replays it.
 */
export class ExplosionEffect {
  readonly group = new THREE.Group();
  private readonly flash: THREE.Sprite;
  private readonly fireball: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly fireMat: THREE.ShaderMaterial;
  private readonly flashMat: THREE.SpriteMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private t = -1;

  constructor(assets: ExplosionAssets, private readonly style: ExplosionStyle) {
    this.flashMat = new THREE.SpriteMaterial({
      map: assets.glow, color: new THREE.Color(1.0, 0.85, 0.6), blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true,
    });
    this.flash = new THREE.Sprite(this.flashMat);
    this.fireMat = new THREE.ShaderMaterial({
      vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG,
      uniforms: { uProgress: { value: 0 }, uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.fireball = new THREE.Mesh(assets.sphere, this.fireMat);
    this.ringMat = new THREE.MeshBasicMaterial({
      map: assets.ring, color: new THREE.Color(1.0, 0.55, 0.15), blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(assets.plane, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    for (const o of [this.flash, this.fireball, this.ring]) {
      o.renderOrder = 11;
      o.frustumCulled = false;
      this.group.add(o);
    }
    this.group.visible = false;
    this.group.name = 'explosion';
  }

  get active(): boolean {
    return this.t >= 0;
  }

  /** seconds since the blast (-1 when idle) */
  get time(): number {
    return this.t;
  }

  start(at: THREE.Vector3, particles: ParticlePool, dir: THREE.Vector3): void {
    this.t = 0;
    this.group.position.copy(at);
    this.group.visible = true;
    this.apply();
    // sparks: fast, fall
    for (let i = 0; i < 70; i++) {
      const v = randomDir().multiplyScalar(rand(3, 7.5)).addScaledVector(dir, -1.5);
      const w = Math.random();
      particles.spawn({ x: at.x, y: at.y, z: at.z, vx: v.x, vy: v.y + 1.2, vz: v.z, r: 1, g: 0.75 + 0.25 * w, b: 0.35 + 0.4 * w,
        size: rand(0.04, 0.08), sizeEnd: 0.01, life: rand(0.35, 0.7), drag: 1.6, gravity: -9.8 });
    }
    // flames: puff outwards and upwards, slow down
    for (let i = 0; i < 46; i++) {
      const v = randomDir().multiplyScalar(rand(0.8, 2.6));
      const hot = Math.random();
      particles.spawn({ x: at.x, y: at.y, z: at.z, vx: v.x, vy: v.y + 0.6, vz: v.z, r: 1, g: 0.25 + 0.4 * hot, b: 0.04 + 0.08 * hot,
        size: rand(0.35, 0.6), sizeEnd: 0.12, life: rand(0.3, 0.55), drag: 3.5, gravity: 1.5, alpha: 0.8 });
    }
    // embers: drift up and linger a little
    for (let i = 0; i < 28; i++) {
      const v = randomDir().multiplyScalar(rand(0.3, 1.2));
      particles.spawn({ x: at.x + v.x * 0.3, y: at.y + v.y * 0.3, z: at.z + v.z * 0.3, vx: v.x, vy: Math.abs(v.y) + rand(0.4, 1.1), vz: v.z,
        r: 1, g: rand(0.35, 0.6), b: 0.08, size: rand(0.03, 0.06), sizeEnd: 0.015, life: rand(0.8, 1.5), drag: 1.2, gravity: 0.35 });
    }
  }

  /** returns the flash light intensity factor (0..1) for this frame */
  update(dt: number): number {
    if (this.t < 0) return 0;
    this.t += dt;
    if (this.t >= this.style.duration) {
      this.t = -1;
      this.group.visible = false;
      return 0;
    }
    this.apply();
    return Math.exp(-this.t / 0.09);
  }

  private apply(): void {
    const D = this.style.duration;
    const u = this.t / D;
    // flash: blinding and short
    const fu = Math.min(1, this.t / 0.16);
    this.flash.scale.setScalar(0.6 + 3.2 * Math.sqrt(fu));
    this.flashMat.opacity = Math.max(0, 1 - fu) ** 1.5;
    // fireball: fast expansion, slowing; burns out
    const grow = 1 - Math.pow(1 - Math.min(1, this.t / (0.6 * D)), 3);
    this.fireball.scale.setScalar(0.15 + this.style.fireballRadius * grow);
    this.fireMat.uniforms.uProgress.value = Math.min(1, u * 1.05);
    this.fireMat.uniforms.uTime.value = this.t;
    // shockwave ring: out to the blast radius
    const ru = Math.min(1, this.t / (0.75 * D));
    const r = this.style.radius * (1 - Math.pow(1 - ru, 2));
    this.ring.scale.setScalar(Math.max(0.01, 2 * r));
    this.ringMat.opacity = 0.95 * (1 - ru) ** 1.4;
  }

  dispose(): void {
    this.flashMat.dispose();
    this.fireMat.dispose();
    this.ringMat.dispose();
  }
}

const scratch = new THREE.Vector3();

/** random unit vector (written into a shared scratch vector: use it before the next call) */
export function randomDir(): THREE.Vector3 {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return scratch.set(s * Math.cos(a), u, s * Math.sin(a));
}
