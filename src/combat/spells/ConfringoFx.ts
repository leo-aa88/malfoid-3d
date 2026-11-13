import * as THREE from 'three';
import { ExplosionAssets, ExplosionEffect, randomDir } from './ExplosionEffect';
import { ParticlePool } from './fx/ParticlePool';
import { glowTexture, ringTexture } from './fx/textures';
import type { Impact, Projectile } from './Projectile';
import type { SpellEmitter } from './SpellEmitter';
import type { SpellDef, SpellFx } from './SpellSystem';
import { CONFRINGO_EXPLOSION_DURATION, CONFRINGO_EXPLOSION_RADIUS } from './Confringo';

/** colours and sizes of one spell's effects (the same pools and meshes draw every spell) */
export interface SpellLook {
  core: THREE.Color;          // white-hot centre of the bolt
  inner: THREE.Color;         // glow round it
  halo: THREE.Color;          // outer glow
  light: THREE.Color;         // point light colour
  /** particle colour from the fire palette (r = 1, g / b vary): Confringo keeps it as it is */
  tint: (r: number, g: number, b: number) => [number, number, number];
  bolt: number;               // core radius in flight (m)
  explosion: { fireball: number; ring: number; duration: number; sparks: number; fire: [THREE.Color, THREE.Color, THREE.Color];
    flash: THREE.Color; ringColour: THREE.Color };
  blastLight: number;         // intensity of the impact light
}

export const CONFRINGO_LOOK: SpellLook = {
  core: new THREE.Color(1.0, 0.82, 0.42),
  inner: new THREE.Color(1.0, 0.52, 0.12),
  halo: new THREE.Color(1.0, 0.42, 0.08),
  light: new THREE.Color(1.0, 0.55, 0.2),
  tint: (r, g, b) => [r, g, b],
  bolt: 0.065,
  explosion: {
    fireball: 0.95, ring: CONFRINGO_EXPLOSION_RADIUS, duration: CONFRINGO_EXPLOSION_DURATION, sparks: 1,
    fire: [new THREE.Color(0.65, 0.07, 0.0), new THREE.Color(1.0, 0.45, 0.06), new THREE.Color(1.0, 0.93, 0.68)],
    flash: new THREE.Color(1.0, 0.85, 0.6), ringColour: new THREE.Color(1.0, 0.55, 0.15),
  },
  blastLight: 9,
};
const MAX_PROJECTILES = 2;
const MAX_EXPLOSIONS = 2;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** glowing fire ball: a white-hot core, an orange glow and a red-orange halo (sprites + sphere) */
class FireOrb {
  readonly group = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly inner: THREE.Sprite;
  private readonly outer: THREE.Sprite;
  private readonly coreMat: THREE.MeshBasicMaterial;
  private readonly innerMat: THREE.SpriteMaterial;
  private readonly outerMat: THREE.SpriteMaterial;

  constructor(glow: THREE.Texture, sphere: THREE.SphereGeometry, look: SpellLook) {
    this.coreMat = new THREE.MeshBasicMaterial({ color: look.core, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.core = new THREE.Mesh(sphere, this.coreMat);
    this.innerMat = new THREE.SpriteMaterial({ map: glow, color: look.inner, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.outerMat = new THREE.SpriteMaterial({ map: glow, color: look.halo, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.inner = new THREE.Sprite(this.innerMat);
    this.outer = new THREE.Sprite(this.outerMat);
    for (const o of [this.outer, this.inner, this.core]) {
      o.renderOrder = 12;
      o.frustumCulled = false;
      this.group.add(o);
    }
    this.group.visible = false;
  }

  /** size: core radius (m); intensity 0..1 */
  set(at: THREE.Vector3, size: number, intensity: number): void {
    this.group.position.copy(at);
    const flicker = 0.88 + 0.24 * Math.random();
    this.core.scale.setScalar(size * (0.9 + 0.2 * Math.random()));
    this.inner.scale.setScalar(size * 4.0 * flicker);
    this.outer.scale.setScalar(size * 7.0 * (0.92 + 0.16 * Math.random()));
    this.coreMat.opacity = intensity;
    this.innerMat.opacity = 0.95 * intensity;
    this.outerMat.opacity = 0.7 * intensity;
  }

  dispose(): void {
    this.coreMat.dispose();
    this.innerMat.dispose();
    this.outerMat.dispose();
  }
}

/**
 * Confringo's look: fire gathering at the wand tip, a fiery bolt with a flame trail and sparks,
 * and the explosion. Everything is created once and reused (pools); two point lights stay in
 * the scene at zero intensity so the fire lights the scene without shader recompiles.
 */
export class ConfringoFx implements SpellFx {
  readonly particles = new ParticlePool(1200);
  private readonly glow = glowTexture();
  private readonly ring = ringTexture();
  private readonly sphere = new THREE.SphereGeometry(1, 24, 16);
  private readonly plane = new THREE.PlaneGeometry(1, 1);
  private readonly charge: FireOrb;
  private readonly bolts: { orb: FireOrb; id: number }[] = [];
  private readonly explosions: ExplosionEffect[] = [];
  private readonly orbLight: THREE.PointLight;
  private readonly blastLight: THREE.PointLight;
  private readonly root = new THREE.Group();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Vector3();
  private orbBoost = 0;

  constructor(scene: THREE.Scene, private readonly look: SpellLook = CONFRINGO_LOOK, name = 'confringo_fx') {
    this.orbLight = new THREE.PointLight(look.light, 0, 4.0, 2);
    this.blastLight = new THREE.PointLight(look.light, 0, 9.0, 2);
    this.root.name = name;
    scene.add(this.root);
    this.root.add(this.particles.points, this.orbLight, this.blastLight);
    this.charge = new FireOrb(this.glow, this.sphere, look);
    this.root.add(this.charge.group);
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const orb = new FireOrb(this.glow, this.sphere, look);
      this.root.add(orb.group);
      this.bolts.push({ orb, id: -1 });
    }
    const assets: ExplosionAssets = { glow: this.glow, ring: this.ring, sphere: this.sphere, plane: this.plane };
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      const e = new ExplosionEffect(assets, {
        duration: look.explosion.duration, radius: look.explosion.ring, fireballRadius: look.explosion.fireball,
        sparks: look.explosion.sparks, fire: look.explosion.fire, flash: look.explosion.flash, ring: look.explosion.ringColour,
        tint: look.tint,
      });
      this.root.add(e.group);
      this.explosions.push(e);
    }
  }

  private rgb(r: number, g: number, b: number): { r: number; g: number; b: number } {
    const [R, G, B] = this.look.tint(r, g, b);
    return { r: R, g: G, b: B };
  }

  /** keep particle sizes in metres for the current camera / canvas */
  setView(camera: THREE.PerspectiveCamera, viewportHeightPx: number): void {
    this.particles.setScale(viewportHeightPx, camera.fov);
  }

  /** debugging / tests: how much is alive */
  stats(): { particles: number; bolts: number; explosions: number; objects: number } {
    let objects = 0;
    this.root.traverse(() => objects++);
    return {
      particles: this.particles.count,
      bolts: this.bolts.filter((b) => b.id >= 0).length,
      explosions: this.explosions.filter((e) => e.active).length,
      objects,
    };
  }

  // --- SpellFx

  castStart(): void {
    this.charge.group.visible = true;
  }

  castUpdate(def: SpellDef, emitter: SpellEmitter, k: number): void {
    emitter.getWorldPosition(this.p);
    // gathers from 0.1 of the way in, brightens just before the thrust
    const grow = THREE.MathUtils.smoothstep(k, 0.15, 0.85);
    const peak = THREE.MathUtils.smoothstep(k, 0.8, 1.0);
    this.charge.set(this.p, 0.012 + 0.022 * grow + 0.01 * peak, Math.min(1, grow * 1.2 + 0.1));   // at the wand tip
    this.orbBoost = 0.5 * grow + 0.5 * peak;
    this.orbLight.position.copy(this.p);
    // sparks drawn in towards the tip
    if (grow > 0.05) {
      for (let i = 0; i < 2; i++) {
        const d = randomDir();
        const r = rand(0.07, 0.15);
        this.particles.spawn({
          x: this.p.x + d.x * r, y: this.p.y + d.y * r, z: this.p.z + d.z * r,
          vx: -d.x * r * 4, vy: -d.y * r * 4, vz: -d.z * r * 4,
          ...this.rgb(1, rand(0.5, 0.85), 0.15), size: rand(0.03, 0.05), sizeEnd: 0.01, life: 0.22, drag: 0,
        });
      }
    }
    void def;
  }

  castEnd(): void {
    this.charge.group.visible = false;
    this.orbBoost = 0;
  }

  projectileStart(_def: SpellDef, p: Projectile): void {
    const slot = this.bolts.find((b) => b.id < 0) ?? this.bolts[0];
    slot.id = p.id;
    slot.orb.group.visible = true;
    slot.orb.set(p.position, this.look.bolt, 1);
    // launch burst at the tip
    for (let i = 0; i < 18; i++) {
      const d = randomDir();
      const v = rand(1.0, 3.0);
      this.particles.spawn({
        x: p.position.x, y: p.position.y, z: p.position.z,
        vx: d.x * v + p.direction.x * 2, vy: d.y * v + p.direction.y * 2, vz: d.z * v + p.direction.z * 2,
        ...this.rgb(1, rand(0.45, 0.8), 0.1), size: rand(0.08, 0.16), sizeEnd: 0.02, life: rand(0.15, 0.3), drag: 4,
      });
    }
  }

  projectileUpdate(_def: SpellDef, p: Projectile): void {
    const slot = this.bolts.find((b) => b.id === p.id);
    if (!slot) return;
    slot.orb.set(p.position, this.look.bolt, 1);
    // flame trail along the path travelled this frame: density per metre, so it stays a
    // continuous trail at any frame rate
    const n = Math.min(48, Math.max(3, Math.ceil(p.previous.distanceTo(p.position) * 26)));
    for (let i = 0; i < n; i++) {
      this.q.lerpVectors(p.previous, p.position, i / n);
      const d = randomDir();
      const hot = Math.random();
      this.particles.spawn({
        x: this.q.x + d.x * 0.03, y: this.q.y + d.y * 0.03, z: this.q.z + d.z * 0.03,
        vx: d.x * 0.35 - p.direction.x * 0.8, vy: d.y * 0.35 + 0.25, vz: d.z * 0.35 - p.direction.z * 0.8,
        ...this.rgb(1, 0.22 + 0.45 * hot, 0.03 + 0.1 * hot), size: rand(0.2, 0.3), sizeEnd: 0.03, life: rand(0.16, 0.28), drag: 2.5, alpha: 0.85,
      });
    }
    // a few sparks thrown off
    for (let i = 0; i < 2; i++) {
      const d = randomDir();
      const v = rand(1.5, 3.0);
      this.particles.spawn({
        x: p.position.x, y: p.position.y, z: p.position.z,
        vx: d.x * v, vy: d.y * v + 0.5, vz: d.z * v,
        ...this.rgb(1, rand(0.75, 0.95), 0.4), size: rand(0.025, 0.045), sizeEnd: 0.008, life: rand(0.2, 0.4), drag: 1.5, gravity: -6,
      });
    }
    this.orbLight.position.copy(p.position);
    this.orbBoost = 1.0;
  }

  projectileEnd(_def: SpellDef, p: Projectile, impact: Impact): void {
    const slot = this.bolts.find((b) => b.id === p.id);
    if (slot) {
      slot.id = -1;
      slot.orb.group.visible = false;
    }
    this.orbBoost = 0;
    if (impact.kind === 'range') {
      // fizzles out: a small puff, no blast
      for (let i = 0; i < 24; i++) {
        const d = randomDir();
        const v = rand(0.3, 1.2);
        this.particles.spawn({
          x: impact.point.x, y: impact.point.y, z: impact.point.z, vx: d.x * v, vy: d.y * v + 0.4, vz: d.z * v,
          ...this.rgb(1, rand(0.3, 0.6), 0.06), size: rand(0.12, 0.22), sizeEnd: 0.02, life: rand(0.25, 0.5), drag: 3, alpha: 0.7,
        });
      }
      return;
    }
    const e = this.explosions.find((x) => !x.active) ?? this.explosions[0];
    e.start(impact.point, this.particles, p.direction);
    // a little in front of the surface it hit, so it lights the target instead of burning it white
    this.blastLight.position.copy(impact.point).addScaledVector(p.direction, -0.6);
  }

  update(dt: number): void {
    let flash = 0;
    for (const e of this.explosions) flash = Math.max(flash, e.update(dt));
    this.blastLight.intensity = this.look.blastLight * flash;
    this.orbLight.intensity = this.orbBoost > 0 ? (0.6 + 0.35 * Math.random()) * this.orbBoost : 0;
    this.particles.update(dt);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.particles.dispose();
    this.charge.dispose();
    for (const b of this.bolts) b.orb.dispose();
    for (const e of this.explosions) e.dispose();
    this.glow.dispose();
    this.ring.dispose();
    this.sphere.dispose();
    this.plane.dispose();
  }
}
